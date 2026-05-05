import {BigNumber} from "@ethersproject/bignumber";
import {defaultAbiCoder} from "@ethersproject/abi";
import {formatUnits} from "@ethersproject/units";
import {ethers} from "ethers";
import type {Auction} from "../../typechain/Auction.js";
import type {Logger} from "../../logger.js";
import {getTxDetails} from "../utils.js";
import type {MultiProvider} from "@hyperlane-xyz/sdk";
import {getTokenDecimals, getTokenSymbol} from "./utils.js";
import {bytes32ToAddress} from "@hyperlane-xyz/utils";
import {chainIdsToName} from "../../config/index.js";
import type {IntentData} from "./types.js";
import * as OrderEncoder from "../../lib/OrderEncoder.js";

export class AuctionManager {
    constructor(
        private readonly auctionCt: Auction,
        private readonly signer: ethers.Signer,
        private readonly multiProvider: MultiProvider,
        private readonly log: Logger,
        private readonly pollInterval: number = 3000,
    ) {}

    /**
     * Commit phase: generate salt, compute hash, submit commitment
     */
    async commitQuote(
        orderId: string,
        outputAmount: BigNumber,
        data: IntentData,
    ): Promise<{salt: string; outputAmount: BigNumber}> {
        const fillerAddress = await this.signer.getAddress();

        // Check if already committed
        const alreadyCommitted = await this.auctionCt.hasSolverCommitted(
            orderId,
            fillerAddress,
        );

        if (alreadyCommitted) {
            this.log.info({
                msg: "Already committed",
                orderId,
            });
            // Return dummy salt — we won't need to reveal again
            return {salt: ethers.constants.HashZero, outputAmount};
        }

        // Generate random salt
        const salt = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        // Compute commit hash: keccak256(abi.encode(orderId, outputAmount, salt))
        const commitHash = ethers.utils.keccak256(
            defaultAbiCoder.encode(
                ["bytes32", "uint256", "bytes32"],
                [orderId, outputAmount, salt],
            ),
        );

        this.log.info({
            msg: "Committing quote",
            orderId,
            amount: outputAmount.toString(),
        });

        const tx = await this.auctionCt.commit(orderId, commitHash);
        const receipt = await tx.wait();

        const chainId = data.fillInstructions[0].destinationChainId.toString();

        this.log.info({
            msg: "Quote committed",
            orderId,
            txDetails: getTxDetails(receipt.transactionHash, this.multiProvider, chainId),
            txHash: receipt.transactionHash,
        });

        return {salt, outputAmount};
    }

    /**
     * Reveal phase: reveal the committed amount and salt
     */
    async revealQuote(
        orderId: string,
        outputAmount: BigNumber,
        salt: string,
        data: IntentData,
    ): Promise<void> {
        this.log.info({
            msg: "Revealing quote",
            orderId,
            amount: outputAmount.toString(),
        });

        const tx = await this.auctionCt.reveal(orderId, outputAmount, salt);
        const receipt = await tx.wait();

        const chainId = data.fillInstructions[0].destinationChainId.toString();

        this.log.info({
            msg: "Quote revealed",
            orderId,
            amount: outputAmount.toString(),
            txDetails: getTxDetails(receipt.transactionHash, this.multiProvider, chainId),
            txHash: receipt.transactionHash,
        });
    }

    /**
     * Wait for commit phase to end using precise sleep based on deadline
     */
    async waitForCommitEnd(orderId: string): Promise<void> {
        const commitDeadline = await this.auctionCt.getCommitDeadline(orderId);
        const chainName = await this.getChainName(orderId);
        const provider = this.multiProvider.getProvider(chainName);
        const block = await provider.getBlock("latest");

        const waitMs = (commitDeadline.toNumber() - block.timestamp) * 1000;

        if (waitMs > 0) {
            this.log.info({
                msg: "Waiting for commit phase to end",
                orderId,
                commitDeadline: commitDeadline.toNumber(),
                waitSeconds: Math.ceil(waitMs / 1000),
            });
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        this.log.info({msg: "Commit phase ended", orderId});
    }

    /**
     * Wait for auction to fully end (after reveal phase)
     */
    async waitForAuctionEnd(orderId: string): Promise<void> {
        const revealDeadline = await this.auctionCt.getRevealDeadline(orderId);

        this.log.info({
            msg: "Waiting for auction to end",
            orderId,
            revealDeadline: revealDeadline.toNumber(),
        });

        while (true) {
            const ended = await this.auctionCt.isAuctionEnded(orderId);
            if (ended) {
                this.log.info({msg: "Auction ended", orderId});
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
        }
    }

    /**
     * Check auction winner. Returns winningAmount if we won, undefined otherwise.
     */
    async getWinner(
        orderId: string,
        data: IntentData,
    ): Promise<BigNumber | undefined> {
        const fillerAddress = await this.signer.getAddress();

        const quoteCount = await this.auctionCt.getQuoteCount(orderId);
        if (quoteCount.eq(0)) {
            this.log.info({
                msg: "No quotes revealed — cannot fill",
                orderId,
            });
            return undefined;
        }

        const [winnerAddress, winningAmount] = await this.auctionCt.getWinner(orderId);

        const isWinner = winnerAddress.toLowerCase() === fillerAddress.toLowerCase();

        // Get token info for logging
        const originData = data.fillInstructions[0].originData;
        const orderData = OrderEncoder.decode(originData);
        const destinationChainName = chainIdsToName[orderData.destinationDomain.toString()];
        const outputToken = bytes32ToAddress(orderData.outputToken);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, this.multiProvider);
        const outputSymbol = await getTokenSymbol(outputToken, destinationChainName, this.multiProvider);
        const formattedAmount = `${formatUnits(winningAmount, outputDecimals)} ${outputSymbol}`;

        this.log.info({
            msg: isWinner ? "Won auction" : "Not the auction winner",
            orderId,
            winner: winnerAddress,
            chainName: destinationChainName,
            winningAmount: winningAmount.toString(),
            formattedAmount,
        });

        return isWinner ? winningAmount : undefined;
    }

    /**
     * Check if auction has already ended
     */
    async isAuctionEnded(orderId: string): Promise<boolean> {
        return this.auctionCt.isAuctionEnded(orderId);
    }

    /**
     * Get gas cost for claimOrder
     */
    async getOrderGasCost(orderId: string): Promise<BigNumber> {
        return this.auctionCt.getOrderGasCost(orderId);
    }

    /**
     * Wait for AuctionRestarted event after losing the auction.
     * Winner may get disqualified during claim, restarting the auction.
     */
    waitForAuctionRestart(orderId: string): Promise<boolean> {
        const TIMEOUT_MS = 30_000;

        this.log.info({
            msg: "Waiting for possible auction restart",
            orderId,
            timeoutMs: TIMEOUT_MS,
        });

        return new Promise<boolean>((resolve) => {
            const filter = this.auctionCt.filters.AuctionRestarted(orderId);

            const timeout = setTimeout(() => {
                this.auctionCt.off(filter, handler);
                resolve(false);
            }, TIMEOUT_MS);

            const handler = () => {
                clearTimeout(timeout);
                this.auctionCt.off(filter, handler);
                this.log.info({
                    msg: "AuctionRestarted event received, re-entering auction",
                    orderId,
                });
                resolve(true);
            };

            this.auctionCt.on(filter, handler);
        });
    }

    /**
     * Resolve chainName from auction contract's provider
     */
    private async getChainName(orderId: string): Promise<string> {
        const network = await this.auctionCt.provider.getNetwork();
        return chainIdsToName[network.chainId.toString()];
    }
}

import {BigNumber} from "@ethersproject/bignumber";
import {formatUnits} from "@ethersproject/units";
import type {MultiProvider} from "@hyperlane-xyz/sdk";
import {bytes32ToAddress} from "@hyperlane-xyz/utils";

import {Router__factory} from "../../typechain/factories/Router__factory.js";
import {Auction__factory} from "../../typechain/factories/Auction__factory.js";
import {SolverEscrow__factory} from "../../typechain/factories/SolverEscrow__factory.js";
import type {OpenEventArgs, IntentData, RouterMetadata} from "./types.js";
import {log, getTokenDecimals, calculateSolverOutput, formatTokenAmount} from "./utils.js";
import * as OrderEncoder from "../../lib/OrderEncoder.js";
import {chainIdsToName, getTradingPairs} from "../../config/index.js";
import {
    retrieveOriginInfo,
    retrieveTargetInfo, retrieveTokenBalance,
    getTxDetails,
} from "../utils.js";
import {BasePrepare, type BaseRule} from "../BasePrepare.js";
import type {BuildRules, RulesMap} from "../types.js";
import {metadata} from "./config/index.js";
import {AuctionManager} from "./auction.js";

export type RouterRule = BaseRule<RouterMetadata, OpenEventArgs, IntentData>;

class RouterPrepare extends BasePrepare<
    RouterMetadata,
    OpenEventArgs,
    IntentData
> {
    private destinationCt!: any;
    private auctionManager!: AuctionManager;
    private destinationSigner!: any;

    constructor(
        multiProvider: MultiProvider,
        rules?: BuildRules<RouterRule>,
    ) {
        super(multiProvider, metadata, log, rules);
    }

    /**
     * Pre-commit checks: collateral and balance
     */
    private async preCommitChecks(
        orderId: string,
        outputAmount: BigNumber,
        data: IntentData,
    ): Promise<void> {
        const fillerAddress = await this.destinationSigner.getAddress();
        const chainId = data.fillInstructions[0].destinationChainId.toString();
        const tokenAddress = bytes32ToAddress(data.maxSpent[0].token);

        // Check escrow collateral
        const escrowAddress = await this.destinationCt.SOLVER_ESCROW();
        const escrow = SolverEscrow__factory.connect(escrowAddress, this.destinationSigner);
        const hasCollateral = await escrow.hasMinCollateral(fillerAddress, tokenAddress, outputAmount);

        if (!hasCollateral) {
            const [total, locked, available] = await escrow.getBalance(fillerAddress, tokenAddress);
            const required = await escrow.getCollateralAmount(outputAmount);
            throw new Error(
                `Insufficient escrow collateral on chain ${chainId}. ` +
                `Required: ${required.toString()}, Available: ${available.toString()}, ` +
                `Total: ${total.toString()}, Locked: ${locked.toString()}`
            );
        }

        // Check balance
        const provider = this.multiProvider.getProvider(chainId);
        const balance = await retrieveTokenBalance(tokenAddress, fillerAddress, provider);

        if (balance.lt(outputAmount)) {
            this.log.warn({
                msg: "Insufficient balance on destination chain",
                orderId,
                chainId,
                tokenAddress,
                need: outputAmount.toString(),
                have: balance.toString(),
            });
        }
    }

    /**
     * Calculate best output amount for competitive bidding
     */
    async calculateBestOutput(
        data: IntentData
    ): Promise<BigNumber> {
        const originData = data.fillInstructions[0].originData;
        const orderData = OrderEncoder.decode(originData);

        const originDomainId = orderData.originDomain;
        const destinationDomainId = orderData.destinationDomain;

        const {chainIdsToName} = await import("../../config/index.js");
        const originChainName = chainIdsToName[originDomainId.toString()];
        const destinationChainName = chainIdsToName[destinationDomainId.toString()];

        const inputToken = bytes32ToAddress(orderData.inputToken);
        const outputToken = bytes32ToAddress(orderData.outputToken);
        const inputAmount = orderData.amountIn;
        const minOutputAmount = orderData.amountOut;

        const pairs = await getTradingPairs();
        const pair = pairs.find(
            (p) =>
                p.originChain === originChainName &&
                p.destinationChain === destinationChainName &&
                p.inputToken.toLowerCase() === inputToken.toLowerCase() &&
                p.outputToken.toLowerCase() === outputToken.toLowerCase()
        );

        if (!pair) {
            throw new Error(`Trading pair not found: ${originChainName}:${inputToken} → ${destinationChainName}:${outputToken}`);
        }

        const inputDecimals = await getTokenDecimals(inputToken, originChainName, this.multiProvider);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, this.multiProvider);

        const boostedOutput = calculateSolverOutput(
            inputAmount,
            pair.rate as number,
            inputDecimals,
            outputDecimals,
            pair.quoteTolerance
        );

        if (boostedOutput.lt(minOutputAmount)) {
            throw new Error(`Cannot fulfill order. Boosted output: ${formatUnits(boostedOutput, outputDecimals)}, User minimum: ${formatUnits(minOutputAmount, outputDecimals)}`);
        }

        const [minRequiredFormatted, boostedOutputFormatted] = await Promise.all([
            formatTokenAmount(minOutputAmount, outputToken, destinationChainName, this.multiProvider),
            formatTokenAmount(boostedOutput, outputToken, destinationChainName, this.multiProvider),
        ]);

        this.log.info({
            msg: "Calculated competitive quote",
            rate: pair.rate,
            minRequired: minRequiredFormatted,
            boostedOutput: boostedOutputFormatted,
            quoteTolerance: `${(pair.quoteTolerance * 100).toFixed(1)}%`,
        });

        return boostedOutput;
    }

    /**
     * Claim order on router after winning auction.
     * @returns true if claimed, false if auction was restarted
     */
    private async claimOrder(
        parsedArgs: OpenEventArgs,
        data: IntentData
    ): Promise<boolean> {
        const originData = data.fillInstructions[0].originData;

        this.log.info({
            msg: "Claiming order",
            orderId: parsedArgs.orderId,
        });

        const tx = await this.destinationCt.claimOrder(
            parsedArgs.orderId,
            originData,
        );

        const receipt = await tx.wait();
        const _chainId = data.fillInstructions[0].destinationChainId.toString();
        const txDetails = getTxDetails(receipt.transactionHash, this.multiProvider, _chainId);

        // Check if auction was restarted (winner lacked collateral)
        const restartedEvent = receipt.events?.find(
            (e: any) => e.event === "AuctionRestarted"
        );

        if (restartedEvent) {
            this.log.warn({
                msg: "Auction restarted — winner disqualified for insufficient collateral",
                orderId: parsedArgs.orderId,
                disqualifiedSolver: restartedEvent.args?.disqualifiedSolver,
                txDetails,
                txHash: receipt.transactionHash,
            });
            return false;
        }

        this.log.info({
            msg: "Order claimed",
            orderId: parsedArgs.orderId,
            txDetails,
            txHash: receipt.transactionHash,
        });
        return true;
    }

    protected async retrieveOriginInfo(parsedArgs: OpenEventArgs) {
        const originTokens = parsedArgs.resolvedOrder.minReceived.map(
            ({amount, chainId, token}) => {
                const tokenAddress = bytes32ToAddress(token);
                const chainName = chainIdsToName[chainId.toString()];
                return {amount, chainName, tokenAddress};
            },
        );

        return retrieveOriginInfo({
            multiProvider: this.multiProvider,
            tokens: originTokens,
        });
    }

    protected async retrieveTargetInfo(parsedArgs: OpenEventArgs) {
        const targetTokens = parsedArgs.resolvedOrder.maxSpent.map(
            ({amount, chainId, token}) => {
                const tokenAddress = bytes32ToAddress(token);
                const chainName = chainIdsToName[chainId.toString()];
                return {amount, chainName, tokenAddress};
            },
        );

        return retrieveTargetInfo({
            multiProvider: this.multiProvider,
            tokens: targetTokens,
        });
    }

    /**
     * Run auction round: commit → reveal → winner → claim
     * On loss, waits for possible AuctionRestarted and retries recursively.
     */
    private async runAuctionRound(
        parsedArgs: OpenEventArgs,
        data: IntentData,
    ): Promise<{shouldFill: boolean; winningAmount?: BigNumber}> {
        const auctionEnded = await this.auctionManager.isAuctionEnded(parsedArgs.orderId);

        if (auctionEnded) {
            this.log.info({
                msg: "Auction already ended — checking winner directly",
                orderId: parsedArgs.orderId,
            });
        } else {
            // Calculate output and run pre-commit checks
            const bestOutputAmount = await this.calculateBestOutput(data);
            await this.preCommitChecks(parsedArgs.orderId, bestOutputAmount, data);

            // Commit phase
            const {salt, outputAmount} = await this.auctionManager.commitQuote(
                parsedArgs.orderId,
                bestOutputAmount,
                data,
            );

            // Wait for commit phase to end
            await this.auctionManager.waitForCommitEnd(parsedArgs.orderId);

            // Reveal phase
            await this.auctionManager.revealQuote(parsedArgs.orderId, outputAmount, salt, data);

            // Wait for auction to end
            await this.auctionManager.waitForAuctionEnd(parsedArgs.orderId);
        }

        // Check winner
        const winningAmount = await this.auctionManager.getWinner(parsedArgs.orderId, data);

        if (!winningAmount) {
            // Lost — wait for possible auction restart (winner disqualified)
            const restarted = await this.auctionManager.waitForAuctionRestart(parsedArgs.orderId);
            if (restarted) {
                return this.runAuctionRound(parsedArgs, data);
            }
            return {shouldFill: false};
        }

        // Claim on router
        const claimed = await this.claimOrder(parsedArgs, data);

        if (claimed) {
            return {shouldFill: true, winningAmount};
        }

        // We were disqualified — don't retry
        return {shouldFill: false};
    }

    /**
     * Prepare order for filling — handles auction logic
     */
    protected async prepare(
        parsedArgs: OpenEventArgs,
        originChainName: string,
        blockNumber: number
    ): Promise<{shouldFill: boolean; winningAmount?: BigNumber}> {
        try {
            const data: IntentData = {
                fillInstructions: parsedArgs.resolvedOrder.fillInstructions,
                maxSpent: parsedArgs.resolvedOrder.maxSpent,
            };

            // Log origin/target info
            const origin = await this.retrieveOriginInfo(parsedArgs);
            const target = await this.retrieveTargetInfo(parsedArgs);

            this.log.info({
                msg: "Intent Indexed",
                intent: `${parsedArgs.orderId}`,
                origin: origin.join(", "),
                target: target.join(", "),
            });

            // Setup contracts
            const destinationSettler = bytes32ToAddress(
                data.fillInstructions[0].destinationSettler
            );
            const _chainId = data.fillInstructions[0].destinationChainId.toString();

            this.destinationSigner = this.multiProvider.getSigner(_chainId);
            this.destinationCt = Router__factory.connect(
                destinationSettler,
                this.destinationSigner
            );

            const auctionAddress = await this.destinationCt.AUCTION();
            const auctionCt = Auction__factory.connect(auctionAddress, this.destinationSigner);
            this.auctionManager = new AuctionManager(
                auctionCt,
                this.destinationSigner,
                this.multiProvider,
                this.log,
                this.defaultPollInterval,
            );

            return await this.runAuctionRound(parsedArgs, data);
        } catch (error: any) {
            this.log.error({
                msg: "Cannot process order - validation failed",
                orderId: parsedArgs.orderId,
                error: error.message,
            });
            return {shouldFill: false};
        }
    }
}

export const create = (
    multiProvider: MultiProvider,
    customRules?: RulesMap<RouterRule>,
) => {
    return new RouterPrepare(multiProvider, {
        base: [],
        custom: customRules,
    }).create();
};

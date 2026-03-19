import {BigNumber} from "@ethersproject/bignumber";
import {formatUnits} from "@ethersproject/units";
import type {MultiProvider} from "@hyperlane-xyz/sdk";
import {bytes32ToAddress} from "@hyperlane-xyz/utils";

import {LayerZeroRouter__factory} from "../../typechain/factories/LayerZeroRouter__factory.js";
import {SolverEscrow__factory} from "../../typechain/factories/SolverEscrow__factory.js";
import type {OpenEventArgs, IntentData, LayerZeroRouterMetadata} from "./types.js";
import {log, getTokenDecimals, getTokenSymbol, calculateSolverOutput} from "./utils.js";
import * as OrderEncoder from "../../lib/OrderEncoder.js";
import {chainIdsToName, tradingPairs} from "../../config/index.js";
import {
    retrieveOriginInfo,
    retrieveTargetInfo, retrieveTokenBalance,
    getTxDetails,
} from "../utils.js";
import {BasePrepare, type BaseRule} from "../BasePrepare.js";
import type {BuildRules, RulesMap} from "../types.js";
import {metadata} from "./config/index.js";

export type LayerZeroRouterRule = BaseRule<LayerZeroRouterMetadata, OpenEventArgs, IntentData>;

class LayerZeroRouterPrepare extends BasePrepare<
    LayerZeroRouterMetadata,
    OpenEventArgs,
    IntentData
> {
    private destinationCt!: any;
    private destinationSigner!: any;

    constructor(
        multiProvider: MultiProvider,
        rules?: BuildRules<LayerZeroRouterRule>,
    ) {
        super(multiProvider, metadata, log, rules);
    }

    /**
     * Submit quote during auction period
     */
    private async submitQuote(
        parsedArgs: OpenEventArgs,
        data: IntentData
    ): Promise<void> {
        const {originData} =
            data.fillInstructions[0];

        const fillerAddress = await this.destinationSigner.getAddress();


        // Decode order data
        const orderData = OrderEncoder.decode(originData);

        // Check if already quoted (on-chain deduplication)
        const alreadyQuoted = await this.destinationCt.hasSolverQuoted(
            parsedArgs.orderId,
            fillerAddress
        );

        if (alreadyQuoted) {
            this.log.info({
                msg: "Already submitted quote",
                orderId: parsedArgs.orderId,
            });
            return;
        }

        // Calculate best output amount
        const bestOutputAmount = await this.calculateBestOutput(data);

        const chainId = data.fillInstructions[0].destinationChainId.toString();
        const tokenAddress = bytes32ToAddress(data.maxSpent[0].token);

        // Check escrow collateral before submitting quote
        const escrowAddress = await this.destinationCt.solverEscrow();
        const escrow = SolverEscrow__factory.connect(escrowAddress, this.destinationSigner);
        const hasCollateral = await escrow.hasMinCollateral(fillerAddress, tokenAddress, bestOutputAmount);

        if (!hasCollateral) {
            const [total, locked, available] = await escrow.getBalance(fillerAddress, tokenAddress);
            const required = await escrow.getCollateralAmount(bestOutputAmount);
            // throw new Error(
            //     `Insufficient escrow collateral on chain ${chainId}. ` +
            //     `Required: ${required.toString()}, Available: ${available.toString()}, ` +
            //     `Total: ${total.toString()}, Locked: ${locked.toString()}`
            // );
            this.log.warn({
                msg: `Insufficient escrow collateral on chain ${chainId}. ` +
                    `Required: ${required.toString()}, Available: ${available.toString()}, ` +
                    `Total: ${total.toString()}, Locked: ${locked.toString()}`
            });

        }

        // Check if we have enough balance for this amount
        const provider = this.multiProvider.getProvider(chainId);
        const balance = await retrieveTokenBalance(tokenAddress, fillerAddress, provider);

        if (balance.lt(bestOutputAmount)) {
            // throw new Error(`Insufficient balance on chain ${chainId} for ${tokenAddress}. Need ${bestOutputAmount.toString()}, have ${balance.toString()}`);
            this.log.warn({
                msg: "Insufficient balance on destination chain",
                orderId: parsedArgs.orderId,
                chainId,
                tokenAddress,
                need: bestOutputAmount.toString(),
                have: balance.toString(),
            });
        }

        this.log.info({
            msg: "Submitting quote",
            orderId: parsedArgs.orderId,
            amount: bestOutputAmount.toString(),
        });

        // Submit quote on destination chain
        const tx = await this.destinationCt.submitQuote(
            parsedArgs.orderId,
            bestOutputAmount,
            orderData,
        );

        const receipt = await tx.wait();

        const quoteDecimals = await getTokenDecimals(tokenAddress, chainId, this.multiProvider);
        const quoteSymbol = await getTokenSymbol(tokenAddress, chainId, this.multiProvider);

        this.log.info({
            msg: "Quote submitted",
            orderId: parsedArgs.orderId,
            amount: bestOutputAmount.toString(),
            formattedAmount: `${formatUnits(bestOutputAmount, quoteDecimals)} ${quoteSymbol}`,
            txDetails: getTxDetails(receipt.transactionHash, this.multiProvider, chainId),
            txHash: receipt.transactionHash,
        });
    }

    /**
     * Calculate best output amount for competitive bidding
     * Uses tradingPairs config to calculate market rate + quoteTolerance
     * Also used by enoughBalanceOnDestination rule
     */
    async calculateBestOutput(
        data: IntentData
    ): Promise<BigNumber> {
        const originData = data.fillInstructions[0].originData;
        const orderData = OrderEncoder.decode(originData);

        // Extract order info
        const originDomainId = orderData.originDomain;
        const destinationDomainId = orderData.destinationDomain;

        const {chainIdsToName} = await import("../../config/index.js");
        const originChainName = chainIdsToName[originDomainId.toString()];
        const destinationChainName = chainIdsToName[destinationDomainId.toString()];

        const inputToken = bytes32ToAddress(orderData.inputToken); // Assuming sender is input token address
        const outputToken = bytes32ToAddress(orderData.outputToken);
        const inputAmount = orderData.amountIn;
        const minOutputAmount = orderData.amountOut;

        // Find trading pair (already validated by checkExchangeRate rule)
        const pair = tradingPairs.find(
            (p) =>
                p.originChain === originChainName &&
                p.destinationChain === destinationChainName &&
                p.inputToken.toLowerCase() === inputToken.toLowerCase() &&
                p.outputToken.toLowerCase() === outputToken.toLowerCase()
        );

        if (!pair) {
            throw new Error(`Trading pair not found: ${originChainName}:${inputToken} → ${destinationChainName}:${outputToken}`);
        }

        // Get decimals
        const inputDecimals = await getTokenDecimals(inputToken, originChainName, this.multiProvider);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, this.multiProvider);

        // Calculate boosted output (market rate + quoteTolerance for auction)
        const boostedOutput = calculateSolverOutput(
            inputAmount,
            pair.exchangeRate,
            inputDecimals,
            outputDecimals,
            pair.quoteTolerance
        );

        // Ensure we meet minimum requirement

        if (boostedOutput.lt(minOutputAmount)) {
            throw new Error(`Cannot fulfill order. Boosted output: ${formatUnits(boostedOutput, inputDecimals)}, User minimum: ${formatUnits(minOutputAmount, outputDecimals)}`);
        }

        this.log.info({
            msg: "Calculated competitive quote",
            minRequired: minOutputAmount.toString(),
            boostedOutput: boostedOutput.toString(),
            quoteTolerance: `${(pair.quoteTolerance * 100).toFixed(1)}%`,
        });

        return boostedOutput;
    }

    /**
     * Wait for quoting period to end by polling contract
     */
    private async waitForQuotingEnd(orderId: string): Promise<void> {
        const pollInterval = 1000; // Check every 1 second

        const quotingPeriod = await this.destinationCt.quotingPeriod();

        this.log.info({
            msg: "Waiting for quoting period to end",
            quotingPeriodSeconds: quotingPeriod.toNumber(),
        });

        while (true) {
            const quotingEnded = await this.destinationCt.isQuotingEnded(orderId);

            if (quotingEnded) {
                this.log.info({
                    msg: "Quoting period ended",
                });
                return;
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }

    /**
     * Claim the order on-chain after winning the auction.
     * If the winner lacks collateral the contract resets the auction
     * and emits AuctionRestarted instead of claiming.
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
            originData
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

    /**
     * Check if this solver won the auction
     * Returns winning amount if won, undefined otherwise
     */
    private async isWinner(
        parsedArgs: OpenEventArgs,
        data: IntentData
    ): Promise<BigNumber | undefined> {
        const fillerAddress = await this.destinationSigner.getAddress();

        const originData = data.fillInstructions[0].originData;
        const orderData = OrderEncoder.decode(originData);

        // Check if there are any quotes
        const quoteCount = await this.destinationCt.getQuoteCount(parsedArgs.orderId);
        if (quoteCount.eq(0)) {
            this.log.info({
                msg: "No quotes submitted - cannot fill",
                orderId: parsedArgs.orderId,
            });
            return undefined;
        }

        // Get winner from contract
        const [winnerAddress, winningAmount] = await this.destinationCt.getWinner(
            parsedArgs.orderId,
        );

        const isWinner =
            winnerAddress.toLowerCase() === fillerAddress.toLowerCase();

        // Get network and token info for logging
        const destinationChainName = chainIdsToName[orderData.destinationDomain.toString()];
        const outputToken = bytes32ToAddress(orderData.outputToken);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, this.multiProvider);
        const outputSymbol = await getTokenSymbol(outputToken, destinationChainName, this.multiProvider);
        const formattedAmount = `${formatUnits(winningAmount, outputDecimals)} ${outputSymbol}`;

        const msg = {
            msg: isWinner ? "Won auction" : "Not the auction winner",
            orderId: parsedArgs.orderId,
            winner: winnerAddress,
            chainName: destinationChainName,
            winningAmount: winningAmount.toString(),
            formattedAmount,
        }
        this.log.info(msg);

        if (!isWinner) {
            return undefined;
        }

        return winningAmount;
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
     * Run one auction round: submit quote (if needed) → wait → check winner → claim
     * @returns shouldFill + winningAmount if claimed, or loops again on AuctionRestarted
     */
    private async runAuctionRound(
        parsedArgs: OpenEventArgs,
        data: IntentData,
    ): Promise<{ shouldFill: boolean; winningAmount?: BigNumber }> {
        // PHASE DETECTION: Check if quoting period has ended
        const quotingEnded = await this.destinationCt.isQuotingEnded(parsedArgs.orderId);

        if (quotingEnded) {
            this.log.info({
                msg: "Quoting already ended - checking winner directly",
                orderId: parsedArgs.orderId,
            });
        } else {
            this.log.info({
                msg: "Quoting phase active",
                orderId: parsedArgs.orderId,
            });

            await this.submitQuote(parsedArgs, data);
            await this.waitForQuotingEnd(parsedArgs.orderId);
        }

        const winningAmount = await this.isWinner(parsedArgs, data);

        if (!winningAmount) {
            return {shouldFill: false};
        }

        const claimed = await this.claimOrder(parsedArgs, data);

        if (claimed) {
            return {shouldFill: true, winningAmount};
        }

        // Auction was restarted — re-enter auction loop
        this.log.info({
            msg: "Re-entering auction after restart",
            orderId: parsedArgs.orderId,
        });
        return this.runAuctionRound(parsedArgs, data);
    }

    /**
     * Prepare order for filling - handles auction logic
     * Returns object with shouldFill flag and winningAmount if won
     */
    protected async prepare(
        parsedArgs: OpenEventArgs,
        originChainName: string,
        blockNumber: number
    ): Promise<{ shouldFill: boolean; winningAmount?: BigNumber }> {
        try {
            // Extract intent data
            const data: IntentData = {
                fillInstructions: parsedArgs.resolvedOrder.fillInstructions,
                maxSpent: parsedArgs.resolvedOrder.maxSpent,
            };

            // Retrieve and log origin/target info
            const origin = await this.retrieveOriginInfo(parsedArgs);
            const target = await this.retrieveTargetInfo(parsedArgs);

            this.log.info({
                msg: "Intent Indexed",
                intent: `${parsedArgs.orderId}`,
                origin: origin.join(", "),
                target: target.join(", "),
            });

            // Setup destination contract (reused across all methods)
            const destinationSettler = bytes32ToAddress(
                data.fillInstructions[0].destinationSettler
            );
            const _chainId = data.fillInstructions[0].destinationChainId.toString();

            this.destinationSigner = this.multiProvider.getSigner(_chainId);
            this.destinationCt = LayerZeroRouter__factory.connect(
                destinationSettler,
                this.destinationSigner
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
    customRules?: RulesMap<LayerZeroRouterRule>,
) => {
    return new LayerZeroRouterPrepare(multiProvider, {
        base: [],
        custom: customRules,
    }).create();
};

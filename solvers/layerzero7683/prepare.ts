import {BigNumber} from "@ethersproject/bignumber";
import {formatUnits} from "@ethersproject/units";
import type {MultiProvider} from "@hyperlane-xyz/sdk";
import {bytes32ToAddress} from "@hyperlane-xyz/utils";

import {LayerZero7683__factory} from "../../typechain/factories/layerzero7683/contracts/LayerZero7683__factory.js";
import type {OpenEventArgs, IntentData, Layerzero7683Metadata} from "./types.js";
import {log, getTokenDecimals, calculateSolverOutput} from "./utils.js";
import * as OrderEncoder from "../../lib/OrderEncoder.js";
import {chainIdsToName, tradingPairs} from "../../config/index.js";
import {
    retrieveOriginInfo,
    retrieveTargetInfo,
} from "../utils.js";
import {BasePrepare, type BaseRule} from "../BasePrepare.js";
import type {BuildRules, RulesMap} from "../types.js";
import {metadata} from "./config/index.js";

export type LayerZero7683Rule = BaseRule<Layerzero7683Metadata, OpenEventArgs, IntentData>;

class LayerZero7683Prepare extends BasePrepare<
    Layerzero7683Metadata,
    OpenEventArgs,
    IntentData
> {
    private destinationCt!: any;
    private destinationSigner!: any;

    constructor(
        multiProvider: MultiProvider,
        rules?: BuildRules<LayerZero7683Rule>,
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

        this.log.info({
            msg: "Submitting quote",
            orderId: parsedArgs.orderId,
            amount: bestOutputAmount.toString(),
        });

        // Submit quote on destination chain
        const tx = await this.destinationCt.submitQuote(
            parsedArgs.orderId,
            bestOutputAmount,
            orderData
        );

        const receipt = await tx.wait();
        const baseUrl =
            this.destinationSigner.blockExplorers?.[0].url;

        const txInfo = baseUrl
            ? `${baseUrl}/tx/${receipt.transactionHash}`
            : receipt.transactionHash;

        this.log.info({
            msg: "Quote submitted",
            orderId: parsedArgs.orderId,
            amount: bestOutputAmount.toString(),
            txDetails: txInfo,
            txHash: receipt.transactionHash,
        });
    }

    /**
     * Calculate best output amount for competitive bidding
     * Uses tradingPairs config to calculate market rate + quoteTolerance
     */
    private async calculateBestOutput(
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
            throw new Error(`Cannot fulfill order. Boosted output: ${boostedOutput.toString()}, User minimum: ${minOutputAmount.toString()}`);
        }

        this.log.info({
            msg: "Calculated competitive quote",
            minRequired: minOutputAmount.toString(),
            boostedOutput: boostedOutput.toString(),
            boostPercent: `${(pair.quoteTolerance * 100).toFixed(1)}%`,
        });

        return boostedOutput;
    }

    /**
     * Wait for quoting period to end by polling contract
     */
    private async waitForQuotingEnd(orderData: any): Promise<void> {
        const pollInterval = 1000; // Check every 1 second

        const quotingPeriod = await this.destinationCt.quotingPeriod();

        this.log.info({
            msg: "Waiting for quoting period to end",
            quotingPeriodSeconds: quotingPeriod.toNumber(),
        });

        while (true) {
            const quotingEnded = await this.destinationCt.isQuotingEnded(orderData);

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
        const hasQuotes = await this.destinationCt.hasQuotes(parsedArgs.orderId);
        if (!hasQuotes) {
            this.log.info({
                msg: "No quotes submitted - cannot fill",
                orderId: parsedArgs.orderId,
            });
            return undefined;
        }

        // Get winner from contract
        const [winnerAddress, winningAmount] = await this.destinationCt.getWinner(
            parsedArgs.orderId,
            orderData
        );

        const isWinner =
            winnerAddress.toLowerCase() === fillerAddress.toLowerCase();

        // Get network and token info for logging
        const destinationChainName = chainIdsToName[orderData.destinationDomain.toString()];
        const outputToken = bytes32ToAddress(orderData.outputToken);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, this.multiProvider);
        const formattedAmount = formatUnits(winningAmount, outputDecimals);

        const msg = {
            msg: isWinner ? "Won auction" : "Not the auction winner",
            orderId: parsedArgs.orderId,
            winner: winnerAddress,
            network: destinationChainName,
            decimals: outputDecimals,
            winningAmount: winningAmount.toString(),
            formattedAmount: formattedAmount,
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

            // Decode order data to check auction phase
            const originData = data.fillInstructions[0].originData;
            const orderData = OrderEncoder.decode(originData);

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
            this.destinationCt = LayerZero7683__factory.connect(
                destinationSettler,
                this.destinationSigner
            );

            // PHASE DETECTION: Check if quoting period has ended
            const quotingEnded = await this.destinationCt.isQuotingEnded(orderData);

            if (quotingEnded) {
                // Quoting already ended, skip to winner check
                this.log.info({
                    msg: "Quoting already ended - checking winner directly",
                    orderId: parsedArgs.orderId,
                });
            } else {
                // QUOTING PHASE: Submit quote and wait for period to end
                this.log.info({
                    msg: "Quoting phase active",
                    orderId: parsedArgs.orderId,
                });

                await this.submitQuote(parsedArgs, data);

                // Wait for quoting period to end
                await this.waitForQuotingEnd(orderData);
            }

            const winningAmount = await this.isWinner(parsedArgs, data);

            if (winningAmount) {
                return {shouldFill: true, winningAmount};
            } else {
                return {shouldFill: false};
            }
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
    customRules?: RulesMap<LayerZero7683Rule>,
) => {
    return new LayerZero7683Prepare(multiProvider, {
        base: [],
        custom: customRules,
    }).create();
};

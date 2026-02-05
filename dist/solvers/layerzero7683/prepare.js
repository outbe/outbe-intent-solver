import { BigNumber } from "@ethersproject/bignumber";
import { bytes32ToAddress } from "@hyperlane-xyz/utils";
import { LayerZero7683__factory } from "../../typechain/factories/layerzero7683/contracts/LayerZero7683__factory.js";
import { log, getTokenDecimals } from "./utils.js";
import * as OrderEncoder from "../../lib/OrderEncoder.js";
import { tradingPairs } from "../../config/index.js";
class LayerZero7683Prepare {
    multiProvider;
    constructor(multiProvider) {
        this.multiProvider = multiProvider;
    }
    /**
     * Submit quote during auction period
     */
    async submitQuote(parsedArgs, data) {
        const { destinationChainId, destinationSettler, originData } = data.fillInstructions[0];
        const _chainId = destinationChainId.toString();
        const destinationSettlerAddress = bytes32ToAddress(destinationSettler);
        const filler = this.multiProvider.getSigner(_chainId);
        const fillerAddress = await filler.getAddress();
        const destination = LayerZero7683__factory.connect(destinationSettlerAddress, filler);
        // Decode order data
        const orderData = OrderEncoder.decode(originData);
        // Check if already quoted (on-chain deduplication)
        const alreadyQuoted = await destination.hasSolverQuoted(parsedArgs.orderId, fillerAddress);
        if (alreadyQuoted) {
            log.info({
                msg: "Already submitted quote",
                orderId: parsedArgs.orderId,
            });
            return;
        }
        // Calculate best output amount
        const bestOutputAmount = await this.calculateBestOutput(parsedArgs, data);
        log.info({
            msg: "Submitting quote",
            orderId: parsedArgs.orderId,
            amount: bestOutputAmount.toString(),
        });
        // Submit quote on destination chain
        const tx = await destination.submitQuote(parsedArgs.orderId, bestOutputAmount, orderData);
        const receipt = await tx.wait();
        const baseUrl = this.multiProvider.getChainMetadata(_chainId).blockExplorers?.[0].url;
        const txInfo = baseUrl
            ? `${baseUrl}/tx/${receipt.transactionHash}`
            : receipt.transactionHash;
        log.info({
            msg: "Quote submitted",
            orderId: parsedArgs.orderId,
            amount: bestOutputAmount.toString(),
            txDetails: txInfo,
            txHash: receipt.transactionHash,
        });
    }
    /**
     * Calculate best output amount for competitive bidding
     * Uses tradingPairs config to calculate market rate + quoteBoost
     */
    async calculateBestOutput(parsedArgs, data) {
        const originData = data.fillInstructions[0].originData;
        const orderData = OrderEncoder.decode(originData);
        // Extract order info
        const originDomainId = orderData.originDomain;
        const destinationDomainId = orderData.destinationDomain;
        const { chainIdsToName } = await import("../../config/index.js");
        const originChainName = chainIdsToName[originDomainId.toString()];
        const destinationChainName = chainIdsToName[destinationDomainId.toString()];
        const inputToken = bytes32ToAddress(orderData.sender); // Assuming sender is input token address
        const outputToken = bytes32ToAddress(orderData.outputToken);
        const inputAmount = BigNumber.from(orderData.amountIn);
        const minOutputAmount = BigNumber.from(orderData.amountOut);
        // Find trading pair
        const pair = tradingPairs.find((p) => p.originChain === originChainName &&
            p.destinationChain === destinationChainName &&
            p.inputToken.toLowerCase() === inputToken.toLowerCase() &&
            p.outputToken.toLowerCase() === outputToken.toLowerCase());
        if (!pair) {
            // No pair configured - return minimum required
            log.warn({
                msg: "No trading pair found, using minimum required",
                route: `${originChainName}:${inputToken} → ${destinationChainName}:${outputToken}`,
            });
            return minOutputAmount;
        }
        // Get decimals
        const inputDecimals = await getTokenDecimals(inputToken, originChainName, this.multiProvider);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, this.multiProvider);
        // Calculate market output
        const inputFloat = Number(inputAmount.toString()) / 10 ** inputDecimals;
        const marketOutputFloat = inputFloat * pair.exchangeRate;
        // Apply quoteBoost to win auction
        const boostedOutputFloat = marketOutputFloat * (1 + pair.quoteBoost);
        const boostedOutput = BigNumber.from(Math.floor(boostedOutputFloat * 10 ** outputDecimals).toString());
        // Ensure we meet minimum requirement
        const finalOutput = boostedOutput.gt(minOutputAmount) ? boostedOutput : minOutputAmount;
        log.debug({
            msg: "Calculated competitive quote",
            minRequired: minOutputAmount.toString(),
            marketOutput: Math.floor(marketOutputFloat * 10 ** outputDecimals).toString(),
            boostedOutput: boostedOutput.toString(),
            finalOffering: finalOutput.toString(),
            boostPercent: `${(pair.quoteBoost * 100).toFixed(1)}%`,
        });
        return finalOutput;
    }
    /**
     * Check if this solver won the auction
     * Returns winning amount if won, undefined otherwise
     */
    async isWinner(parsedArgs, data) {
        const destinationSettler = bytes32ToAddress(data.fillInstructions[0].destinationSettler);
        const _chainId = data.fillInstructions[0].destinationChainId.toString();
        const provider = this.multiProvider.getProvider(_chainId);
        const filler = this.multiProvider.getSigner(_chainId);
        const fillerAddress = await filler.getAddress();
        const destination = LayerZero7683__factory.connect(destinationSettler, provider);
        const originData = data.fillInstructions[0].originData;
        const orderData = OrderEncoder.decode(originData);
        // Check if there are any quotes
        const hasQuotes = await destination.hasQuotes(parsedArgs.orderId);
        if (!hasQuotes) {
            log.info({
                msg: "No quotes submitted - cannot fill",
                orderId: parsedArgs.orderId,
            });
            return undefined;
        }
        // Get winner from contract
        const [winnerAddress, winningAmount] = await destination.getWinner(parsedArgs.orderId, orderData);
        const isWinner = winnerAddress.toLowerCase() === fillerAddress.toLowerCase();
        if (!isWinner) {
            log.info({
                msg: "Not the auction winner",
                orderId: parsedArgs.orderId,
                winner: winnerAddress,
                winningAmount: winningAmount.toString(),
            });
            return undefined;
        }
        log.info({
            msg: "Won auction - ready to fill",
            orderId: parsedArgs.orderId,
            winningAmount: winningAmount.toString(),
        });
        return winningAmount;
    }
    /**
     * Prepare order for filling - handles auction logic
     * Returns object with shouldFill flag and winningAmount if won
     */
    async prepare(parsedArgs, originChainName, blockNumber) {
        // Extract intent data
        const data = {
            fillInstructions: parsedArgs.resolvedOrder.fillInstructions,
            maxSpent: parsedArgs.resolvedOrder.maxSpent,
        };
        // Decode order data to check auction phase
        const originData = data.fillInstructions[0].originData;
        const orderData = OrderEncoder.decode(originData);
        // Get destination router to check quoting deadline
        const destinationSettler = bytes32ToAddress(data.fillInstructions[0].destinationSettler);
        const _chainId = data.fillInstructions[0].destinationChainId.toString();
        const provider = this.multiProvider.getProvider(_chainId);
        const destination = LayerZero7683__factory.connect(destinationSettler, provider);
        // PHASE DETECTION: Check if quoting period has ended
        const quotingEnded = await destination.isQuotingEnded(orderData);
        if (!quotingEnded) {
            // QUOTING PHASE: Submit quote instead of filling
            log.info({
                msg: "Quoting phase active",
                orderId: parsedArgs.orderId,
            });
            await this.submitQuote(parsedArgs, data);
            return { shouldFill: false }; // Don't fill yet - quoting phase
        }
        // FILLING PHASE: Check if we won the auction
        log.info({
            msg: "Filling phase - checking auction winner",
            orderId: parsedArgs.orderId,
        });
        const winningAmount = await this.isWinner(parsedArgs, data);
        if (winningAmount) {
            return { shouldFill: true, winningAmount };
        }
        else {
            return { shouldFill: false };
        }
    }
    create() {
        return (args, originChainName, blockNumber) => this.prepare(args, originChainName, blockNumber);
    }
}
export const create = (multiProvider) => {
    return new LayerZero7683Prepare(multiProvider).create();
};
//# sourceMappingURL=prepare.js.map
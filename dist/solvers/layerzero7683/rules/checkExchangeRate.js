import { bytes32ToAddress } from "@hyperlane-xyz/utils";
import { chainIdsToName, tradingPairs } from "../../../config/index.js";
import { getTokenDecimals, calculateSolverOutput } from "../utils.js";
/**
 * Check if order can be fulfilled using configured trading pairs
 * Validates that solver's exchange rate output meets user's minimum requirement
 */
export function checkExchangeRate() {
    return async (parsedArgs, context) => {
        // Extract order info
        const originChainId = parsedArgs.resolvedOrder.originChainId.toString();
        const originChainName = chainIdsToName[originChainId];
        const destinationChainId = parsedArgs.resolvedOrder.maxSpent[0].chainId.toString();
        const destinationChainName = chainIdsToName[destinationChainId];
        const inputToken = bytes32ToAddress(parsedArgs.resolvedOrder.minReceived[0].token);
        const outputToken = bytes32ToAddress(parsedArgs.resolvedOrder.maxSpent[0].token);
        const inputAmount = parsedArgs.resolvedOrder.minReceived[0].amount; // What solver receives
        const minOutputAmount = parsedArgs.resolvedOrder.maxSpent[0].amount; // What user wants
        // Find matching trading pair
        const pair = tradingPairs.find((p) => p.originChain === originChainName &&
            p.destinationChain === destinationChainName &&
            p.inputToken.toLowerCase() === inputToken.toLowerCase() &&
            p.outputToken.toLowerCase() === outputToken.toLowerCase());
        console.log(pair);
        if (!pair) {
            return {
                success: false,
                error: `No trading pair configured for ${originChainName}:${inputToken} → ${destinationChainName}:${outputToken}`,
            };
        }
        // Get token decimals dynamically
        const inputDecimals = await getTokenDecimals(inputToken, originChainName, context.multiProvider);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, context.multiProvider);
        // Calculate solver output with quoteBoost (what we'll actually offer in auction)
        const boostedOutput = calculateSolverOutput(inputAmount, pair.exchangeRate, inputDecimals, outputDecimals, pair.quoteBoost);
        // Check if boosted output meets user's minimum (this is what we'll offer in auction)
        if (boostedOutput.lt(minOutputAmount)) {
            return {
                success: false,
                error: `Cannot fulfill order. Boosted output: ${boostedOutput.toString()}, User minimum: ${minOutputAmount.toString()}`,
            };
        }
        return {
            success: true,
            data: `Order validated: boosted output=${boostedOutput.toString()}, user minimum=${minOutputAmount.toString()}`,
        };
    };
}
//# sourceMappingURL=checkExchangeRate.js.map
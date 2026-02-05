import { BigNumber } from "@ethersproject/bignumber";
import { bytes32ToAddress } from "@hyperlane-xyz/utils";
import { chainIdsToName, tradingPairs } from "../../../config/index.js";
import { getTokenDecimals } from "../utils.js";
/**
 * Check if order is profitable using configured trading pairs
 * Validates that solver's market rate output is better than user's minimum requirement
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
        if (!pair) {
            return {
                success: false,
                error: `No trading pair configured for ${originChainName}:${inputToken} → ${destinationChainName}:${outputToken}`,
            };
        }
        // Get token decimals dynamically
        const inputDecimals = await getTokenDecimals(inputToken, originChainName, context.multiProvider);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, context.multiProvider);
        // Calculate market output based on exchange rate
        const inputAmountFloat = Number(inputAmount.toString()) / 10 ** inputDecimals;
        const marketOutputFloat = inputAmountFloat * pair.exchangeRate;
        const marketOutputAmount = BigNumber.from(Math.floor(marketOutputFloat * 10 ** outputDecimals).toString());
        // Check if profitable: market output should be >= user's minimum required
        if (marketOutputAmount.lt(minOutputAmount)) {
            return {
                success: false,
                error: `Order not profitable. Market output: ${marketOutputAmount.toString()}, User wants: ${minOutputAmount.toString()}`,
            };
        }
        // Calculate profit
        const profit = marketOutputAmount.sub(minOutputAmount);
        const profitPercent = profit.mul(10000).div(marketOutputAmount).toNumber() / 100;
        return {
            success: true,
            data: `Profitable order: market=${marketOutputAmount.toString()}, user wants=${minOutputAmount.toString()}, profit=${profitPercent.toFixed(2)}%`,
        };
    };
}
//# sourceMappingURL=checkExchangeRate.js.map
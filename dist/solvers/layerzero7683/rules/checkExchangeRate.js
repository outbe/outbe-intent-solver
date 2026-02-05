import { BigNumber } from "@ethersproject/bignumber";
import { bytes32ToAddress } from "@hyperlane-xyz/utils";
import { chainIdsToName, tradingPairs } from "../../../config/index.js";
import { getTokenDecimals } from "../utils.js";
import { ethers } from "ethers";
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
        if (!pair) {
            return {
                success: false,
                error: `No trading pair configured for ${originChainName}:${inputToken} → ${destinationChainName}:${outputToken}`,
            };
        }
        // Get token decimals dynamically
        const inputDecimals = await getTokenDecimals(inputToken, originChainName, context.multiProvider);
        const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, context.multiProvider);
        // Calculate solver output based on exchange rate (all in BigNumber for precision)
        // Store exchangeRate with 18 decimals precision (Ethereum standard)
        const RATE_DECIMALS = 18;
        const exchangeRateBN = ethers.utils.parseUnits(pair.exchangeRate.toString(), RATE_DECIMALS);
        // Formula: (inputAmount * exchangeRate * 10^outputDecimals) / 10^(inputDecimals + RATE_DECIMALS)
        // This minimizes divisions and preserves precision
        const solverOutputAmount = inputAmount
            .mul(exchangeRateBN)
            .mul(BigNumber.from(10).pow(outputDecimals))
            .div(BigNumber.from(10).pow(inputDecimals + RATE_DECIMALS));
        // Check if solver can fulfill: output should be >= user's minimum required
        if (solverOutputAmount.lt(minOutputAmount)) {
            return {
                success: false,
                error: `Cannot fulfill order. Solver output: ${solverOutputAmount.toString()}, User minimum: ${minOutputAmount.toString()}`,
            };
        }
        return {
            success: true,
            data: `Order validated: solver output=${solverOutputAmount.toString()}, user minimum=${minOutputAmount.toString()}`,
        };
    };
}
//# sourceMappingURL=checkExchangeRate.js.map
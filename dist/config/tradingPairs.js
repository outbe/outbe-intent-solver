/**
 * Trading pairs configuration for LayerZero7683 solver
 * Defines supported token swaps between chains with rates and bidding strategy
 */
export const tradingPairs = [
    // ============ Native COEN (Outbe) ↔ Native BNB (BSC) ============
    // Outbe native COEN → BSC native BNB
    {
        originChain: "outbe",
        destinationChain: "bsctestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        outputToken: "0x0000000000000000000000000000000000000000", // Native BNB
        exchangeRate: 1, // 1 COEN = 0.0001 BNB (with profit included)
        quoteTolerance: 0.01, // 3% boost for native swaps
    },
    // BSC native BNB → Outbe native COEN
    {
        originChain: "bsctestnet",
        destinationChain: "outbe",
        inputToken: "0x0000000000000000000000000000000000000000", // Native BNB
        outputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        exchangeRate: 1, // 1 BNB = 10000 COEN (inverse, with profit)
        quoteTolerance: 0.01,
    },
    // ============ Native COEN (Outbe) ↔ USDC (BSC) ============
    // Outbe native COEN → BSC USDC
    {
        originChain: "outbe",
        destinationChain: "bsctestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        outputToken: "0xe577886C94eF6F87632224c22F1276e15b9A96E3", // USDC Test Token on BSC (6 decimals)
        exchangeRate: 0.012, // 1 COEN = 0.012 USDC (test) (with profit)
        quoteTolerance: 0.01, //%1 rename tolerance
    },
];
//# sourceMappingURL=tradingPairs.js.map
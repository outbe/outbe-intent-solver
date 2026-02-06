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
        exchangeRate: 0.0001, // 1 COEN = 0.0001 BNB (with profit included)
        quoteBoost: 0.03, // 3% boost for native swaps
    },
    // BSC native BNB → Outbe native COEN
    {
        originChain: "bsctestnet",
        destinationChain: "outbe",
        inputToken: "0x0000000000000000000000000000000000000000", // Native BNB
        outputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        exchangeRate: 10000, // 1 BNB = 10000 COEN (inverse, with profit)
        quoteBoost: 0.03,
    },
    // ============ Native COEN (Outbe) ↔ COEN token (BSC) ============
    // Outbe native COEN → BSC COEN token
    {
        originChain: "outbe",
        destinationChain: "bsctestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        outputToken: "0x5cDF01b5Cb3C82a71f423dB6a91c721f138EbEce", // COEN token on BSC
        exchangeRate: 1.0, // 1:1 same token (with bridge fee included)
        quoteBoost: 0.02,
    },
    // BSC COEN token → Outbe native COEN
    {
        originChain: "bsctestnet",
        destinationChain: "outbe",
        inputToken: "0x5cDF01b5Cb3C82a71f423dB6a91c721f138EbEce", // COEN token on BSC
        outputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        exchangeRate: 1.0, // 1:1 same token (with bridge fee included)
        quoteBoost: 0.02,
    },
    // ============ Native COEN (Outbe) ↔ USDC (BSC) ============
    // Outbe native COEN → BSC USDC
    {
        originChain: "outbe",
        destinationChain: "bsctestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        outputToken: "0xae878856F2bEb1F716023043daFef50825d21396", // USDC on BSC (6 decimals)
        exchangeRate: 0.012, // 1 COEN = 0.012 USDC (with profit)
        quoteBoost: 0.02,
    },
    // BSC USDC → Outbe native COEN
    {
        originChain: "bsctestnet",
        destinationChain: "outbe",
        inputToken: "0xae878856F2bEb1F716023043daFef50825d21396", // USDC on BSC (6 decimals)
        outputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        exchangeRate: 83.333333, // 1 USDC = 83.33 COEN (with profit)
        quoteBoost: 0.02,
    },
    // ============ COEN token (BSC) ↔ USDC (BSC) ============
    // BSC COEN token → BSC USDC
    {
        originChain: "bsctestnet",
        destinationChain: "bsctestnet",
        inputToken: "0x5cDF01b5Cb3C82a71f423dB6a91c721f138EbEce", // COEN token
        outputToken: "0xae878856F2bEb1F716023043daFef50825d21396", // USDC
        exchangeRate: 0.012, // 1 COEN = 0.012 USDC (with profit)
        quoteBoost: 0.015, // 1.5% for same-chain swaps
    },
    // BSC USDC → BSC COEN token
    {
        originChain: "bsctestnet",
        destinationChain: "bsctestnet",
        inputToken: "0xae878856F2bEb1F716023043daFef50825d21396", // USDC
        outputToken: "0x5cDF01b5Cb3C82a71f423dB6a91c721f138EbEce", // COEN token
        exchangeRate: 83.333333, // 1 USDC = 83.33 COEN (with profit)
        quoteBoost: 0.015,
    },
];
//# sourceMappingURL=tradingPairs.js.map
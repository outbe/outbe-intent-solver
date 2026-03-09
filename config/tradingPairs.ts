/**
 * Trading pairs configuration for LayerZeroRouter solver
 * Defines supported token swaps between chains with rates and bidding strategy
 */

export interface TradingPair {
    originChain: string;
    destinationChain: string;
    inputToken: string; // Use 0x0000000000000000000000000000000000000000 for native token what user paid
    outputToken: string; // Use 0x0000000000000000000000000000000000000000 for native token what solver paid
    exchangeRate: number; // Exchange rate with profit included (outputAmount per 1 inputToken)
    quoteTolerance: number; // Extra % to offer in auction to win (0.02 = 2% more)
}

export const tradingPairs: TradingPair[] = [
    // ============ Native COEN (Outbe) ↔ Native BNB (BSC) ============

    // Outbe native COEN → BSC native BNB
    {
        originChain: "outbetestnet",
        destinationChain: "bsctestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        outputToken: "0x0000000000000000000000000000000000000000", // Native BNB
        exchangeRate: 1, // 1 COEN = 0.0001 BNB (with profit included)
        quoteTolerance: 0.01, // 3% boost for native swaps
    },

    // BSC native BNB → Outbe native COEN
    {
        originChain: "bsctestnet",
        destinationChain: "outbetestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native BNB
        outputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        exchangeRate: 1, // 1 BNB = 10000 COEN (inverse, with profit)
        quoteTolerance: 0.01,
    },


    // ============ Native COEN (Outbe) ↔ USDC (BSC) ============

    // Outbe native COEN → BSC USDC
    {
        originChain: "outbetestnet",
        destinationChain: "bsctestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        outputToken: "0xe577886C94eF6F87632224c22F1276e15b9A96E3", // USDC Test Token on BSC (6 decimals)
        exchangeRate: 0.012, // 1 COEN = 0.012 USDC (test) (with profit)
        quoteTolerance: 0.03, //%1 rename tolerance
    },

    // USD0


    {
        originChain: "outbetestnet",
        destinationChain: "bsctestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        outputToken: "0xcbCA050D4e7F3D025131c605bAf257829A7Fbb49", // USD0 Test Token on BSC
        exchangeRate: 0.012, // 1 COEN = 0.012 USD0
        quoteTolerance: 0.01, //%1
    },

    {
        originChain: "bsctestnet",
        destinationChain: "outbetestnet",
        inputToken: "0xcbCA050D4e7F3D025131c605bAf257829A7Fbb49",
        outputToken: "0x0000000000000000000000000000000000000000",
        exchangeRate: 83.33,
        quoteTolerance: 0.01, //%1
    },


];

/**
 * Trading pairs configuration for LayerZero7683 solver
 * Defines supported token swaps between chains with rates and bidding strategy
 */
export interface TradingPair {
    originChain: string;
    destinationChain: string;
    inputToken: string;
    outputToken: string;
    exchangeRate: number;
    quoteBoost: number;
}
export declare const tradingPairs: TradingPair[];
//# sourceMappingURL=tradingPairs.d.ts.map
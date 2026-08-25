/** Rate: fixed number | oracle "<baseAddr>/<quoteAddr>" | URL | "1/<any of those>" for the inverse */
export type RateSource = number | string;

export interface TradingPair {
    originChain: string;
    destinationChain: string;
    inputToken: string;
    outputToken: string;
    rate: RateSource;
    quoteTolerance: number;
    /** Also trade this pair the other way round, at the inverse rate. */
    reversible?: boolean;
}

function reverse(pair: TradingPair): TradingPair {
    const {rate} = pair;
    return {
        ...pair,
        originChain: pair.destinationChain,
        destinationChain: pair.originChain,
        inputToken: pair.outputToken,
        outputToken: pair.inputToken,
        rate: typeof rate === "number"
            ? 1 / rate
            : rate.startsWith("1/") ? rate.slice(2) : `1/${rate}`,
    };
}

/** Turns every `reversible` pair into two — the configured direction and its mirror. */
export function expandPairs(pairs: TradingPair[]): TradingPair[] {
    return pairs.flatMap((pair) => (pair.reversible ? [pair, reverse(pair)] : [pair]));
}

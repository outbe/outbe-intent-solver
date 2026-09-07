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

export type TradingPairProfile = {
    chainNames: Record<string, string>;
    tokenAddresses: Record<string, string | undefined>;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Maps the committed testnet-shaped template onto the active deployment profile. */
export function configurePairs(pairs: TradingPair[], profile: TradingPairProfile): TradingPair[] {
    return pairs.map((pair) => {
        const originChain = profile.chainNames[pair.originChain] ?? pair.originChain;
        const destinationChain = profile.chainNames[pair.destinationChain] ?? pair.destinationChain;

        return {
            ...pair,
            originChain,
            destinationChain,
            inputToken: pair.inputToken.toLowerCase() === ZERO_ADDRESS
                ? pair.inputToken
                : profile.tokenAddresses[originChain] || pair.inputToken,
            outputToken: pair.outputToken.toLowerCase() === ZERO_ADDRESS
                ? pair.outputToken
                : profile.tokenAddresses[destinationChain] || pair.outputToken,
        };
    });
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

import {describe, expect, it} from "vitest";
import {configurePairs, expandPairs, type TradingPair} from "../config/tradingPairs/pairs";

const ORACLE = "0xBASE/0xQUOTE";

const pair = (over: Partial<TradingPair> = {}): TradingPair => ({
    originChain: "outbetestnet",
    destinationChain: "sepolia",
    inputToken: "0xC0",
    outputToken: "0xU0",
    rate: ORACLE,
    quoteTolerance: 0.01,
    ...over,
});

describe("expandPairs", () => {
    it("leaves a pair alone unless it is reversible", () => {
        expect(expandPairs([pair()])).toHaveLength(1);
    });

    it("mirrors chains and tokens of a reversible pair", () => {
        const [, back] = expandPairs([pair({reversible: true})]);
        expect(back.originChain).toBe("sepolia");
        expect(back.destinationChain).toBe("outbetestnet");
        expect(back.inputToken).toBe("0xU0");
        expect(back.outputToken).toBe("0xC0");
        expect(back.quoteTolerance).toBe(0.01);
    });

    it("inverts the rate: number, oracle key and back again", () => {
        expect(expandPairs([pair({rate: 4, reversible: true})])[1].rate).toBe(0.25);
        expect(expandPairs([pair({reversible: true})])[1].rate).toBe(`1/${ORACLE}`);
        expect(expandPairs([pair({rate: `1/${ORACLE}`, reversible: true})])[1].rate).toBe(ORACLE);
    });
});

describe("configurePairs", () => {
    it("maps chain names and token addresses without replacing native tokens", () => {
        const [configured] = configurePairs([pair()], {
            chainNames: {
                outbetestnet: "outbemainnet",
                sepolia: "ethereum",
            },
            tokenAddresses: {
                outbemainnet: "0xOUTBE",
                ethereum: "0xETHEREUM",
            },
        });

        expect(configured.originChain).toBe("outbemainnet");
        expect(configured.destinationChain).toBe("ethereum");
        expect(configured.inputToken).toBe("0xOUTBE");
        expect(configured.outputToken).toBe("0xETHEREUM");

        const [native] = configurePairs([pair({inputToken: "0x0000000000000000000000000000000000000000"})], {
            chainNames: {outbetestnet: "outbemainnet", sepolia: "ethereum"},
            tokenAddresses: {outbemainnet: "0xOUTBE", ethereum: "0xETHEREUM"},
        });
        expect(native.inputToken).toBe("0x0000000000000000000000000000000000000000");
    });

    it("keeps the committed token when an optional override is empty", () => {
        const [configured] = configurePairs([pair()], {
            chainNames: {},
            tokenAddresses: {sepolia: ""},
        });

        expect(configured.outputToken).toBe("0xU0");
    });
});

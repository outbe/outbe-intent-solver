import {describe, expect, it} from "vitest";
import {expandPairs, type TradingPair} from "../config/tradingPairs/pairs";

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

import {ethers} from "ethers";

/**
 * Trading pairs configuration for LayerZeroRouter solver
 * Defines supported token swaps between chains with rates and bidding strategy
 */

// TODO: temporary solution — fetch rate from Oracle at startup, later move to a dedicated service
async function getOracleRate(pairName: string): Promise<number | null> {
    try {
        const provider = new ethers.providers.JsonRpcProvider("https://eth.testnet.outbe.net");
        const abi = ["function getExchangeRates() view returns (tuple(string pair, tuple(string exchangeRate, string lastUpdate, int64 lastUpdateTimestamp) oracleExchangeRateVal)[])"];
        const oracle = new ethers.Contract("0x0000000000000000000000000000000000001008", abi, provider);
        const rates = await oracle.getExchangeRates();
        const found = rates.find((r: any) => r.pair === pairName);
        if (!found) return null;
        return parseFloat(found.oracleExchangeRateVal.exchangeRate);
    } catch {
        return null;
    }
}

export interface TradingPair {
    originChain: string;
    destinationChain: string;
    inputToken: string; // Use 0x0000000000000000000000000000000000000000 for native token what user paid
    outputToken: string; // Use 0x0000000000000000000000000000000000000000 for native token what solver paid
    exchangeRate: number; // Exchange rate with profit included (outputAmount per 1 inputToken)
    quoteTolerance: number; // Extra % to offer in auction to win (0.02 = 2% more)
}

const FALLBACK_COEN_USD = 0.012;

export async function getTradingPairs(): Promise<TradingPair[]> {
    const coenUsdRate = await getOracleRate("COEN/USDC") ?? FALLBACK_COEN_USD;

    return [
        // COEN <-> USDT (cross-chain)
        {
            originChain: "outbetestnet",
            destinationChain: "bsctestnet",
            inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
            outputToken: "0xFEcF2FcDcF899b907371165bf26C353A7b6950ae", // USDT MOCK on BSC
            exchangeRate: coenUsdRate,
            quoteTolerance: 0.01,
        },

        {
            originChain: "bsctestnet",
            destinationChain: "outbetestnet",
            inputToken: "0xFEcF2FcDcF899b907371165bf26C353A7b6950ae",
            outputToken: "0x0000000000000000000000000000000000000000",
            exchangeRate: parseFloat((1 / coenUsdRate).toFixed(6)),
            quoteTolerance: 0.01,
        },

        // USD0 <-> USDT (cross-chain)
        {
            originChain: "outbetestnet",
            destinationChain: "bsctestnet",
            inputToken: "0x8958643e5e4ea64787Aa9559fd99E97e2082D30D", // USD0 Test Token on Outbe
            outputToken: "0xFEcF2FcDcF899b907371165bf26C353A7b6950ae", // USDT MOCK on BSC
            exchangeRate: 1,
            quoteTolerance: 0,
        },

        {
            originChain: "bsctestnet",
            destinationChain: "outbetestnet",
            inputToken: "0xFEcF2FcDcF899b907371165bf26C353A7b6950ae",
            outputToken: "0x8958643e5e4ea64787Aa9559fd99E97e2082D30D",
            exchangeRate: 1,
            quoteTolerance: 0,
        },

        // COEN <-> USD0 (same-chain)
        {
            originChain: "outbetestnet",
            destinationChain: "outbetestnet",
            inputToken: "0x0000000000000000000000000000000000000000", // COEN
            outputToken: "0x8958643e5e4ea64787Aa9559fd99E97e2082D30D", // USD0
            exchangeRate: coenUsdRate,
            quoteTolerance: 0,
        },

        {
            originChain: "outbetestnet",
            destinationChain: "outbetestnet",
            inputToken: "0x8958643e5e4ea64787Aa9559fd99E97e2082D30D", // USD0
            outputToken: "0x0000000000000000000000000000000000000000", // COEN
            exchangeRate: parseFloat((1 / coenUsdRate).toFixed(6)),
            quoteTolerance: 0,
        },
    ];
}


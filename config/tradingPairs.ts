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

// TODO: temporary solution — fetch rate from Oracle at startup, later move to a dedicated service
const coenUsdRate = await getOracleRate("COEN/USDC") ?? 0.012;

export const tradingPairs: TradingPair[] = [
    // USD0<->COEN
    {
        originChain: "outbetestnet",
        destinationChain: "bsctestnet",
        inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
        outputToken: "0xcbCA050D4e7F3D025131c605bAf257829A7Fbb49", // USD0 Test Token on BSC
        exchangeRate: coenUsdRate,
        quoteTolerance: 0.005, //%1
    },

    {
        originChain: "bsctestnet",
        destinationChain: "outbetestnet",
        inputToken: "0xcbCA050D4e7F3D025131c605bAf257829A7Fbb49",
        outputToken: "0x0000000000000000000000000000000000000000",
        exchangeRate: parseFloat((1 / coenUsdRate).toFixed(6)),
        quoteTolerance: 0.005, //%1
    },
        //USD0 <-> USD0

    {
        originChain: "outbetestnet",
        destinationChain: "bsctestnet",
        inputToken: "0x74c8af2F5D7288711795048337e5580CbcB9EB02", // USD0 Test Token on Outbe
        outputToken: "0xcbCA050D4e7F3D025131c605bAf257829A7Fbb49", // USD0 Test Token on BSC
        exchangeRate: 1,
        quoteTolerance: 0,
    },

    {
        originChain: "bsctestnet",
        destinationChain: "outbetestnet",
        inputToken: "0xcbCA050D4e7F3D025131c605bAf257829A7Fbb49",
        outputToken: "0x74c8af2F5D7288711795048337e5580CbcB9EB02",
        exchangeRate: 1,
        quoteTolerance: 0,
    },



];

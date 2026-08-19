import {BigNumber, ethers} from "ethers";
import {readFileSync, existsSync} from "fs";
import {resolve, dirname} from "path";
import {fileURLToPath} from "url";
import {chainMetadata} from "../chainMetadata.js";
import IOracleAbi from "../../solvers/contracts/IOracle.json" with {type: "json"};

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAIRS_FILE = resolve(__dirname, "pairs.json");
const OUTBE_RPC = chainMetadata.outbetestnet.rpcUrls[0].http;
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || "0x000000000000000000000000000000000000EE05";
const RATE_DECIMALS = 6;

export interface TradingPair {
    originChain: string;
    destinationChain: string;
    inputToken: string;
    outputToken: string;
    rate: number | string;
    quoteTolerance: number;
}

function rateToFloat(rate: BigNumber): number {
    return parseFloat(ethers.utils.formatUnits(rate, RATE_DECIMALS));
}

async function getOracleRate(pairName: string): Promise<number | null> {
    try {
        const [base, quote] = pairName.split("/");
        if (!base || !quote) return null;

        const provider = new ethers.providers.JsonRpcProvider(OUTBE_RPC);
        const oracle = new ethers.Contract(ORACLE_ADDRESS, IOracleAbi, provider);
        const rate: BigNumber = await oracle.getExchangeRate(base, quote);
        return rateToFloat(rate);
    } catch {
        return null;
    }
}

function loadPairsConfig(): TradingPair[] {
    if (!existsSync(PAIRS_FILE)) {
        throw new Error(
            `Trading pairs config not found: ${PAIRS_FILE}\n` +
            `Run "yarn pairs:init" to create it from the example.`
        );
    }
    return JSON.parse(readFileSync(PAIRS_FILE, "utf-8"));
}

async function getUrlRate(url: string): Promise<number> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`URL rate request failed: ${url} (status ${res.status})`);
    }
    const json = await res.json() as Record<string, string>;
    if (!("exchangeRate" in json)) {
        throw new Error(`URL response missing "exchangeRate" key: ${url}`);
    }
    const rate = parseFloat(json.exchangeRate);
    if (isNaN(rate)) {
        throw new Error(`URL returned invalid exchangeRate value: "${json.exchangeRate}" from ${url}`);
    }
    return rate;
}

async function resolveRate(rate: number | string): Promise<number> {
    if (typeof rate === "number") {
        return rate;
    }

    // URL → fetch rate from external endpoint
    if (rate.startsWith("http://") || rate.startsWith("https://")) {
        return getUrlRate(rate);
    }

    // "1/<baseAddr>/<quoteAddr>" → inverse of oracle rate; "<baseAddr>/<quoteAddr>" → direct
    const isInverse = rate.startsWith("1/");
    const pairKey = isInverse ? rate.slice(2) : rate;

    const oracleRate = await getOracleRate(pairKey);
    if (oracleRate === null) {
        throw new Error(`Oracle rate not found for "${pairKey}"`);
    }

    return isInverse
        ? parseFloat((1 / oracleRate).toFixed(6))
        : oracleRate;
}

export async function getTradingPairs(): Promise<TradingPair[]> {
    const configs = loadPairsConfig();

    return Promise.all(
        configs.map(async (config) => ({
            originChain: config.originChain,
            destinationChain: config.destinationChain,
            inputToken: config.inputToken,
            outputToken: config.outputToken,
            rate: await resolveRate(config.rate),
            quoteTolerance: config.quoteTolerance,
        })),
    );
}

export async function getOracleRates(): Promise<{base: string; quote: string; rate: string; block: string; timestamp: string}[]> {
    const provider = new ethers.providers.JsonRpcProvider(OUTBE_RPC);
    const oracle = new ethers.Contract(ORACLE_ADDRESS, IOracleAbi, provider);
    const {bases, quotes} = await oracle.getVoteTargets();

    return Promise.all(
        bases.map(async (base: string, i: number) => {
            const quote = quotes[i];
            const {rate, lastBlock, lastTimestamp} = await oracle.getExchangeRateData(base, quote);
            return {
                base,
                quote,
                rate: rateToFloat(rate).toString(),
                block: lastBlock.toString(),
                timestamp: lastTimestamp.toString(),
            };
        }),
    );
}

export {loadPairsConfig, getOracleRate, resolveRate, PAIRS_FILE};

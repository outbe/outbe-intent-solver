import {BigNumber, ethers} from "ethers";
import {readFileSync, existsSync} from "fs";
import {resolve, dirname} from "path";
import {fileURLToPath} from "url";
import {chainMetadata} from "../chainMetadata.js";
import {expandPairs, type RateSource, type TradingPair} from "./pairs.js";
import IOracleAbi from "../../solvers/contracts/IOracle.json" with {type: "json"};

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAIRS_FILE = resolve(__dirname, "pairs.json");
const OUTBE_RPC = chainMetadata.outbetestnet.rpcUrls[0].http;
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || "0x000000000000000000000000000000000000EE05";
const RATE_DECIMALS = 6;

export type {TradingPair};

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

async function resolveRate(rate: RateSource): Promise<number> {
    if (typeof rate === "number") {
        return rate;
    }

    // "1/<source>" → inverse of whatever <source> resolves to
    const isInverse = rate.startsWith("1/");
    const source = isInverse ? rate.slice(2) : rate;

    // URL → external endpoint; otherwise "<baseAddr>/<quoteAddr>" oracle pair
    let resolved: number | null;
    if (source.startsWith("http://") || source.startsWith("https://")) {
        resolved = await getUrlRate(source);
    } else {
        resolved = await getOracleRate(source);
        if (resolved === null) {
            throw new Error(`Oracle rate not found for "${source}"`);
        }
    }

    if (!resolved) {
        throw new Error(`Rate resolved to zero for "${rate}"`);
    }
    return isInverse ? 1 / resolved : resolved;
}

export async function getTradingPairs(): Promise<TradingPair[]> {
    const pairs = expandPairs(loadPairsConfig());

    return Promise.all(
        pairs.map(async (pair) => ({...pair, rate: await resolveRate(pair.rate)})),
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

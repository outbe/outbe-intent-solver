import {BigNumber, ethers} from "ethers";
import {readFileSync, existsSync} from "fs";
import {resolve, dirname} from "path";
import {fileURLToPath} from "url";
import {chainMetadata} from "../chainMetadata.js";
import IOracleAbi from "../../solvers/contracts/IOracle.json" with {type: "json"};

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAIRS_FILE = resolve(__dirname, "pairs.json");
const OUTBE_RPC = chainMetadata.outbetestnet.rpcUrls[0].http;
const ORACLE_ADDRESS = "0x000000000000000000000000000000000000EE05";
const RATE_DECIMALS = 18;

export interface TradingPair {
    originChain: string;
    destinationChain: string;
    inputToken: string;
    outputToken: string;
    exchangeRate: number | string;
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
        const {rate} = await oracle.getExchangeRate(base, quote);
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

async function resolveRate(exchangeRate: number | string): Promise<number> {
    if (typeof exchangeRate === "number") {
        return exchangeRate;
    }

    // URL → fetch rate from external endpoint
    if (exchangeRate.startsWith("http://") || exchangeRate.startsWith("https://")) {
        return getUrlRate(exchangeRate);
    }

    // "1/COEN/USDC" → inverse of oracle rate
    const isInverse = exchangeRate.startsWith("1/");
    const pairName = isInverse ? exchangeRate.slice(2) : exchangeRate;

    const rate = await getOracleRate(pairName);
    if (rate === null) {
        throw new Error(`Oracle rate not found for "${pairName}"`);
    }

    return isInverse
        ? parseFloat((1 / rate).toFixed(6))
        : rate;
}

export async function getTradingPairs(): Promise<TradingPair[]> {
    const configs = loadPairsConfig();

    return Promise.all(
        configs.map(async (config) => ({
            originChain: config.originChain,
            destinationChain: config.destinationChain,
            inputToken: config.inputToken,
            outputToken: config.outputToken,
            exchangeRate: await resolveRate(config.exchangeRate),
            quoteTolerance: config.quoteTolerance,
        })),
    );
}

export async function getOracleRates(): Promise<{rate: string; block: string; timestamp: string}[]> {
    const provider = new ethers.providers.JsonRpcProvider(OUTBE_RPC);
    const oracle = new ethers.Contract(ORACLE_ADDRESS, IOracleAbi, provider);
    const {rates, blocks, timestamps} = await oracle.getExchangeRates();
    return rates.map((rate: BigNumber, i: number) => ({
        rate: rateToFloat(rate).toString(),
        block: blocks[i].toString(),
        timestamp: timestamps[i].toString(),
    }));
}

export {loadPairsConfig, getOracleRate, resolveRate, PAIRS_FILE};

import {readFileSync, writeFileSync, existsSync, copyFileSync} from "fs";
import {resolve, dirname} from "path";
import {fileURLToPath} from "url";
import {input, select, confirm} from "@inquirer/prompts";
import type {TradingPair} from "../config/tradingPairs/handler.js";
import {resolveRate} from "../config/tradingPairs/handler.js";
import {chainMetadata} from "../config/chainMetadata.js";
import {getOracleRates} from "../config/tradingPairs/handler.js";


const __dirname = dirname(fileURLToPath(import.meta.url));
const chainChoices = Object.keys(chainMetadata).map((name) => ({name, value: name}));
const PAIRS_DIR = resolve(__dirname, "../config/tradingPairs");
const PAIRS_FILE = resolve(PAIRS_DIR, "pairs.json");
const EXAMPLE_FILE = resolve(PAIRS_DIR, "pairs.example.json");

function loadPairs(): TradingPair[] {
    if (!existsSync(PAIRS_FILE)) return [];
    return JSON.parse(readFileSync(PAIRS_FILE, "utf-8"));
}

function savePairs(pairs: TradingPair[]) {
    writeFileSync(PAIRS_FILE, JSON.stringify(pairs, null, 2) + "\n");
}

function formatPair(pair: TradingPair, index: number): string {
    const rate = typeof pair.exchangeRate === "string"
        ? `oracle(${pair.exchangeRate})`
        : pair.exchangeRate;
    return `[${index}] ${pair.originChain} → ${pair.destinationChain} | ${pair.inputToken} → ${pair.outputToken} | rate: ${rate} | tolerance: ${pair.quoteTolerance}`;
}

// --- Commands ---

async function init() {
    if (!existsSync(EXAMPLE_FILE)) {
        console.error("Example file not found:", EXAMPLE_FILE);
        process.exit(1);
    }

    if (existsSync(PAIRS_FILE)) {
        const overwrite = await confirm({
            message: "pairs.json already exists. Overwrite?",
            default: false,
        });
        if (!overwrite) {
            console.log("Aborted.");
            return;
        }
    }

    copyFileSync(EXAMPLE_FILE, PAIRS_FILE);
    console.log("Created pairs.json from example.");
}

async function add() {
    const originChain = await select({message: "Origin chain:", choices: chainChoices});
    const destinationChain = await select({message: "Destination chain:", choices: chainChoices});
    const inputToken = await input({message: "Input token address:", default: "0x0000000000000000000000000000000000000000"});
    const outputToken = await input({message: "Output token address:", default: "0x0000000000000000000000000000000000000000"});
    const rateInput = await input({
        message: "Exchange rate (number | oracle key e.g. COEN/USDC | 1/COEN/USDC for inverse | URL):",
    });
    const quoteTolerance = parseFloat(
        await input({message: "Quote tolerance — extra % added to output (e.g. 0.01 = 1%):", default: "0"}),
    );

    const exchangeRate = isNaN(Number(rateInput)) ? rateInput : Number(rateInput);

    const pairs = loadPairs();
    pairs.push({originChain, destinationChain, inputToken, outputToken, exchangeRate, quoteTolerance});
    savePairs(pairs);

    try {
        const resolved = await resolveRate(exchangeRate);
        console.log(`Pair added. Current rate: ${resolved}`);
    } catch (e: any) {
        console.log(`Pair added. ⚠ Could not resolve rate: ${e.message}`);
    }
}

async function remove() {
    const pairs = loadPairs();
    if (pairs.length === 0) {
        console.log("No pairs configured.");
        return;
    }

    const choices = pairs.map((pair, i) => ({
        name: formatPair(pair, i),
        value: i,
    }));

    const index = await select({
        message: "Select pair to remove:",
        choices,
    });

    pairs.splice(index, 1);
    savePairs(pairs);
    console.log("Pair removed.");
}

async function list() {
    const pairs = loadPairs();
    if (pairs.length === 0) {
        console.log("No pairs configured.");
        return;
    }

    console.log(`\n${pairs.length} trading pair(s):\n`);
    pairs.forEach((pair, i) => console.log(formatPair(pair, i)));
    console.log();
}

async function oracle() {
    const rates = await getOracleRates();

    if (rates.length === 0) {
        console.log("No oracle pairs found.");
        return;
    }

    console.log(`\n${rates.length} oracle rate(s):\n`);
    rates.forEach((r, i) => {
        console.log(`  [${i}] rate: ${r.rate}  block: ${r.block}  timestamp: ${r.timestamp}`);
    });
    console.log();
}

// --- Entry ---

const command = process.argv[2];

switch (command) {
    case "init":
        await init();
        break;
    case "add":
        await add();
        break;
    case "remove":
        await remove();
        break;
    case "list":
        await list();
        break;
    case "oracle":
        await oracle();
        break;
    default:
        console.log("Usage: tsx scripts/pairs.ts <init|add|remove|list|oracle>");
        process.exit(1);
}

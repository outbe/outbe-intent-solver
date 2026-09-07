import {readFileSync, writeFileSync, existsSync, copyFileSync} from "fs";
import {basename} from "path";
import {input, select, confirm} from "@inquirer/prompts";
import {getOracleRates, loadPairsConfig, resolveRate, PAIRS_FILE, PAIRS_TEMPLATE} from "../config/tradingPairs/handler.js";
import type {TradingPair} from "../config/tradingPairs/pairs.js";
import {chainMetadata} from "../config/chainMetadata.js";


const chainChoices = Object.keys(chainMetadata).map((name) => ({name, value: name}));

function loadPairs(): TradingPair[] {
    if (!existsSync(PAIRS_FILE)) return [];
    return JSON.parse(readFileSync(PAIRS_FILE, "utf-8"));
}

function savePairs(pairs: TradingPair[]) {
    writeFileSync(PAIRS_FILE, JSON.stringify(pairs, null, 2) + "\n");
}

function formatPair(pair: TradingPair, index: number): string {
    const rate = typeof pair.rate === "string" ? `oracle(${pair.rate})` : pair.rate;
    const arrow = pair.reversible ? "↔" : "→";
    return `[${index}] ${pair.originChain} ${arrow} ${pair.destinationChain} | ${pair.inputToken} ${arrow} ${pair.outputToken} | rate: ${rate} | tolerance: ${pair.quoteTolerance}`;
}

// --- Commands ---

async function init() {
    if (!existsSync(PAIRS_TEMPLATE)) {
        console.error("Template not found:", PAIRS_TEMPLATE);
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

    copyFileSync(PAIRS_TEMPLATE, PAIRS_FILE);
    console.log(`Created pairs.json from ${basename(PAIRS_TEMPLATE)}.`);
}

async function add() {
    const originChain = await select({message: "Origin chain:", choices: chainChoices});
    const destinationChain = await select({message: "Destination chain:", choices: chainChoices});
    const inputToken = await input({message: "Input token address:", default: "0x0000000000000000000000000000000000000000"});
    const outputToken = await input({message: "Output token address:", default: "0x0000000000000000000000000000000000000000"});
    const rateInput = await input({
        message: "Rate (number | <baseAddr>/<quoteAddr> for oracle | 1/<baseAddr>/<quoteAddr> for inverse | URL):",
    });
    const quoteTolerance = parseFloat(
        await input({message: "Quote tolerance — extra % added to output (e.g. 0.01 = 1%):", default: "0"}),
    );
    const reversible = await confirm({
        message: "Also trade the other way round, at the inverse rate?",
        default: true,
    });

    const rate = isNaN(Number(rateInput)) ? rateInput : Number(rateInput);

    const pairs = loadPairs();
    pairs.push({originChain, destinationChain, inputToken, outputToken, rate, quoteTolerance, reversible});
    savePairs(pairs);

    try {
        const resolved = await resolveRate(rate);
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

    const index = await select({
        message: "Select pair to remove:",
        choices: pairs.map((pair, i) => ({name: formatPair(pair, i), value: i})),
    });

    pairs.splice(index, 1);
    savePairs(pairs);
    console.log("Pair removed.");
}

async function list() {
    const pairs = loadPairsConfig(); // validates the file against the active network
    if (pairs.length === 0) {
        console.log("No pairs configured.");
        return;
    }

    const reversible = pairs.filter((pair) => pair.reversible).length;
    console.log(`\n${pairs.length} configured pair(s), ${pairs.length + reversible} traded (↔ = both directions):\n`);
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
        console.log(`  [${i}] ${r.base}/${r.quote}  rate: ${r.rate}  block: ${r.block}  timestamp: ${r.timestamp}`);
    });
    console.log();
}

// --- Entry ---

const commands = {init, add, remove, list, oracle};
const command = process.argv[2] as keyof typeof commands;

if (!commands[command]) {
    console.log(`Usage: tsx scripts/pairs.ts <${Object.keys(commands).join("|")}>`);
    process.exit(1);
}

try {
    await commands[command]();
} catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
}

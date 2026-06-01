import {resolveRate} from "../config/tradingPairs/handler.js";

const pair = process.argv[2];
if (!pair) {
    console.error("Usage: tsx scripts/test-oracle.ts <pair>");
    console.error("Examples: COEN/USDC | 1/COEN/USDC");
    process.exit(1);
}

try {
    const rate = await resolveRate(pair);
    console.log(`${pair}  →  ${rate}`);
} catch (e: any) {
    console.error(`${pair}  →  ERROR: ${e.message}`);
    process.exit(1);
}

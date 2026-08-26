import {
    connectEscrow,
    getWallet,
    parseToken,
    printBalance,
    promptChain,
    tokenInfo,
    tokensFromPairs,
} from "./common.js";

/**
 * Show solver collateral balances (total / locked / available) for the PRIVATE_KEY address.
 *
 * Usage: yarn escrow:balance [chain] [token|native[,token2,...]]
 *   No chain: asks interactively. No tokens: every token pairs.json trades on that chain.
 *
 * Example:
 *   yarn escrow:balance
 *   yarn escrow:balance bsctestnet native,0xe6AE7EBD5b5c34ed3E696e6Ced7f2A1660F20454
 */
async function main() {
    console.log("SolverEscrow - Balances\n");

    const [chainArg, tokensArg] = process.argv.slice(2);
    const chainName = chainArg ?? (await promptChain());

    const tokens = tokensArg ? tokensArg.split(",").map(parseToken) : tokensFromPairs(chainName);
    if (tokens.length === 0) {
        console.error(`No pairs configured for "${chainName}" — pass tokens explicitly`);
        process.exit(1);
    }

    const wallet = getWallet(chainName);
    const solver = await wallet.getAddress();
    const {escrow, escrowAddress} = await connectEscrow(chainName, wallet.provider);

    const [balances, collateralBps] = await Promise.all([
        escrow.getBalances(solver, tokens),
        escrow.collateralBps(),
    ]);

    console.log(`  Chain:         ${chainName}`);
    console.log(`  Solver:        ${solver}`);
    console.log(`  Escrow:        ${escrowAddress}`);
    console.log(`  CollateralBps: ${collateralBps} (${collateralBps.toNumber() / 100}%)\n`);

    for (const info of balances) {
        const {decimals, symbol} = await tokenInfo(info.token, chainName, wallet.provider);
        console.log(`  ${symbol} (${info.token})`);
        printBalance(info, decimals, symbol);
        console.log();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error.reason ?? error.message);
        process.exit(1);
    });

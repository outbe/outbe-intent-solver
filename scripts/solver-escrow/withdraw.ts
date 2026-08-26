import {ethers} from "ethers";
import {confirm, input} from "@inquirer/prompts";
import {connectEscrow, getWallet, parseToken, printBalance, promptChain, promptToken, tokenInfo} from "./common.js";

/**
 * Withdraw solver collateral from SolverEscrow.
 * Missing arguments are asked for interactively.
 *
 * Usage: yarn escrow:withdraw [chain] [token|native] [amount|all]
 *
 * Example:
 *   yarn escrow:withdraw
 *   yarn escrow:withdraw bsctestnet 0xe6AE7EBD5b5c34ed3E696e6Ced7f2A1660F20454 all
 */
async function main() {
    console.log("SolverEscrow - Withdraw\n");

    const [chainArg, tokenArg, amountArg] = process.argv.slice(2);
    const chainName = chainArg ?? (await promptChain());
    const token = tokenArg ? parseToken(tokenArg) : await promptToken(chainName);

    const wallet = getWallet(chainName);
    const solverAddress = await wallet.getAddress();
    const {escrow, escrowAddress} = await connectEscrow(chainName, wallet);

    const {decimals, symbol} = await tokenInfo(token, chainName, wallet.provider);
    const balance = await escrow.getBalance(solverAddress, token);

    console.log(`  Chain:   ${chainName}`);
    console.log(`  Escrow:  ${escrowAddress}`);
    console.log(`  Solver:  ${solverAddress}`);
    console.log(`  Token:   ${token} (${symbol})`);
    console.log("  In escrow:");
    printBalance(balance, decimals, symbol);
    console.log();

    const answer = amountArg ?? await input({
        message: `Amount to withdraw (${symbol}, or "all"):`,
        default: "all",
    });
    const amount = answer.toLowerCase() === "all"
        ? balance.available
        : ethers.utils.parseUnits(answer, decimals);

    if (amount.isZero()) {
        console.error("Nothing to withdraw — available balance is 0");
        process.exit(1);
    }
    if (amount.gt(balance.available)) {
        console.error(`Only ${ethers.utils.formatUnits(balance.available, decimals)} ${symbol} is available`);
        process.exit(1);
    }
    if (!amountArg && !(await confirm({
        message: `Withdraw ${ethers.utils.formatUnits(amount, decimals)} ${symbol} to ${solverAddress}?`,
        default: true,
    }))) {
        console.log("Aborted.");
        return;
    }

    console.log(`\nWithdrawing ${ethers.utils.formatUnits(amount, decimals)} ${symbol}...`);
    const receipt = await (await escrow.withdraw(token, amount, {gasLimit: 500_000})).wait();

    console.log("\nWithdrawal successful!");
    console.log(`  Tx: ${receipt.transactionHash}`);

    console.log("\n  Balance after:");
    printBalance(await escrow.getBalance(solverAddress, token), decimals, symbol);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error.reason ?? error.message);
        process.exit(1);
    });

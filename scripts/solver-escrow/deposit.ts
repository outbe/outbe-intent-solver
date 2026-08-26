import {ethers} from "ethers";
import {confirm, input} from "@inquirer/prompts";
import {ERC20__factory} from "../../typechain/index.js";
import {
    NATIVE,
    connectEscrow,
    getWallet,
    isNative,
    parseToken,
    printBalance,
    promptChain,
    promptToken,
    tokenInfo,
} from "./common.js";

const COMPACT_ABI = [
    "function isOperator(address owner, address operator) view returns (bool)",
    "function setOperator(address operator, bool approved) returns (bool)",
];

/**
 * Deposit solver collateral into SolverEscrow.
 * Missing arguments are asked for interactively.
 *
 * Usage: yarn escrow:deposit [chain] [token|native] [amount]
 *
 * Example:
 *   yarn escrow:deposit
 *   yarn escrow:deposit bsctestnet 0xe6AE7EBD5b5c34ed3E696e6Ced7f2A1660F20454 100
 */
async function main() {
    console.log("SolverEscrow - Deposit\n");

    const [chainArg, tokenArg, amountArg] = process.argv.slice(2);
    const chainName = chainArg ?? (await promptChain());
    const token = tokenArg ? parseToken(tokenArg) : await promptToken(chainName);
    const native = isNative(token);

    const wallet = getWallet(chainName);
    const solverAddress = await wallet.getAddress();
    const {escrow, escrowAddress} = await connectEscrow(chainName, wallet);

    const {decimals, symbol} = await tokenInfo(token, chainName, wallet.provider);
    const walletBalance = native
        ? await wallet.getBalance()
        : await ERC20__factory.connect(token, wallet.provider).balanceOf(solverAddress);

    console.log(`  Chain:   ${chainName}`);
    console.log(`  Escrow:  ${escrowAddress}`);
    console.log(`  Solver:  ${solverAddress}`);
    console.log(`  Token:   ${token} (${symbol})`);
    console.log(`  Wallet:  ${ethers.utils.formatUnits(walletBalance, decimals)} ${symbol}\n`);

    const amount = amountArg
        ? ethers.utils.parseUnits(amountArg, decimals)
        : ethers.utils.parseUnits(await input({message: `Amount to deposit (${symbol}):`}), decimals);

    if (amount.isZero()) {
        console.error("Amount is 0 — nothing to deposit");
        process.exit(1);
    }
    if (amount.gt(walletBalance)) {
        console.error(`Not enough ${symbol}: wallet holds ${ethers.utils.formatUnits(walletBalance, decimals)}`);
        process.exit(1);
    }
    if (!amountArg && !(await confirm({
        message: `Deposit ${ethers.utils.formatUnits(amount, decimals)} ${symbol} into ${escrowAddress}?`,
        default: true,
    }))) {
        console.log("Aborted.");
        return;
    }
    console.log();

    // Escrow has to be an ERC6909 operator on The Compact to hold the deposit
    const compact = new ethers.Contract(await escrow.COMPACT(), COMPACT_ABI, wallet);
    if (!(await compact.isOperator(solverAddress, escrowAddress))) {
        console.log("Setting escrow as ERC6909 operator on The Compact...");
        await (await compact.setOperator(escrowAddress, true)).wait();
        console.log("  Operator approved\n");
    }

    if (!native) {
        const erc20 = ERC20__factory.connect(token, wallet);
        if ((await erc20.allowance(solverAddress, escrowAddress)).lt(amount)) {
            console.log("Approving tokens...");
            await (await erc20.approve(escrowAddress, amount)).wait();
            console.log("  Approved\n");
        }
    }

    console.log("Depositing...");
    const tx = native
        ? await escrow.deposit(NATIVE, 0, {value: amount})
        : await escrow.deposit(token, amount);
    const receipt = await tx.wait();

    const deposited = receipt.logs
        .map((entry) => {
            try {
                return escrow.interface.parseLog(entry);
            } catch {
                return null;
            }
        })
        .find((event) => event?.name === "Deposited");

    console.log("\nDeposit successful!");
    console.log(`  Tx:     ${receipt.transactionHash}`);
    if (deposited) {
        console.log(`  Amount: ${ethers.utils.formatUnits(deposited.args.amount, decimals)} ${symbol}`);
    }

    console.log("\n  Balance after:");
    printBalance(await escrow.getBalance(solverAddress, token), decimals, symbol);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error.reason ?? error.message);
        process.exit(1);
    });

import {ethers} from "ethers";
import {input, select} from "@inquirer/prompts";
import {chainMetadata} from "../../config/chainMetadata.js";
import {PRIVATE_KEY} from "../../config/index.js";
import {loadPairsConfig} from "../../config/tradingPairs/handler.js";
import {expandPairs} from "../../config/tradingPairs/pairs.js";
import metadata from "../../solvers/router/config/metadata.js";
import {Router__factory, SolverEscrow__factory, ERC20__factory} from "../../typechain/index.js";
import type {SolverEscrow} from "../../typechain/SolverEscrow.js";

export const NATIVE = ethers.constants.AddressZero;

export function isNative(token: string): boolean {
    return token.toLowerCase() === NATIVE;
}

/** "native" → zero address, anything else checksummed */
export function parseToken(arg: string): string {
    return arg.trim().toLowerCase() === "native" ? NATIVE : ethers.utils.getAddress(arg.trim());
}

export function chainOrExit(chainName: string) {
    const chain = chainMetadata[chainName];
    if (!chain) {
        console.error(`Unknown chain "${chainName}". Available: ${Object.keys(chainMetadata).join(", ")}`);
        process.exit(1);
    }
    return chain;
}

export function routerAddress(chainName: string): string {
    const contract = metadata.contracts.find((c) => c.chainName === chainName);
    if (!contract) {
        console.error(`Router is not configured for "${chainName}" in solvers/router/config/metadata.ts`);
        process.exit(1);
    }
    return ethers.utils.getAddress(contract.address);
}

/** Escrow address comes from the router deployed on that chain. */
export async function connectEscrow(
    chainName: string,
    signerOrProvider: ethers.Signer | ethers.providers.Provider,
): Promise<{escrow: SolverEscrow; escrowAddress: string}> {
    const provider = ethers.Signer.isSigner(signerOrProvider) ? signerOrProvider.provider! : signerOrProvider;
    const address = routerAddress(chainName);

    if ((await provider.getCode(address)) === "0x") {
        console.error(`No router deployed at ${address} on ${chainName} — check ROUTER_CONTRACT in .env`);
        process.exit(1);
    }

    const escrowAddress = await Router__factory.connect(address, provider).SOLVER_ESCROW();
    if (escrowAddress === NATIVE) {
        console.error(`SolverEscrow is not configured on router ${address} (${chainName})`);
        process.exit(1);
    }

    return {escrow: SolverEscrow__factory.connect(escrowAddress, signerOrProvider), escrowAddress};
}

export function getProvider(chainName: string): ethers.providers.JsonRpcProvider {
    return new ethers.providers.JsonRpcProvider(chainOrExit(chainName).rpcUrls[0].http);
}

export function getWallet(chainName: string): ethers.Wallet {
    if (!PRIVATE_KEY) {
        console.error("PRIVATE_KEY is not set — add it to .env");
        process.exit(1);
    }
    return new ethers.Wallet(PRIVATE_KEY, getProvider(chainName));
}

/** Native decimals/symbol from chainMetadata.ts, ERC20 straight from the token contract. */
export async function tokenInfo(
    token: string,
    chainName: string,
    provider: ethers.providers.Provider,
): Promise<{decimals: number; symbol: string}> {
    if (isNative(token)) {
        const {nativeToken} = chainOrExit(chainName);
        return {decimals: nativeToken!.decimals, symbol: nativeToken!.symbol};
    }

    const erc20 = ERC20__factory.connect(token, provider);
    const [decimals, symbol] = await Promise.all([erc20.decimals(), erc20.symbol()]);
    return {decimals, symbol};
}

/** Every token that pairs.json touches on this chain, both sides, deduplicated. */
export function tokensFromPairs(chainName: string): string[] {
    const tokens = expandPairs(loadPairsConfig()).flatMap((pair) => [
        ...(pair.originChain === chainName ? [pair.inputToken] : []),
        ...(pair.destinationChain === chainName ? [pair.outputToken] : []),
    ]);
    return [...new Set(tokens.map(parseToken))];
}

export function promptChain(): Promise<string> {
    return select({
        message: "Chain:",
        choices: Object.keys(chainMetadata).map((name) => ({name, value: name})),
    });
}

/** Pick one of the tokens pairs.json trades on that chain, or type any address. */
export async function promptToken(chainName: string): Promise<string> {
    const choices = tokensFromPairs(chainName).map((token) => ({
        name: isNative(token) ? `native (${chainOrExit(chainName).nativeToken!.symbol})` : token,
        value: token,
    }));

    const picked = await select({
        message: "Token:",
        choices: [...choices, {name: "other address…", value: "other"}],
    });

    return picked === "other" ? parseToken(await input({message: "Token address (or \"native\"):"})) : picked;
}

export function printBalance(
    balance: {total: ethers.BigNumber; locked: ethers.BigNumber; available: ethers.BigNumber},
    decimals: number,
    symbol: string,
) {
    const {formatUnits} = ethers.utils;
    console.log(`    Total:     ${formatUnits(balance.total, decimals)} ${symbol}`);
    console.log(`    Locked:    ${formatUnits(balance.locked, decimals)} ${symbol}`);
    console.log(`    Available: ${formatUnits(balance.available, decimals)} ${symbol}`);
}

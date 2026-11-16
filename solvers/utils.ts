import type { Provider } from "@ethersproject/abstract-provider";
import type { BigNumber } from "@ethersproject/bignumber";
import { isHexString } from "@ethersproject/bytes";
import { AddressZero } from "@ethersproject/constants";
import { formatUnits } from "@ethersproject/units";
import type { ChainMap, ChainMetadata } from "@hyperlane-xyz/sdk";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { ensure0x } from "@hyperlane-xyz/utils";
import { password } from "@inquirer/prompts";

import { MNEMONIC, PRIVATE_KEY } from "../config/index.js";
import { NonceKeeperWallet } from "../NonceKeeperWallet.js";
import { defaultAbiCoder } from "@ethersproject/abi";
import { Auction__factory } from "../typechain/factories/Auction__factory.js";
import { ERC20__factory } from "../typechain/factories/ERC20__factory.js";
import { Router__factory } from "../typechain/factories/Router__factory.js";
import { SolverEscrow__factory } from "../typechain/factories/SolverEscrow__factory.js";

export async function getMultiProvider(chainMetadata: ChainMap<ChainMetadata>) {
  const multiProvider = new MultiProvider(chainMetadata);
  const wallet = await getSigner();

  multiProvider.setSharedSigner(wallet);

  return multiProvider;
}

export async function getSigner() {
  const key = await retrieveKey();
  const signer = privateKeyToSigner(key);
  return signer;
}

function privateKeyToSigner(key: string) {
  if (!key) throw new Error("No private key provided");

  const formattedKey = key.trim().toLowerCase();
  if (isHexString(ensure0x(formattedKey))) {
    return new NonceKeeperWallet(ensure0x(formattedKey));
  }

  if (formattedKey.split(" ").length >= 6) {
    return NonceKeeperWallet.fromMnemonic(formattedKey);
  }

  throw new Error("Invalid private key format");
}

async function retrieveKey() {
  if (PRIVATE_KEY) {
    return PRIVATE_KEY;
  }
  if (MNEMONIC) {
    return MNEMONIC;
  }
  return password({
    message: `Please enter private key or mnemonic.`,
  });
}

export async function retrieveTokenInfo({
  chainName,
  multiProvider,
  tokenAddress,
}: {
  chainName: string;
  multiProvider: MultiProvider;
  tokenAddress: string;
}) {
  if (tokenAddress === AddressZero) {
    const { nativeToken } = multiProvider.getChainMetadata(chainName);

    return {
      decimals: nativeToken?.decimals ?? 18,
      symbol: nativeToken?.symbol ?? "ETH",
    };
  }

  const erc20 = ERC20__factory.connect(
    tokenAddress,
    multiProvider.getProvider(chainName),
  );

  const [decimals, symbol] = await Promise.all([
    erc20.decimals(),
    erc20.symbol(),
  ]);

  return { decimals, symbol };
}

type TransfersInfo = {
  multiProvider: MultiProvider;
  tokens: Array<{
    amount: BigNumber;
    chainName: string;
    tokenAddress: string;
  }>;
};

export async function retrieveTransfersInfo({
  multiProvider,
  tokens,
}: TransfersInfo) {
  return Promise.all(
    tokens.map(async ({ amount, chainName, tokenAddress }) => {
      const { decimals, symbol } = await retrieveTokenInfo({
        chainName,
        multiProvider,
        tokenAddress,
      });

      return { amount, chainName, decimals, symbol };
    }),
  );
}

export async function retrieveOriginInfo({
  multiProvider,
  tokens,
}: TransfersInfo) {
  const transfersInfo = await retrieveTransfersInfo({ multiProvider, tokens });

  return transfersInfo.map(
    ({ amount, chainName, decimals, symbol }) =>
      `${formatUnits(amount, decimals)} ${symbol} in on ${chainName}`,
  );
}

export async function retrieveTargetInfo({
  multiProvider,
  tokens,
}: TransfersInfo) {
  const transfersInfo = await retrieveTransfersInfo({ multiProvider, tokens });

  return transfersInfo.map(
    ({ amount, chainName, decimals, symbol }) =>
      `${formatUnits(amount, decimals)} ${symbol} out on ${chainName}`,
  );
}

/**
 * Build explorer tx link or fallback to raw hash
 */
export function getTxDetails(
  txHash: string,
  multiProvider: MultiProvider,
  chainId: string,
): string {
  const baseUrl = multiProvider.getChainMetadata(chainId).blockExplorers?.[0]?.url;
  return baseUrl ? `${baseUrl}/tx/${txHash}` : txHash;
}

export function retrieveTokenBalance(
  tokenAddress: string,
  ownerAddress: string,
  provider: Provider,
) {
  if (tokenAddress === AddressZero) {
    return provider.getBalance(ownerAddress);
  }

  const erc20 = ERC20__factory.connect(tokenAddress, provider);
  return erc20.balanceOf(ownerAddress);
}

const errorIfaces = [
  Auction__factory,
  Router__factory,
  SolverEscrow__factory,
  ERC20__factory,
].map((f) => f.createInterface());

/** Revert data -> "CustomError(args)" using the ABIs we ship. */
export function decodeRevert(data: string): string | undefined {
  if (!isHexString(data) || data.length < 10) return undefined;
  if (data.startsWith("0x08c379a0")) {
    return defaultAbiCoder.decode(["string"], "0x" + data.slice(10))[0];
  }
  for (const iface of errorIfaces) {
    try {
      const e = iface.parseError(data);
      return `${e.name}(${e.args.join(", ")})`;
    } catch {}
  }
  return `unknown revert ${data}`;
}

/**
 * Short human-readable error. A mined-but-reverted tx carries no revert data
 * in ethers v5, so it is replayed with eth_call to get the custom error name.
 */
export async function describeError(
  error: any,
  multiProvider?: MultiProvider,
): Promise<string> {
  const { transaction: tx, receipt } = error ?? {};
  let data = [error?.data, error?.error?.data, error?.error?.error?.data].find(
    (d) => isHexString(d) && d.length >= 10,
  );

  const provider = tx?.chainId && multiProvider?.tryGetProvider(tx.chainId);
  if (!data && provider && tx?.to && receipt) {
    // ponytail: replays on end-of-block state, so a revert caused by an
    // earlier tx in the same block may decode differently; trace the tx if that bites.
    data = await provider
      .call({ to: tx.to, from: tx.from, data: tx.data, value: tx.value }, receipt.blockNumber)
      .catch((e: any) => e?.data ?? e?.error?.data);
  }

  const reason =
    decodeRevert(data) ?? error?.reason ?? error?.message ?? String(error);
  const txHash = receipt?.transactionHash ?? error?.transactionHash;
  return txHash ? `${reason} (tx ${txHash}, block ${receipt?.blockNumber})` : reason;
}

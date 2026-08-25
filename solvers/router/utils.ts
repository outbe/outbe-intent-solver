import { defaultAbiCoder } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";
import { createLogger } from "../../logger.js";
import type { Router } from "../../typechain/Router.js";
import { metadata } from "./config/index.js";

export const log = createLogger(metadata.protocolName);

/**
 * Quote bridge fee for a settlement message to the destination domain.
 * The Router abstracts the underlying transport (Hyperlane / LayerZero).
 */
export async function quoteSettleFee(
  destination: Router,
  destinationDomain: BigNumber,
  orderId: string,
  fillerData: string,
): Promise<BigNumber> {
  const settlePayload = defaultAbiCoder.encode(
    ["bool", "bytes32[]", "bytes[]"],
    [true, [orderId], [fillerData]],
  );
  return destination.quote(destinationDomain, settlePayload);
}



/**
 * Get token decimals (native from chain metadata, query for ERC20)
 */
export async function getTokenDecimals(
  tokenAddress: string,
  chainName: string,
  multiProvider: any,
): Promise<number> {
  // Native token (address zero) — read from chain metadata (COEN=6, BNB=18, …)
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    return multiProvider.getChainMetadata(chainName).nativeToken?.decimals ?? 18;
  }

  // ERC20 token - query decimals
  const { ERC20__factory } = await import(
    "../../typechain/factories/ERC20__factory.js"
  );
  const provider = multiProvider.getProvider(chainName);
  const token = ERC20__factory.connect(tokenAddress, provider);
  return await token.decimals();
}

/**
 * Get token symbol (native token symbol from chain metadata, query for ERC20)
 */
export async function getTokenSymbol(
  tokenAddress: string,
  chainName: string,
  multiProvider: any,
): Promise<string> {
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    return multiProvider.getChainMetadata(chainName).nativeToken?.symbol ?? "ETH";
  }

  const { ERC20__factory } = await import(
    "../../typechain/factories/ERC20__factory.js"
  );
  const provider = multiProvider.getProvider(chainName);
  const token = ERC20__factory.connect(tokenAddress, provider);
  return await token.symbol();
}

/**
 * Format token amount as "1.234 SYMBOL" using token's decimals and symbol.
 */
export async function formatTokenAmount(
  amount: BigNumber,
  tokenAddress: string,
  chainName: string,
  multiProvider: any,
): Promise<string> {
  const [decimals, symbol] = await Promise.all([
    getTokenDecimals(tokenAddress, chainName, multiProvider),
    getTokenSymbol(tokenAddress, chainName, multiProvider),
  ]);
  return `${ethers.utils.formatUnits(amount, decimals)} ${symbol}`;
}

/**
 * Calculate solver output amount based on exchange rate
 * All calculations in BigNumber to preserve precision
 *
 * @param inputAmount - Input token amount in wei
 * @param exchangeRate - Exchange rate as decimal (e.g., 0.012)
 * @param inputDecimals - Input token decimals
 * @param outputDecimals - Output token decimals
 * @param quoteTolerance - Optional boost multiplier for auction (e.g., 0.02 = 2% more)
 * @returns Solver output amount in wei (with boost if provided)
 */
export function calculateSolverOutput(
  inputAmount: BigNumber,
  exchangeRate: number,
  inputDecimals: number,
  outputDecimals: number,
  quoteTolerance?: number,
): BigNumber {
  const RATE_SCALE = 18; // fixed-point scale for the rate itself: multiplied in below, divided out again — cancels out

  // Convert exchangeRate to BigNumber with 18 decimals precision
  // toFixed, not toString: tiny rates (e.g. 4.1e-12) stringify to exponential notation, which parseUnits rejects
  const exchangeRateBN = ethers.utils.parseUnits(
    exchangeRate.toFixed(RATE_SCALE),
    RATE_SCALE
  );

  // Calculate base output: (inputAmount * exchangeRate * 10^outputDecimals) / 10^(inputDecimals + RATE_SCALE)
  let output = inputAmount
    .mul(exchangeRateBN)
    .mul(BigNumber.from(10).pow(outputDecimals))
    .div(BigNumber.from(10).pow(inputDecimals + RATE_SCALE));

  // Apply boost if provided
  if (quoteTolerance !== undefined && quoteTolerance > 0) {
    const boostMultiplierBN = ethers.utils.parseUnits(
      (1 + quoteTolerance).toString(),
      RATE_SCALE
    );
    output = output
      .mul(boostMultiplierBN)
      .div(BigNumber.from(10).pow(RATE_SCALE));
  }

  return output;
}

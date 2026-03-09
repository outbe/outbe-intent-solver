import { defaultAbiCoder } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";
import { createLogger } from "../../logger.js";
import type { LayerZeroRouter } from "../../typechain/solvers/layerzeroRouter/contracts/LayerZeroRouter.js";
import { metadata } from "./config/index.js";

export const log = createLogger(metadata.protocolName);

/**
 * Calculate LayerZero fee for settlement message
 * Encodes payload and quotes the fee in one call
 */
export async function quoteSettleFee(
  destination: LayerZeroRouter,
  originChainId: BigNumber,
  orderId: string,
  fillerData: string,
): Promise<BigNumber> {
  const settlePayload = defaultAbiCoder.encode(
    ["bool", "bytes32[]", "bytes[]"],
    [true, [orderId], [fillerData]],
  );
  const fee = await destination.quote(originChainId, settlePayload, false);
  return fee.nativeFee;
}



/**
 * Get token decimals (18 for native, query for ERC20)
 */
export async function getTokenDecimals(
  tokenAddress: string,
  chainName: string,
  multiProvider: any,
): Promise<number> {
  // Native token (address zero)
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    return 18;
  }

  // ERC20 token - query decimals
  const { Erc20__factory } = await import(
    "../../typechain/factories/solvers/contracts/Erc20__factory.js"
  );
  const provider = multiProvider.getProvider(chainName);
  const token = Erc20__factory.connect(tokenAddress, provider);
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

  const { Erc20__factory } = await import(
    "../../typechain/factories/solvers/contracts/Erc20__factory.js"
  );
  const provider = multiProvider.getProvider(chainName);
  const token = Erc20__factory.connect(tokenAddress, provider);
  return await token.symbol();
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
  const RATE_DECIMALS = 18; // Ethereum standard precision

  // Convert exchangeRate to BigNumber with 18 decimals precision
  const exchangeRateBN = ethers.utils.parseUnits(
    exchangeRate.toString(),
    RATE_DECIMALS
  );

  // Calculate base output: (inputAmount * exchangeRate * 10^outputDecimals) / 10^(inputDecimals + RATE_DECIMALS)
  let output = inputAmount
    .mul(exchangeRateBN)
    .mul(BigNumber.from(10).pow(outputDecimals))
    .div(BigNumber.from(10).pow(inputDecimals + RATE_DECIMALS));

  // Apply boost if provided
  if (quoteTolerance !== undefined && quoteTolerance > 0) {
    const boostMultiplierBN = ethers.utils.parseUnits(
      (1 + quoteTolerance).toString(),
      RATE_DECIMALS
    );
    output = output
      .mul(boostMultiplierBN)
      .div(BigNumber.from(10).pow(RATE_DECIMALS));
  }

  return output;
}

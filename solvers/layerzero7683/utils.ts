import { defaultAbiCoder } from "@ethersproject/abi";
import type { BigNumber } from "@ethersproject/bignumber";
import { createLogger } from "../../logger.js";
import type { LayerZero7683 } from "../../typechain/layerzero7683/contracts/LayerZero7683.js";
import { metadata } from "./config/index.js";

export const log = createLogger(metadata.protocolName);

/**
 * Calculate LayerZero fee for settlement message
 * Encodes payload and quotes the fee in one call
 */
export async function quoteSettleFee(
  destination: LayerZero7683,
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
 * Decode settlement payload from LayerZero message
 * Returns orderIds array if it's a settlement message, undefined otherwise
 */
export function decodeSettlePayload(payload: string): string[] | undefined {
  try {
    const [isSettle, orderIds] = defaultAbiCoder.decode(
      ["bool", "bytes32[]", "bytes[]"],
      payload,
    ) as [boolean, string[], string[]];

    return isSettle ? orderIds : undefined;
  } catch {
    return undefined;
  }
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
    "../../typechain/factories/contracts/Erc20__factory.js"
  );
  const provider = multiProvider.getProvider(chainName);
  const token = Erc20__factory.connect(tokenAddress, provider);
  return await token.decimals();
}

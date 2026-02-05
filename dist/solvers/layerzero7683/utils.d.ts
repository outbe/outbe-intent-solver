import type { BigNumber } from "@ethersproject/bignumber";
import type { LayerZero7683 } from "../../typechain/layerzero7683/contracts/LayerZero7683.js";
export declare const log: import("pino").Logger<never, boolean>;
/**
 * Calculate LayerZero fee for settlement message
 * Encodes payload and quotes the fee in one call
 */
export declare function quoteSettleFee(destination: LayerZero7683, originChainId: BigNumber, orderId: string, fillerData: string): Promise<BigNumber>;
/**
 * Decode settlement payload from LayerZero message
 * Returns orderIds array if it's a settlement message, undefined otherwise
 */
export declare function decodeSettlePayload(payload: string): string[] | undefined;
/**
 * Get token decimals (18 for native, query for ERC20)
 */
export declare function getTokenDecimals(tokenAddress: string, chainName: string, multiProvider: any): Promise<number>;
//# sourceMappingURL=utils.d.ts.map
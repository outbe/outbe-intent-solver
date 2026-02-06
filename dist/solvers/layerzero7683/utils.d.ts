import { BigNumber } from "@ethersproject/bignumber";
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
/**
 * Calculate solver output amount based on exchange rate
 * All calculations in BigNumber to preserve precision
 *
 * @param inputAmount - Input token amount in wei
 * @param exchangeRate - Exchange rate as decimal (e.g., 0.012)
 * @param inputDecimals - Input token decimals
 * @param outputDecimals - Output token decimals
 * @param quoteBoost - Optional boost multiplier for auction (e.g., 0.02 = 2% more)
 * @returns Solver output amount in wei (with boost if provided)
 */
export declare function calculateSolverOutput(inputAmount: BigNumber, exchangeRate: number, inputDecimals: number, outputDecimals: number, quoteBoost?: number): BigNumber;
//# sourceMappingURL=utils.d.ts.map
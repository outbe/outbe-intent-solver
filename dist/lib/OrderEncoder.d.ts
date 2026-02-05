import { BigNumber } from "ethers";
/**
 * OrderData structure matching Solidity struct in libs/OrderEncoder.sol
 */
export interface OrderData {
    sender: string;
    recipient: string;
    inputToken: string;
    outputToken: string;
    amountIn: BigNumber;
    amountOut: BigNumber;
    senderNonce: BigNumber;
    originDomain: number;
    destinationDomain: number;
    destinationSettler: string;
    fillDeadline: number;
    createdAt: number;
    data: string;
}
/**
 * ORDER_DATA_TYPE constant from OrderEncoder.sol
 */
export declare const ORDER_DATA_TYPE: string;
/**
 * ORDER_DATA_TYPE_HASH constant from OrderEncoder.sol
 * keccak256(ORDER_DATA_TYPE)
 */
export declare const ORDER_DATA_TYPE_HASH: string;
/**
 * Returns the OrderData type hash
 * Matches OrderEncoder.orderDataType() in Solidity
 */
export declare function orderDataType(): string;
/**
 * Encodes OrderData to bytes
 * Matches OrderEncoder.encode() in Solidity
 */
export declare function encode(order: OrderData): string;
/**
 * Decodes bytes to OrderData
 * Matches OrderEncoder.decode() in Solidity
 */
export declare function decode(orderBytes: string): OrderData;
/**
 * Calculates the order ID (keccak256 hash of encoded order)
 * Matches OrderEncoder.id() in Solidity
 */
export declare function id(order: OrderData): string;
/**
 * Helper to create OrderData with address padding
 */
export declare function createOrderData(params: {
    sender: string;
    recipient: string;
    inputToken: string;
    outputToken: string;
    amountIn: BigNumber | string;
    amountOut: BigNumber | string;
    senderNonce: BigNumber | string;
    originDomain: number;
    destinationDomain: number;
    destinationSettler: string;
    fillDeadline: number;
    data?: string;
}): OrderData;
//# sourceMappingURL=OrderEncoder.d.ts.map
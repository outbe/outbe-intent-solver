import { utils, BigNumber } from "ethers";

/**
 * OrderData structure matching Solidity struct in libs/OrderEncoder.sol
 */
export interface OrderData {
  sender: string; // bytes32
  recipient: string; // bytes32
  inputToken: string; // bytes32
  outputToken: string; // bytes32
  amountIn: BigNumber; // uint256
  amountOut: BigNumber; // uint256
  senderNonce: BigNumber; // uint256
  originDomain: number; // uint32
  destinationDomain: number; // uint32
  destinationSettler: string; // bytes32
  fillDeadline: number; // uint32
  createdAt: number; // uint32
  data: string; // bytes
}

/**
 * ORDER_DATA_TYPE constant from OrderEncoder.sol
 */
export const ORDER_DATA_TYPE =
  "OrderData(" +
  "bytes32 sender," +
  "bytes32 recipient," +
  "bytes32 inputToken," +
  "bytes32 outputToken," +
  "uint256 amountIn," +
  "uint256 amountOut," +
  "uint256 senderNonce," +
  "uint32 originDomain," +
  "uint32 destinationDomain," +
  "bytes32 destinationSettler," +
  "uint32 fillDeadline," +
  "uint32 createdAt," +
  "bytes data)";

/**
 * ORDER_DATA_TYPE_HASH constant from OrderEncoder.sol
 * keccak256(ORDER_DATA_TYPE)
 */
export const ORDER_DATA_TYPE_HASH = utils.keccak256(
  utils.toUtf8Bytes(ORDER_DATA_TYPE),
);

/**
 * Returns the OrderData type hash
 * Matches OrderEncoder.orderDataType() in Solidity
 */
export function orderDataType(): string {
  return ORDER_DATA_TYPE_HASH;
}

/**
 * Encodes OrderData to bytes
 * Matches OrderEncoder.encode() in Solidity
 */
export function encode(order: OrderData): string {
  const abiCoder = new utils.AbiCoder();

  return abiCoder.encode(
    [
      "tuple(bytes32,bytes32,bytes32,bytes32,uint256,uint256,uint256,uint32,uint32,bytes32,uint32,uint32,bytes)",
    ],
    [
      [
        order.sender,
        order.recipient,
        order.inputToken,
        order.outputToken,
        order.amountIn,
        order.amountOut,
        order.senderNonce,
        order.originDomain,
        order.destinationDomain,
        order.destinationSettler,
        order.fillDeadline,
        order.createdAt,
        order.data,
      ],
    ],
  );
}

/**
 * Decodes bytes to OrderData
 * Matches OrderEncoder.decode() in Solidity
 */
export function decode(orderBytes: string): OrderData {
  const abiCoder = new utils.AbiCoder();

  const decoded = abiCoder.decode(
    [
      "tuple(bytes32,bytes32,bytes32,bytes32,uint256,uint256,uint256,uint32,uint32,bytes32,uint32,uint32,bytes)",
    ],
    orderBytes,
  )[0];

  return {
    sender: decoded[0],
    recipient: decoded[1],
    inputToken: decoded[2],
    outputToken: decoded[3],
    amountIn: decoded[4],
    amountOut: decoded[5],
    senderNonce: decoded[6],
    originDomain: decoded[7],
    destinationDomain: decoded[8],
    destinationSettler: decoded[9],
    fillDeadline: decoded[10],
    createdAt: decoded[11],
    data: decoded[12],
  };
}

/**
 * Calculates the order ID (keccak256 hash of encoded order)
 * Matches OrderEncoder.id() in Solidity
 */
export function id(order: OrderData): string {
  return utils.keccak256(encode(order));
}

/**
 * Helper to create OrderData with address padding
 */
export function createOrderData(params: {
  sender: string; // address (will be padded to bytes32)
  recipient: string; // address (will be padded to bytes32)
  inputToken: string; // address (will be padded to bytes32)
  outputToken: string; // address (will be padded to bytes32)
  amountIn: BigNumber | string; // uint256
  amountOut: BigNumber | string; // uint256
  senderNonce: BigNumber | string; // uint256
  originDomain: number;
  destinationDomain: number;
  destinationSettler: string; // address (will be padded to bytes32)
  fillDeadline: number;
  data?: string;
}): OrderData {
  return {
    sender: utils.hexZeroPad(params.sender, 32),
    recipient: utils.hexZeroPad(params.recipient, 32),
    inputToken: utils.hexZeroPad(params.inputToken, 32),
    outputToken: utils.hexZeroPad(params.outputToken, 32),
    amountIn: BigNumber.from(params.amountIn),
    amountOut: BigNumber.from(params.amountOut),
    senderNonce: BigNumber.from(params.senderNonce),
    originDomain: params.originDomain,
    destinationDomain: params.destinationDomain,
    destinationSettler: utils.hexZeroPad(params.destinationSettler, 32),
    fillDeadline: params.fillDeadline,
    createdAt: 0, // Will be set by the contract
    data: params.data || "0x",
  };
}

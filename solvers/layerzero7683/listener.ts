import { chainIdsToName } from "../../config/index.js";
import type { TypedListener } from "../../typechain/common.js";
import type {
  LayerZero7683,
  OpenEvent,
} from "../../typechain/layerzero7683/contracts/LayerZero7683.js";
import { BaseListener } from "../BaseListener.js";
import { metadata } from "./config/index.js";
import type { OpenEventArgs, Layerzero7683Metadata } from "./types.js";
import { log } from "./utils.js";
import { getLastIndexedBlocks } from "./db.js";
import { LayerZero7683__factory } from "../../typechain/factories/layerzero7683/contracts/LayerZero7683__factory.js";

export class Layerzero7683Listener extends BaseListener<
  LayerZero7683,
  OpenEvent,
  OpenEventArgs
> {
  constructor(metadata: Layerzero7683Metadata) {
    super(LayerZero7683__factory, "Open", metadata, log);
  }

  protected override parseEventArgs(
    args: Parameters<TypedListener<OpenEvent>>,
  ) {
    const [orderId, resolvedOrder] = args;
    return {
      orderId,
      senderAddress: resolvedOrder.user,
      recipients: resolvedOrder.maxSpent.map(({ chainId, recipient }) => ({
        destinationChainName: chainIdsToName[chainId.toString()],
        recipientAddress: recipient,
      })),
      resolvedOrder,
    };
  }
}

export const create = async () => {
  const { contracts } = metadata;
  const blocksByChain = await getLastIndexedBlocks();

  metadata.contracts = contracts.map((contract) => {
    const chainBlockNumber =
      blocksByChain[contract.chainName]?.blockNumber;

    if (
      chainBlockNumber &&
      chainBlockNumber >= (contract.initialBlock ?? 0)
    ) {
      return {
        ...contract,
        initialBlock: blocksByChain[contract.chainName].blockNumber,
        processedIds: blocksByChain[contract.chainName].processedIds,
      };
    }
    return contract;
  });

  return new Layerzero7683Listener(metadata).create();
};

/**
 * Listen for MessageReceived events to track settlement delivery
 * Logs when settlement messages arrive on origin chain via LayerZero
 * Returns cleanup function to remove all listeners
 */
// function setupSettlementListener(): () => void {
//   const { contracts } = metadata;
//   const cleanupFns: Array<() => void> = [];
//
//   contracts.forEach(({ chainName, address }) => {
//     const provider = multiProvider.getProvider(chainName);
//     const router = LayerZero7683__factory.connect(address, provider);
//
//     const messageHandler: TypedListener<MessageReceivedEvent> = (
//       srcEid: number,
//       _sender: string,
//       payload: string,
//       event,
//     ) => {
//       const orderIds = decodeSettlePayload(payload);
//
//       if (orderIds) {
//         orderIds.forEach((orderId: string) => {
//           log.info({
//             msg: "✅ Settlement delivered to origin chain",
//             orderId,
//             originChain: chainName,
//             srcEid,
//             blockNumber: event.blockNumber,
//             txHash: event.transactionHash,
//           });
//         });
//       }
//     };
//
//     router.on("MessageReceived", messageHandler);
//
//     // Store cleanup function for this listener
//     cleanupFns.push(() => {
//       router.off("MessageReceived", messageHandler);
//       log.debug({
//         msg: "Stopped settlement delivery listener",
//         chain: chainName,
//       });
//     });
//
//     log.info({
//       msg: "Started settlement delivery listener",
//       chain: chainName,
//       router: address,
//     });
//   });
//
//   // Return combined cleanup function
//   return () => {
//     cleanupFns.forEach((cleanup) => cleanup());
//   };
// }

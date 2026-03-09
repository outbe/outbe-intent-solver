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
import type {MultiProvider} from "@hyperlane-xyz/sdk";

export class Layerzero7683Listener extends BaseListener<
  LayerZero7683,
  OpenEvent,
  OpenEventArgs
> {
  constructor(metadata: Layerzero7683Metadata,multiProvider: MultiProvider) {
    super(LayerZero7683__factory, "Open", metadata, log,multiProvider);
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

export const create = async (
    multiProvider: MultiProvider,
) => {
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

  return new Layerzero7683Listener(metadata,multiProvider).create();
};


import { chainIdsToName } from "../../config/index.js";
import type { TypedListener } from "../../typechain/common.js";
import type {
  Router,
  OpenEvent,
} from "../../typechain/Router.js";
import { BaseListener } from "../BaseListener.js";
import { metadata } from "./config/index.js";
import type { OpenEventArgs, RouterMetadata } from "./types.js";
import { log } from "./utils.js";
import { getLastIndexedBlocks } from "./db.js";
import { Router__factory } from "../../typechain/factories/Router__factory.js";
import type {MultiProvider} from "@hyperlane-xyz/sdk";

export class RouterListener extends BaseListener<
  Router,
  OpenEvent,
  OpenEventArgs
> {
  constructor(metadata: RouterMetadata,multiProvider: MultiProvider) {
    super(Router__factory, "Open", metadata, log,multiProvider);
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

  return new RouterListener(metadata,multiProvider).create();
};

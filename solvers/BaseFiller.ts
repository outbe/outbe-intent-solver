import type { MultiProvider } from "@hyperlane-xyz/sdk";
import type { Result } from "@hyperlane-xyz/utils";
import {
  type GenericAllowBlockLists,
  isAllowedIntent,
} from "../config/index.js";
import type { Logger } from "../logger.js";
import type { BaseMetadata } from "./types.js";

export type ParsedArgs = {
  orderId: string;
  senderAddress: string;
  recipients: Array<{
    destinationChainName: string;
    recipientAddress: string;
  }>;
};

export abstract class BaseFiller<
  TMetadata extends BaseMetadata,
  TParsedArgs extends ParsedArgs,
  TIntentData extends unknown,
> {
  protected constructor(
    readonly multiProvider: MultiProvider,
    readonly allowBlockLists: GenericAllowBlockLists,
    readonly metadata: TMetadata,
    readonly log: Logger,
  ) {}

  create() {
    return async (
      parsedArgs: TParsedArgs,
      originChainName: string,
      blockNumber: number,
      winningAmount?: any,
    ) => {


      const intent = await this.prepareIntent(parsedArgs);

      if (!intent.success) {
        this.log.error(`Failed evaluating filling Intent: ${intent.error}`);
        return;
      }

      const { data } = intent;

      try {
        await this.fill(parsedArgs, data, originChainName, blockNumber, winningAmount);

        await this.settleOrder(parsedArgs, data, originChainName);
      } catch (error) {
        this.log.error({
          msg: `Failed processing intent`,
          intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
          error: JSON.stringify(error),
        });
      }
    };
  }



  protected async prepareIntent(
    parsedArgs: TParsedArgs,
  ): Promise<Result<TIntentData>> {
    const { senderAddress, recipients } = parsedArgs;

    if (!this.isAllowedIntent({ senderAddress, recipients })) {
      throw new Error("Not allowed intent");
    }

    return { error: "Not implemented", success: false };
  }

  protected abstract fill(
    parsedArgs: TParsedArgs,
    data: TIntentData,
    originChainName: string,
    blockNumber: number,
    winningAmount?: any,
  ): Promise<void>;

  protected async settleOrder(
    parsedArgs: TParsedArgs,
    data: TIntentData,
    originChainName: string,
  ) {
    return;
  }

  protected isAllowedIntent({
    senderAddress,
    recipients,
  }: {
    senderAddress: string;
    recipients: Array<{
      destinationChainName: string;
      recipientAddress: string;
    }>;
  }) {
    return recipients.every(({ destinationChainName, recipientAddress }) =>
      isAllowedIntent(this.allowBlockLists, {
        senderAddress,
        destinationDomain: destinationChainName,
        recipientAddress,
      }),
    );
  }
}

import type { MultiProvider } from "@hyperlane-xyz/sdk";
import type { Result } from "@hyperlane-xyz/utils";
import type { Logger } from "../logger.js";
import type { BaseMetadata, BuildRules } from "./types.js";

export type ParsedArgs = {
  orderId: string;
  senderAddress: string;
  recipients: Array<{
    destinationChainName: string;
    recipientAddress: string;
  }>;
};

export type PrepareResult = {
  shouldFill: boolean;
  winningAmount?: any;
};

export type BaseRule<
  TMetadata extends BaseMetadata,
  TParsedArgs extends ParsedArgs,
  TIntentData extends unknown,
> = (
  parsedArgs: TParsedArgs,
  context: BasePrepare<TMetadata, TParsedArgs, TIntentData>,
) => Promise<Result<string>>;

export abstract class BasePrepare<
  TMetadata extends BaseMetadata,
  TParsedArgs extends ParsedArgs,
  TIntentData extends unknown,
> {
  rules: Array<BaseRule<TMetadata, TParsedArgs, TIntentData>> = [];

  protected defaultPollInterval: number = 3000;

  protected constructor(
    readonly multiProvider: MultiProvider,
    readonly metadata: TMetadata,
    readonly log: Logger,
    rulesConfig?: BuildRules<BaseRule<TMetadata, TParsedArgs, TIntentData>>,
  ) {
    if (rulesConfig) this.rules = this.buildRules(rulesConfig);
  }

  create() {
    return async (
      parsedArgs: TParsedArgs,
      originChainName: string,
      blockNumber: number,
    ): Promise<PrepareResult> => {
      // Evaluate rules before prepare
      const rulesResult = await this.evaluateRules(parsedArgs);

      if (!rulesResult.success) {
        this.log.error({
          msg: "Rules validation failed",
          orderId: parsedArgs.orderId,
          error: rulesResult.error,
        });
        return { shouldFill: false };
      }

      // Call solver-specific prepare logic
      return this.prepare(parsedArgs, originChainName, blockNumber);
    };
  }

  protected async evaluateRules(
    parsedArgs: TParsedArgs,
  ): Promise<Result<string>> {
    let result: Result<string> = { success: true, data: "No rules" };

    for (const rule of this.rules) {
      result = await rule(parsedArgs, this);

      if (!result.success) {
        break;
      }
    }

    return result;
  }

  /**
   * Solver-specific prepare logic
   * Should return shouldFill flag and optional winningAmount
   */
  protected abstract prepare(
    parsedArgs: TParsedArgs,
    originChainName: string,
    blockNumber: number,
  ): Promise<PrepareResult>;

  private buildRules({
    base = [],
    custom,
  }: BuildRules<BaseRule<TMetadata, TParsedArgs, TIntentData>>): Array<
    BaseRule<TMetadata, TParsedArgs, TIntentData>
  > {
    const customRules = [];

    if (this.metadata.customRules?.rules.length) {
      if (!custom) {
        throw new Error(
          "Custom rules are specified in metadata, but no corresponding rule functions were provided.",
        );
      }

      for (let i = 0; i < this.metadata.customRules.rules.length; i++) {
        const rule = this.metadata.customRules.rules[i];
        const ruleFn = custom[rule.name];

        if (!ruleFn) {
          throw new Error(
            `Custom rule "${rule.name}" is specified in metadata but is not provided in the custom rules configuration.`,
          );
        }

        customRules.push(ruleFn(rule.args));
      }
    }

    const keepBaseRules = this.metadata.customRules?.keepBaseRules ?? true;

    return keepBaseRules ? [...base, ...customRules] : customRules;
  }
}

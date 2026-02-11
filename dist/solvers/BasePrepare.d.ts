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
export type BaseRule<TMetadata extends BaseMetadata, TParsedArgs extends ParsedArgs, TIntentData extends unknown> = (parsedArgs: TParsedArgs, context: BasePrepare<TMetadata, TParsedArgs, TIntentData>) => Promise<Result<string>>;
export declare abstract class BasePrepare<TMetadata extends BaseMetadata, TParsedArgs extends ParsedArgs, TIntentData extends unknown> {
    readonly multiProvider: MultiProvider;
    readonly metadata: TMetadata;
    readonly log: Logger;
    rules: Array<BaseRule<TMetadata, TParsedArgs, TIntentData>>;
    protected constructor(multiProvider: MultiProvider, metadata: TMetadata, log: Logger, rulesConfig?: BuildRules<BaseRule<TMetadata, TParsedArgs, TIntentData>>);
    create(): (parsedArgs: TParsedArgs, originChainName: string, blockNumber: number) => Promise<PrepareResult>;
    protected evaluateRules(parsedArgs: TParsedArgs): Promise<Result<string>>;
    /**
     * Solver-specific prepare logic
     * Should return shouldFill flag and optional winningAmount
     */
    protected abstract prepare(parsedArgs: TParsedArgs, originChainName: string, blockNumber: number): Promise<PrepareResult>;
    private buildRules;
}
//# sourceMappingURL=BasePrepare.d.ts.map
import { BigNumber } from "@ethersproject/bignumber";
import type { MultiProvider } from "@hyperlane-xyz/sdk";
import { type Result } from "@hyperlane-xyz/utils";
import type { Layerzero7683Metadata, IntentData, OpenEventArgs } from "./types.js";
import { BaseFiller } from "../BaseFiller.js";
import { BuildRules, RulesMap } from "../types.js";
export type LayerZero7683Rule = LayerZero7683Filler["rules"][number];
declare class LayerZero7683Filler extends BaseFiller<Layerzero7683Metadata, OpenEventArgs, IntentData> {
    constructor(multiProvider: MultiProvider, rules?: BuildRules<LayerZero7683Rule>);
    protected retrieveOriginInfo(parsedArgs: OpenEventArgs): Promise<string[]>;
    protected retrieveTargetInfo(parsedArgs: OpenEventArgs): Promise<string[]>;
    protected prepareIntent(parsedArgs: OpenEventArgs): Promise<Result<IntentData>>;
    protected fill(parsedArgs: OpenEventArgs, data: IntentData, originChainName: string, blockNumber: number, winningAmount?: BigNumber): Promise<void>;
    protected settleOrder(parsedArgs: OpenEventArgs, data: IntentData, originChainName: string): Promise<void>;
}
export declare const create: (multiProvider: MultiProvider, customRules?: RulesMap<LayerZero7683Rule>) => (parsedArgs: OpenEventArgs, originChainName: string, blockNumber: number, winningAmount?: any) => Promise<void>;
export {};
//# sourceMappingURL=filler.d.ts.map
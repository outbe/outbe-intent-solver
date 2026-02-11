import type { MultiProvider } from "@hyperlane-xyz/sdk";
import type { OpenEventArgs, IntentData, Layerzero7683Metadata } from "./types.js";
import { type BaseRule } from "../BasePrepare.js";
import type { RulesMap } from "../types.js";
export type LayerZero7683Rule = BaseRule<Layerzero7683Metadata, OpenEventArgs, IntentData>;
export declare const create: (multiProvider: MultiProvider, customRules?: RulesMap<LayerZero7683Rule>) => (parsedArgs: OpenEventArgs, originChainName: string, blockNumber: number) => Promise<import("../BasePrepare.js").PrepareResult>;
//# sourceMappingURL=prepare.d.ts.map
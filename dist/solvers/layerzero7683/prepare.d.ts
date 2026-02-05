import { BigNumber } from "@ethersproject/bignumber";
import type { MultiProvider } from "@hyperlane-xyz/sdk";
import type { OpenEventArgs } from "./types.js";
export declare const create: (multiProvider: MultiProvider) => (args: OpenEventArgs, originChainName: string, blockNumber: number) => Promise<{
    shouldFill: boolean;
    winningAmount?: BigNumber;
}>;
//# sourceMappingURL=prepare.d.ts.map
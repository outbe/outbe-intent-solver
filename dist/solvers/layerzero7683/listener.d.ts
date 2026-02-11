import type { TypedListener } from "../../typechain/common.js";
import type { LayerZero7683, OpenEvent } from "../../typechain/layerzero7683/contracts/LayerZero7683.js";
import { BaseListener } from "../BaseListener.js";
import type { OpenEventArgs, Layerzero7683Metadata } from "./types.js";
import type { MultiProvider } from "@hyperlane-xyz/sdk";
export declare class Layerzero7683Listener extends BaseListener<LayerZero7683, OpenEvent, OpenEventArgs> {
    constructor(metadata: Layerzero7683Metadata, multiProvider: MultiProvider);
    protected parseEventArgs(args: Parameters<TypedListener<OpenEvent>>): {
        orderId: string;
        senderAddress: string;
        recipients: {
            destinationChainName: string;
            recipientAddress: string;
        }[];
        resolvedOrder: import("../../typechain/layerzero7683/contracts/LayerZero7683.js").ResolvedCrossChainOrderStructOutput;
    };
}
export declare const create: (multiProvider: MultiProvider) => Promise<(handler: (args: OpenEventArgs, originChainName: string, blockNumber: number) => void) => () => void>;
/**
 * Listen for MessageReceived events to track settlement delivery
 * Logs when settlement messages arrive on origin chain via LayerZero
 * Returns cleanup function to remove all listeners
 */
//# sourceMappingURL=listener.d.ts.map
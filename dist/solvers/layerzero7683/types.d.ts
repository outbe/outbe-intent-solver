import type { BigNumber } from "ethers";
import z from "zod";
import type { OpenEventObject } from "../../typechain/layerzero7683/contracts/LayerZero7683.js";
export type ExtractStruct<T, K extends object> = T extends (infer U & K)[] ? U[] : never;
export type ResolvedCrossChainOrder = Omit<OpenEventObject["resolvedOrder"], "minReceived" | "maxSpent" | "fillInstructions"> & {
    minReceived: ExtractStruct<OpenEventObject["resolvedOrder"]["minReceived"], {
        token: string;
    }>;
    maxSpent: ExtractStruct<OpenEventObject["resolvedOrder"]["maxSpent"], {
        token: string;
    }>;
    fillInstructions: ExtractStruct<OpenEventObject["resolvedOrder"]["fillInstructions"], {
        destinationChainId: BigNumber;
    }>;
};
export interface OpenEventArgs {
    orderId: string;
    senderAddress: ResolvedCrossChainOrder["user"];
    recipients: Array<{
        destinationChainName: string;
        recipientAddress: string;
    }>;
    resolvedOrder: ResolvedCrossChainOrder;
}
export type IntentData = {
    fillInstructions: ResolvedCrossChainOrder["fillInstructions"];
    maxSpent: ResolvedCrossChainOrder["maxSpent"];
};
export declare const Layerzero7683MetadataSchema: z.ZodObject<{
    protocolName: z.ZodString;
    contracts: z.ZodArray<z.ZodObject<{
        address: z.ZodEffects<z.ZodString, string, string>;
        chainName: z.ZodEffects<z.ZodString, string, string>;
        pollInterval: z.ZodOptional<z.ZodNumber>;
        confirmationBlocks: z.ZodOptional<z.ZodNumber>;
        initialBlock: z.ZodOptional<z.ZodNumber>;
        processedIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        chainName: string;
        pollInterval?: number | undefined;
        confirmationBlocks?: number | undefined;
        initialBlock?: number | undefined;
        processedIds?: string[] | undefined;
    }, {
        address: string;
        chainName: string;
        pollInterval?: number | undefined;
        confirmationBlocks?: number | undefined;
        initialBlock?: number | undefined;
        processedIds?: string[] | undefined;
    }>, "many">;
    customRules: z.ZodOptional<z.ZodObject<{
        rules: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            args: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            args?: any;
        }, {
            name: string;
            args?: any;
        }>, "many">;
        keepBaseRules: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        rules: {
            name: string;
            args?: any;
        }[];
        keepBaseRules?: boolean | undefined;
    }, {
        rules: {
            name: string;
            args?: any;
        }[];
        keepBaseRules?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    protocolName: string;
    contracts: {
        address: string;
        chainName: string;
        pollInterval?: number | undefined;
        confirmationBlocks?: number | undefined;
        initialBlock?: number | undefined;
        processedIds?: string[] | undefined;
    }[];
    customRules?: {
        rules: {
            name: string;
            args?: any;
        }[];
        keepBaseRules?: boolean | undefined;
    } | undefined;
}, {
    protocolName: string;
    contracts: {
        address: string;
        chainName: string;
        pollInterval?: number | undefined;
        confirmationBlocks?: number | undefined;
        initialBlock?: number | undefined;
        processedIds?: string[] | undefined;
    }[];
    customRules?: {
        rules: {
            name: string;
            args?: any;
        }[];
        keepBaseRules?: boolean | undefined;
    } | undefined;
}>;
export type Layerzero7683Metadata = z.infer<typeof Layerzero7683MetadataSchema>;
//# sourceMappingURL=types.d.ts.map
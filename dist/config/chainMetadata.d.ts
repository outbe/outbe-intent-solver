import { ExplorerFamily } from "@hyperlane-xyz/sdk";
import { ProtocolType } from "@hyperlane-xyz/utils";
declare const chainMetadata: {
    outbe: {
        protocol: ProtocolType;
        chainId: number;
        domainId: number;
        name: string;
        displayName: string;
        nativeToken: {
            name: string;
            symbol: string;
            decimals: number;
        };
        rpcUrls: {
            http: string;
            pagination: {
                maxBlockRange: number;
                minBlockNumber: number;
            };
        }[];
        blockExplorers: never[];
    };
    bsctestnet: {
        protocol: ProtocolType;
        chainId: number;
        domainId: number;
        name: string;
        displayName: string;
        nativeToken: {
            name: string;
            symbol: string;
            decimals: number;
        };
        rpcUrls: {
            http: string;
            pagination: {
                maxBlockRange: number;
            };
        }[];
        blockExplorers: {
            name: string;
            url: string;
            apiUrl: string;
            family: ExplorerFamily;
        }[];
    };
};
export { chainMetadata };
//# sourceMappingURL=chainMetadata.d.ts.map
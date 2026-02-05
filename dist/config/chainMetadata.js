import { z } from "zod";
import { ChainMetadataSchema, ExplorerFamily } from "@hyperlane-xyz/sdk";
import { ProtocolType } from "@hyperlane-xyz/utils";
const customChainMetadata = {
    outbe: {
        protocol: ProtocolType.Ethereum,
        chainId: 424242,
        domainId: 424242,
        name: "outbe_dev",
        displayName: "Outbe Dev",
        nativeToken: {
            name: "Coen",
            symbol: "COEN",
            decimals: 18,
        },
        rpcUrls: [
            {
                http: "https://eth.d.outbe.net/",
                pagination: {
                    maxBlockRange: 1999,
                    minBlockNumber: 1,
                },
            },
        ],
        blockExplorers: [],
    },
    bsctestnet: {
        protocol: ProtocolType.Ethereum,
        chainId: 97,
        domainId: 97,
        name: "bsctestnet",
        displayName: "BSC Testnet",
        nativeToken: {
            name: "BNB",
            symbol: "BNB",
            decimals: 18,
        },
        rpcUrls: [
            {
                http: 'https://bsc-testnet-rpc.publicnode.com',
                pagination: {
                    maxBlockRange: 5000,
                },
            },
        ],
        blockExplorers: [
            {
                name: "BscScan",
                url: "https://testnet.bscscan.com",
                apiUrl: "https://api-testnet.bscscan.com/api",
                family: ExplorerFamily.Etherscan,
            },
        ],
    },
};
const chainMetadata = customChainMetadata;
z.record(z.string(), ChainMetadataSchema).parse(chainMetadata);
export { chainMetadata };
//# sourceMappingURL=chainMetadata.js.map
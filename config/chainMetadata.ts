import { z } from "zod";

import { ChainMap, ChainMetadata, ChainMetadataSchema, ExplorerFamily } from "@hyperlane-xyz/sdk";
import { ProtocolType } from "@hyperlane-xyz/utils";


const customChainMetadata: ChainMap<ChainMetadata> = {
    // outbe: {
    //     protocol: ProtocolType.Ethereum,
    //     chainId: 424242,
    //     domainId: 424242,
    //     name: "outbe",
    //     displayName: "Outbe Dev",
    //     nativeToken: {
    //         name: "Coen",
    //         symbol: "COEN",
    //         decimals: 18,
    //     },
    //     rpcUrls: [
    //         {
    //             http: "https://eth.d.outbe.net/",
    //             pagination: {
    //                 maxBlockRange: 1999,
    //                 minBlockNumber: 1,
    //             },
    //         },
    //     ],
    //     blockExplorers: [],
    // },
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
        http: 'https://97.rpc.thirdweb.com/34f11a24bb8f2c2d5586f38df502f6a1',
        pagination: {
          maxBlockRange: 1000,
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
    transactionOverrides: {
      gasPrice: 3_000_000_000, // 3 gwei
    },
  },

    outbetestnet: {
        protocol: ProtocolType.Ethereum,
        chainId: 512215,
        domainId: 512215,
        name: "outbetestnet",
        displayName: "Outbe Testnet",
        nativeToken: {
            name: "Coen",
            symbol: "COEN",
            decimals: 18,
        },
        rpcUrls: [
            {
                http: "https://eth.testnet.outbe.net",
                pagination: {
                    maxBlockRange: 1999,
                    minBlockNumber: 1,
                },
            },
        ],
        blockExplorers: [],
    },



};

const chainMetadata = customChainMetadata

z.record(z.string(), ChainMetadataSchema).parse(chainMetadata);

export { chainMetadata };

import {z} from "zod";

import {ChainMap, ChainMetadata, ChainMetadataSchema, ExplorerFamily} from "@hyperlane-xyz/sdk";
import {ProtocolType} from "@hyperlane-xyz/utils";

const customChainMetadata: ChainMap<ChainMetadata> = {
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
                http: 'https://data-seed-prebsc-1-s1.binance.org:8545',
                pagination: {
                    maxBlockRange: 1000,
                },
            },
            {
                http: 'https://bsc-testnet-rpc.publicnode.com',
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
    },

    sepolia: {
        protocol: ProtocolType.Ethereum,
        chainId: 11155111,
        domainId: 11155111,
        name: "sepolia",
        displayName: "Sepolia",
        nativeToken: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: [
            {
                http: 'https://clean-wiser-energy.ethereum-sepolia.quiknode.pro/8b14fb75c5bb2dee7e2963936532ea1d04c833fa/',
                pagination: {
                    maxBlockRange: 1000,
                },
            }

        ],
        blockExplorers: [
            {
                name: "Etherscan",
                url: "https://sepolia.etherscan.io",
                apiUrl: "https://api-sepolia.etherscan.io/api",
                family: ExplorerFamily.Etherscan,
            },
        ],
        // A third of sepolia blocks run full, and there the median tip paid is ~1 gwei while the node
        // suggests 0.001 — reveal has one block to make, so the fee is pinned rather than estimated.
        // maxFeePerGas stays modest on purpose: the pool reserves gasLimit × maxFeePerGas per pending
        // tx, so a high ceiling quietly caps how many transactions the solver can have in flight.
        transactionOverrides: {
            maxPriorityFeePerGas: 1_000_000_000, // 2 gwei
            maxFeePerGas: 3_000_000_000, // 6 gwei — base fee sits near 1
        },
    },

    outbetestnet: {

        protocol: ProtocolType.Ethereum,
        chainId: 54322345,
        domainId: 54322345,
        name: "outbetestnet",
        displayName: "Outbe Testnet",
        nativeToken: {
            name: "Coen",
            symbol: "COEN",
            decimals: 6,
        },
        rpcUrls: [
            {
                http: "https://rpc.testnet.outbe.net",
                pagination: {
                    maxBlockRange: 1999,
                    minBlockNumber: 1,
                },
            },
        ],
        blockExplorers: [
            {
                name: "OutbeScout",
                url: "https://s1.testnet.outbe.net/",
                apiUrl: "https://s1.testnet.outbe.net/api/v2.",
                family: ExplorerFamily.Blockscout,
            },
        ],
    },


};

const chainMetadata = customChainMetadata

z.record(z.string(), ChainMetadataSchema).parse(chainMetadata);

/** `transactionOverrides` of a chain — gas settings every transaction on it is sent with. */
function getFeeOverrides(chainId: number | string) {
    const chain = Object.values(chainMetadata).find((c) => c.chainId.toString() === chainId.toString());
    return chain?.transactionOverrides ?? {};
}

export {chainMetadata, getFeeOverrides};

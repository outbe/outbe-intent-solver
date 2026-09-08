import {ChainMap, ChainMetadata, ExplorerFamily} from "@hyperlane-xyz/sdk";
import {ProtocolType} from "@hyperlane-xyz/utils";

const chains: ChainMap<ChainMetadata> = {
    outbemainnet: {
        protocol: ProtocolType.Ethereum,
        chainId: 70860602,
        domainId: 70860602,
        name: "outbemainnet",
        displayName: "Outbe Mainnet",
        nativeToken: {name: "Rudis", symbol: "RUDIS", decimals: 18},
        // Plain http, no domain yet — replace with the TLS endpoint once one exists
        rpcUrls: [{
            http: "http://125.253.90.171",
            pagination: {maxBlockRange: 1999, minBlockNumber: 1},
        }],
    },

    ethereum: {
        protocol: ProtocolType.Ethereum,
        chainId: 1,
        domainId: 1,
        name: "ethereum",
        displayName: "Ethereum",
        nativeToken: {name: "Ether", symbol: "ETH", decimals: 18},
        rpcUrls: [
            {
                http: "https://methodical-stylish-dream.ethereum-mainnet.quiknode.pro/f07cd6ae9a2860b6530bc394ba7466235307f94a/",
                pagination: {maxBlockRange: 1000},
            },
            {http: "https://ethereum-rpc.publicnode.com", pagination: {maxBlockRange: 1000}},
        ],
        blockExplorers: [{
            name: "Etherscan",
            url: "https://etherscan.io",
            apiUrl: "https://api.etherscan.io/api",
            family: ExplorerFamily.Etherscan,
        }],
        transactionOverrides: {
            // Fees are left to estimation here — unlike sepolia, the mainnet tip suggestion is real.
            // Only the gas limit keeps its margin: an estimate can go stale between blocks.
            gasLimitMultiplier: 1.25,
        },
    },
};

export default {outbeChain: "outbemainnet", chains};

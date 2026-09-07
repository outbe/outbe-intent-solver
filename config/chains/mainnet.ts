import {ChainMap, ChainMetadata, ExplorerFamily} from "@hyperlane-xyz/sdk";
import {ProtocolType} from "@hyperlane-xyz/utils";

const chains: ChainMap<ChainMetadata> = {
    outbemainnet: {
        protocol: ProtocolType.Ethereum,
        chainId: 676,
        domainId: 676,
        name: "outbemainnet",
        displayName: "Outbe Mainnet",
        nativeToken: {name: "Rudis", symbol: "RUDIS", decimals: 18},
        // TODO: confirm before launch — outbe mainnet is not live yet, this mirrors the testnet host
        rpcUrls: [{
            http: "https://rpc.outbe.net",
            pagination: {maxBlockRange: 1999, minBlockNumber: 1},
        }],
        blockExplorers: [{
            name: "OutbeScout",
            url: "https://scout.outbe.net/",
            apiUrl: "https://scout.outbe.net/api/v2.",
            family: ExplorerFamily.Blockscout,
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
            {http: "https://ethereum-rpc.publicnode.com", pagination: {maxBlockRange: 1000}},
            {http: "https://eth.llamarpc.com", pagination: {maxBlockRange: 1000}},
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

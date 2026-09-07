import {z} from "zod";

import {ChainMap, ChainMetadata, ChainMetadataSchema, ExplorerFamily} from "@hyperlane-xyz/sdk";
import {ProtocolType} from "@hyperlane-xyz/utils";

const deploymentEnvironment = process.env.DEPLOYMENT_ENVIRONMENT === "mainnet" ? "mainnet" : "testnet";
const isMainnet = deploymentEnvironment === "mainnet";

function firstRpc(envName: string, fallback?: string): string {
    const configured = process.env[envName]?.split(",")[0]?.trim();
    if (configured) return configured;
    if (fallback) return fallback;
    throw new Error(`${envName} is required for ${deploymentEnvironment}`);
}

const chainRoles = isMainnet
    ? {bsc: "bsc", ethereum: "ethereum", outbe: "outbemainnet"} as const
    : {bsc: "bsctestnet", ethereum: "sepolia", outbe: "outbetestnet"} as const;

const bscMetadata: ChainMetadata = {
    protocol: ProtocolType.Ethereum,
    chainId: isMainnet ? 56 : 97,
    domainId: isMainnet ? 56 : 97,
    name: chainRoles.bsc,
    displayName: isMainnet ? "BSC" : "BSC Testnet",
    nativeToken: {
        name: "BNB",
        symbol: "BNB",
        decimals: 18,
    },
    rpcUrls: [{
        http: firstRpc(
            "BSC_RPC_URL",
            isMainnet
                ? "https://bsc-dataseed.bnbchain.org"
                : "https://data-seed-prebsc-1-s1.binance.org:8545",
        ),
        pagination: {maxBlockRange: 1000},
    }],
    blockExplorers: [{
        name: "BscScan",
        url: isMainnet ? "https://bscscan.com" : "https://testnet.bscscan.com",
        apiUrl: isMainnet ? "https://api.bscscan.com/api" : "https://api-testnet.bscscan.com/api",
        family: ExplorerFamily.Etherscan,
    }],
};

const ethereumMetadata: ChainMetadata = {
    protocol: ProtocolType.Ethereum,
    chainId: isMainnet ? 1 : 11155111,
    domainId: isMainnet ? 1 : 11155111,
    name: chainRoles.ethereum,
    displayName: isMainnet ? "Ethereum" : "Sepolia",
    nativeToken: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    rpcUrls: [{
        http: firstRpc(
            isMainnet ? "ETHEREUM_RPC_URL" : "SEPOLIA_RPC_URL",
            isMainnet
                ? "https://ethereum-rpc.publicnode.com"
                : "https://ethereum-sepolia-rpc.publicnode.com",
        ),
        pagination: {maxBlockRange: 1000},
    }],
    blockExplorers: [{
        name: "Etherscan",
        url: isMainnet ? "https://etherscan.io" : "https://sepolia.etherscan.io",
        apiUrl: isMainnet ? "https://api.etherscan.io/api" : "https://api-sepolia.etherscan.io/api",
        family: ExplorerFamily.Etherscan,
    }],
    ...(!isMainnet && {
        transactionOverrides: {
            maxPriorityFeePerGas: 1_000_000_000,
            maxFeePerGas: 3_000_000_000,
            gasLimitMultiplier: 1.25,
        },
    }),
};

const outbeMetadata: ChainMetadata = {
    protocol: ProtocolType.Ethereum,
    chainId: isMainnet ? 676 : 54322345,
    domainId: isMainnet ? 676 : 54322345,
    name: chainRoles.outbe,
    displayName: isMainnet ? "Outbe Mainnet" : "Outbe Testnet",
    nativeToken: {
        name: "COEN",
        symbol: "COEN",
        decimals: 18,
    },
    rpcUrls: [{
        http: firstRpc("OUTBE_RPC_URL", isMainnet ? undefined : "https://rpc.testnet.outbe.net"),
        pagination: {
            maxBlockRange: 1999,
            minBlockNumber: 1,
        },
    }],
    ...(!isMainnet && {
        blockExplorers: [{
            name: "OutbeScout",
            url: "https://s1.testnet.outbe.net/",
            apiUrl: "https://s1.testnet.outbe.net/api/v2.",
            family: ExplorerFamily.Blockscout,
        }],
    }),
};

const chainMetadata: ChainMap<ChainMetadata> = {
    [chainRoles.bsc]: bscMetadata,
    [chainRoles.ethereum]: ethereumMetadata,
    [chainRoles.outbe]: outbeMetadata,
};

z.record(z.string(), ChainMetadataSchema).parse(chainMetadata);

/** `transactionOverrides` of a chain - gas settings every transaction on it is sent with. */
function getFeeOverrides(chainId: number | string) {
    const chain = Object.values(chainMetadata).find((value) => value.chainId.toString() === chainId.toString());
    return chain?.transactionOverrides ?? {};
}

export {chainMetadata, chainRoles, deploymentEnvironment, getFeeOverrides};

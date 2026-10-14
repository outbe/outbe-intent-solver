// Side-effect first: this module reads NETWORK at import time, and it is evaluated before
// config/index.ts gets a chance to call dotenv — without this, NETWORK in .env is silently ignored.
import "dotenv-flow/config";

import {z} from "zod";
import {type ChainMap, type ChainMetadata, ChainMetadataSchema} from "@hyperlane-xyz/sdk";

import mainnet from "./chains/mainnet.js";
import testnet from "./chains/testnet.js";

const network = process.env.NETWORK === "mainnet" ? "mainnet" : "testnet";

/** One literal per network — see config/chains/. `outbeChain` is where the oracle lives. */
const profile = network === "mainnet" ? mainnet : testnet;
const {outbeChain} = profile;
const chainMetadata: ChainMap<ChainMetadata> = Object.fromEntries(
    Object.entries(profile.chains).map(([name, metadata]) => [
        name,
        {...metadata, rpcUrls: metadata.rpcUrls.map((rpc) => ({...rpc}))},
    ]),
);

if (network === "testnet") {
    const rpcOverrides: Record<string, string | undefined> = {
        bsctestnet: process.env.BSC_RPC_URLS,
        outbetestnet: process.env.OUTBE_RPC_URLS,
        sepolia: process.env.SEPOLIA_RPC_URLS,
    };

    for (const [chainName, rawUrls] of Object.entries(rpcOverrides)) {
        if (!rawUrls) continue;

        const urls = rawUrls.split(",").map((url) => url.trim()).filter(Boolean);
        const metadata = chainMetadata[chainName];
        if (!metadata || urls.length === 0) {
            throw new Error(`Invalid RPC override for ${chainName}`);
        }

        chainMetadata[chainName] = {
            ...metadata,
            rpcUrls: urls.map((http) => ({...metadata.rpcUrls[0], http})),
        };
    }
}

z.record(z.string(), ChainMetadataSchema).parse(chainMetadata);

/** `transactionOverrides` of a chain — gas settings every transaction on it is sent with. */
function getFeeOverrides(chainId: number | string) {
    const chain = Object.values(chainMetadata).find((value) => value.chainId.toString() === chainId.toString());
    return chain?.transactionOverrides ?? {};
}

export {chainMetadata, network, outbeChain, getFeeOverrides};

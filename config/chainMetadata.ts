// Side-effect first: this module reads NETWORK at import time, and it is evaluated before
// config/index.ts gets a chance to call dotenv — without this, NETWORK in .env is silently ignored.
import "dotenv-flow/config";

import {z} from "zod";
import {ChainMetadataSchema} from "@hyperlane-xyz/sdk";

import mainnet from "./chains/mainnet.js";
import testnet from "./chains/testnet.js";

const network = process.env.NETWORK === "mainnet" ? "mainnet" : "testnet";

/** One literal per network — see config/chains/. `outbeChain` is where the oracle lives. */
const {chains: chainMetadata, outbeChain} = network === "mainnet" ? mainnet : testnet;

z.record(z.string(), ChainMetadataSchema).parse(chainMetadata);

/** `transactionOverrides` of a chain — gas settings every transaction on it is sent with. */
function getFeeOverrides(chainId: number | string) {
    const chain = Object.values(chainMetadata).find((value) => value.chainId.toString() === chainId.toString());
    return chain?.transactionOverrides ?? {};
}

export {chainMetadata, network, outbeChain, getFeeOverrides};

import {
  type RouterMetadata,
  RouterMetadataSchema,
} from "../types.js";
import { chainMetadata } from "../../../config/chainMetadata.js";

// Router contract address (same for all chains)
const ROUTER_CONTRACT = process.env.ROUTER_CONTRACT || "0x3448f63B27161cEE72781319e6b579132d905d08";

const metadata: RouterMetadata = {
  protocolName: "Router",
  contracts: Object.keys(chainMetadata).map((chainName) => ({
    address: ROUTER_CONTRACT,
    chainName,
  })),

  customRules: {
    rules: [
      {
        name: "intentNotFilled",
      },
    ],
  },
};

RouterMetadataSchema.parse(metadata);

export default metadata;

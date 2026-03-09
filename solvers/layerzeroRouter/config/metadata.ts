import {
  type LayerZeroRouterMetadata,
  LayerZeroRouterMetadataSchema,
} from "../types.js";

// Router contract address (same for all chains)
const ROUTER_CONTRACT = process.env.ROUTER_CONTRACT || "0x3448f63B27161cEE72781319e6b579132d905d08";

const metadata: LayerZeroRouterMetadata = {
  protocolName: "LayerZeroRouter",
  contracts: [
    {
      address: ROUTER_CONTRACT,
      chainName: "bsctestnet",

    },
    {
      address: ROUTER_CONTRACT,
      chainName: "outbetestnet",
    },
  ],

  customRules: {
    rules: [
      {
        name: "intentNotFilled",
      },
    ],
  },
};

LayerZeroRouterMetadataSchema.parse(metadata);

export default metadata;

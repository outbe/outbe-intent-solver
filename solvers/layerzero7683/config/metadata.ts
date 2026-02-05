import {
  type Layerzero7683Metadata,
  Layerzero7683MetadataSchema,
} from "../types.js";

// Router contract address (same for all chains)
const ROUTER_CONTRACT = process.env.ROUTER_CONTRACT || "0x3448f63B27161cEE72781319e6b579132d905d08";

const metadata: Layerzero7683Metadata = {
  protocolName: "LayerZero7683",
  contracts: [
    {
      address: ROUTER_CONTRACT,
      chainName: "bsctestnet",
    },
    {
      address: ROUTER_CONTRACT,
      chainName: "outbe",
    },
  ],

  customRules: {
    rules: [
      {
        name: "checkExchangeRate",
        // Uses tradingPairs from config/tradingPairs.ts
      },
      {
        name: "intentNotFilled",
      },
    ],
  },
};

Layerzero7683MetadataSchema.parse(metadata);

export default metadata;

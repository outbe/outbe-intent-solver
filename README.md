# Solver Directory Overview

The solver directory contains the implementation of the Intent Solver, a TypeScript application designed to listen to blockchain events and process intents accordingly. This application plays a crucial role in handling events from different sources and executing the necessary actions based on those events.

## Table of Contents

- [Directory Structure](#directory-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Managing Solvers](#managing-solvers)
- [LayerZero7683 Auction Solver](#layerzero7683-auction-solver)
- [Trading Pairs Configuration](#trading-pairs-configuration)
- [Intent Filtering](#intent-filtering)
- [Logging](#logging)

## Directory Structure

```
solver/
├── index.ts
├── logger.ts
├── NonceKeeperWallet.ts
├── patch-bigint-buffer-warn.js
├── test/
├── config/
│  ├── index.ts
│  ├── allowBlockLists.ts
│  ├── chainMetadata.ts
│  ├── tradingPairs.ts
│  └── types.ts
└── solvers/
    ├── index.ts
    ├── BaseFiller.ts
    ├── BaseListener.ts
    ├── types.ts
    ├── utils.ts
    ├── contracts/
    └── <eco|hyperlane7683|layerzero7683>/
        ├── index.ts
        ├── listener.ts
        ├── prepare.ts       # Optional: pre-fill strategy (e.g., auction logic)
        ├── filler.ts
        ├── types.ts
        ├── utils.ts
        ├── contracts/
        ├── rules/
        │   └── index.ts
        └── config/
            ├── index.ts
            ├── metadata.ts
            └── allowBlockLists.ts
```

### Description of Key Files and Directories

- **solver/index.ts**: The main entry point of the solver application. It initializes and starts the listeners and fillers for different solvers.
- **logger.ts**: Contains the Logger class used for logging messages with various formats and levels.
- **NonceKeeperWallet.ts**: A class that extends ethers Wallet and prevents nonces race conditions when the solver needs to fill different intents (from different solutions) in the same network.
- **patch-bigint-buffer-warn.js**: A script to suppress specific warnings related to BigInt and Buffer, ensuring cleaner console output.
- **config/**: Global configuration for the solver.
    - **tradingPairs.ts**: Defines supported token swap routes between chains with exchange rates and competitive bidding strategies.
- **solvers/**: Contains implementations of different solvers and common utilities.
    - **BaseListener.ts**: An abstract base class that provides common functionality for event listeners. It handles setting up contract connections and defines the interface for parsing event arguments.
    - **BaseFiller.ts**: An abstract base class that provides common functionality for fillers. It handles the solver's lifecycle `prepareIntent`, `fill`, and `settle`.
        - **`prepareIntent`**: evaluate allow/block lists, balances, and run the defined rules to decide whether to fill or not an intent.
        - **`fill`**: The actual filling.
        - **`settle`**: The settlement step, can be avoided.
    - **<eco|hyperlane7683|layerzero7683>/**: Implements the solvers for different protocols.
        - **listener.ts**: Extends `BaseListener` to handle domain-specific events.
        - **prepare.ts**: (Optional) Implements pre-fill strategy. For LayerZero7683, handles auction logic: submits quotes during quoting phase and verifies winner status.
        - **filler.ts**: Extends `BaseFiller` to handle domain-specific intents.
        - **rules/**: Custom validation rules for deciding whether to fill an intent.
        - **contracts/**: Contains contract ABI and type definitions for interacting with domain-specific contracts.
    - **index.ts**: Exports the solvers to be used in the main application.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (version compatible with your project's requirements)
- [Yarn](https://yarnpkg.com/)

### Steps

1. Install the dependencies:

   ```sh
   yarn install
   ```

2. Build the project:

   ```sh
   yarn build
   ```

## Usage

### Running the Solver Application

Start the solver application:

```sh
yarn solver
```

This will run the compiled JavaScript code from the `dist` directory, initializing and starting all enabled solvers as defined in `config/solvers.json`. Each solver's status (enabled/disabled) can be configured in this JSON file.

### Development Mode

Run in watch mode for development:

```sh
yarn dev
```

## LayerZero7683 Auction Solver

The LayerZero7683 solver implements a **competitive auction mechanism** where multiple solvers compete by submitting quotes during a quoting period, and only the winning solver (highest output amount) can fill the order.

### Architecture

The solver uses a **three-module architecture**:

1. **Listener** (`listener.ts`): Detects `Open` events from LayerZero7683 contracts
2. **Prepare** (`prepare.ts`): Handles auction logic - submits quotes during quoting phase
3. **Filler** (`filler.ts`): Executes fills when solver wins the auction

### Two-Phase Execution

#### Phase 1: Quoting Period

When an order is detected, the solver:
1. Checks if quoting period is still active using `destination.isQuotingEnded()`
2. Calculates competitive output amount:
    - Finds matching `TradingPair` from config
    - Calculates market output: `inputAmount * exchangeRate`
    - Applies boost: `marketOutput * (1 + quoteBoost)`
3. Submits quote on destination chain via `destination.submitQuote()`

#### Phase 2: Filling Period

After quoting period ends:
1. Contract determines winner (solver with highest `outputAmount`)
2. Solver checks if it won using `destination.getWinner()`
3. If winner, executes fill with `winningAmount` from contract
4. Sends settlement message back to origin chain via LayerZero

### Key Features

- **Auction deduplication**: On-chain check via `destination.hasSolverQuoted()`
- **Dynamic decimals**: Queries token decimals automatically
- **Profitable order validation**: Checks market rate vs user minimum
- **Competitive bidding**: Configurable `quoteBoost` per token
- **Native token support**: Handles both ERC20 and native tokens (ETH, BNB, COEN)

### Environment Configuration

Create a `.env` file in the solver directory with the following required and optional variables:

```bash
# Required: Private key for solver wallet (used to sign transactions)
PRIVATE_KEY=0x...

# Required: Router contract address (same for all chains)
ROUTER_CONTRACT=0x3448f63B27161cEE72781319e6b579132d905d08

# Optional: Log level (debug, info, warn, error)
LOG_LEVEL=info
```

**Important**:
- `PRIVATE_KEY` is **required** - the solver wallet must have sufficient funds on all chains where it will operate
- `ROUTER_CONTRACT` address is used for all chains (Outbe, BSC testnet, etc.)
- `LOG_LEVEL` defaults to `info` if not specified

### Chain Configuration

Configure RPC endpoints and chain settings in `config/chainMetadata.ts`:

```typescript
import { ChainMetadata } from '@hyperlane-xyz/sdk';

export const chainMetadata: Record<string, ChainMetadata> = {
  outbe_dev: {
    name: 'outbe_dev',
    displayName: 'Outbe Devnet',
    chainId: 64165,
    rpcUrls: [{ http: 'https://rpc-dev.outbe.network' }],
    nativeToken: { name: 'COEN', symbol: 'COEN', decimals: 18 },
  },
  bsctestnet: {
    name: 'bsctestnet',
    displayName: 'BSC Testnet',
    chainId: 97,
    rpcUrls: [{ http: 'https://data-seed-prebsc-1-s1.binance.org:8545' }],
    nativeToken: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  },
};
```

The solver automatically connects to all chains configured in `chainMetadata.ts` using the specified RPC endpoints.

## Trading Pairs Configuration

Trading pairs define supported token swaps between chains with exchange rates and bidding strategy. Located at: `solver/config/tradingPairs.ts`

### Structure

```typescript
interface TradingPair {
  originChain: string;           // Origin chain name (e.g., "outbe_dev")
  destinationChain: string;      // Destination chain name (e.g., "bsctestnet")
  inputToken: string;            // Input token address (0x00...00 = native)
  outputToken: string;           // Output token address (0x00...00 = native)
  exchangeRate: number;          // Exchange rate with profit included
  quoteBoost: number;            // Extra % to offer in auction (e.g., 0.02 = 2%)
}
```

### Example Configuration

```typescript
export const tradingPairs: TradingPair[] = [
  // Native COEN (Outbe) → Native BNB (BSC)
  {
    originChain: "outbe_dev",
    destinationChain: "bsctestnet",
    inputToken: "0x0000000000000000000000000000000000000000", // Native COEN
    outputToken: "0x0000000000000000000000000000000000000000", // Native BNB
    exchangeRate: 0.0001,  // 1 COEN = 0.0001 BNB (with profit)
    quoteBoost: 0.03,      // Offer 3% more to win
  },

  // Outbe native COEN → BSC USDC
  {
    originChain: "outbe_dev",
    destinationChain: "bsctestnet",
    inputToken: "0x0000000000000000000000000000000000000000",
    outputToken: "0xae878856F2bEb1F716023043daFef50825d21396", // USDC
    exchangeRate: 0.012,   // 1 COEN = 0.012 USDC
    quoteBoost: 0.02,      // Offer 2% more to win
  },
];
```

### How It Works

When processing an order:

1. **Profitability Check** (`checkExchangeRate` rule):
    - Finds matching pair for `originChain:inputToken → destinationChain:outputToken`
    - Calculates: `marketOutput = inputAmount * exchangeRate`
    - Validates: `marketOutput >= userMinimumRequired`

2. **Quote Calculation** (`calculateBestOutput` in prepare):
    - Market output: `inputAmount * exchangeRate`
    - Apply boost: `marketOutput * (1 + quoteBoost)`
    - Submit to auction: `max(boostedOutput, userMinimum)`

3. **Example Flow**:
   ```
   User creates order: 100 COEN → wants minimum 1 USDC

   TradingPair: exchangeRate = 0.012, quoteBoost = 0.02

   1. Check profitable:
      - Market: 100 * 0.012 = 1.2 USDC
      - Check: 1.2 >= 1 ✅ Profitable!

   2. Calculate competitive quote:
      - Market: 1.2 USDC
      - Boost: 1.2 * (1 + 0.02) = 1.224 USDC
      - Submit quote: 1.224 USDC

   3. If win auction:
      - Fill with winning amount from contract
   ```

### Adding New Pairs

To add support for new token pairs:

1. Edit `solver/config/tradingPairs.ts`
2. Add new entry to the array:
   ```typescript
   {
     originChain: "chainName",
     destinationChain: "chainName",
     inputToken: "0x...", // Use 0x00...00 for native
     outputToken: "0x...",
     exchangeRate: 1.0,   // Include your profit margin
     quoteBoost: 0.02,    // Competitive advantage %
   }
   ```
3. Restart solver


## Intent Filtering

Configure which intents to fill or ignore using allow/block lists. Configure at:

- `config/allowBlockLists.ts`

```typescript
const allowBlockLists: AllowBlockLists = {
  allowList: [],
  blockList: [],
};
```



## Logging

The application uses a custom Logger class. Default: `stdout` with `INFO` level.

Customize using pino transports. See [pino transports docs](https://github.com/pinojs/pino/blob/main/docs/transports.md). There's an example for logging to a Syslog server running on `localhost` commented in [logger.ts](logger.ts).

# Solver Directory Overview

The solver directory contains the implementation of the Intent Solver, a TypeScript application designed to listen to blockchain events and process intents accordingly. This application plays a crucial role in handling events from different sources and executing the necessary actions based on those events.

## Table of Contents

- [Directory Structure](#directory-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Router Auction Solver](#router-auction-solver)
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
│  ├── types.ts
│  └── tradingPairs/
│      ├── handler.ts
│      ├── pairs.json          # Working config (gitignored)
│      └── pairs.example.json  # Example pairs (committed)
└── solvers/
    ├── index.ts
    ├── BaseFiller.ts
    ├── BaseListener.ts
    ├── types.ts
    ├── utils.ts
    ├── contracts/
    └── <eco|hyperlane7683|router>/
        ├── index.ts
        ├── listener.ts
        ├── prepare.ts       # Optional: pre-fill strategy (e.g., auction logic)
        ├── auction.ts       # Auction manager (commit-reveal logic)
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
    - **tradingPairs/**: Trading pairs configuration.
        - **handler.ts**: Loads pairs from JSON, resolves oracle exchange rates.
        - **pairs.json**: Working pairs config (gitignored, created via `yarn pairs:init`).
        - **pairs.example.json**: Example pairs config (committed to git).
- **solvers/**: Contains implementations of different solvers and common utilities.
    - **BaseListener.ts**: An abstract base class that provides common functionality for event listeners. It handles setting up contract connections and defines the interface for parsing event arguments.
    - **BaseFiller.ts**: An abstract base class that provides common functionality for fillers. It handles the solver's lifecycle `prepareIntent`, `fill`, and `settle`.
        - **`prepareIntent`**: evaluate allow/block lists, balances, and run the defined rules to decide whether to fill or not an intent.
        - **`fill`**: The actual filling.
        - **`settle`**: The settlement step, can be avoided.
    - **<eco|hyperlane7683|router>/**: Implements the solvers for different protocols.
        - **listener.ts**: Extends `BaseListener` to handle domain-specific events.
        - **prepare.ts**: (Optional) Implements pre-fill strategy. For Router, handles commit-reveal auction and order claiming.
        - **auction.ts**: Auction manager — commit/reveal phases, winner detection, auction restart handling.
        - **filler.ts**: Extends `BaseFiller` to handle domain-specific intents.
        - **rules/**: Custom validation rules for deciding whether to fill an intent.
        - **contracts/**: Contains contract ABI and type definitions for interacting with domain-specific contracts.
    - **index.ts**: Exports the solvers to be used in the main application.

## Installation

Create a `.env` file before running (see [Configuration](#configuration)).

### Option 1: Local

Prerequisites: Node.js 20+, Yarn

```sh
yarn install
yarn build
```

### Option 2: Docker

Prerequisites: Docker, Docker Compose

```sh
# Build and start
docker compose up -d --build

# Live PM2 logs (JSON)
docker compose exec solver pm2 logs

# Live PM2 logs (formatted)
tail -f ./logs/solver-out.log | npx pino-pretty

# PM2 process status
docker compose exec solver pm2 list

# Enter container
docker compose exec solver sh

# Graceful restart PM2 processes
docker compose exec solver pm2 reload all

# Stop
docker compose down
```

## Configuration

### Environment Variables

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
    rpcUrls: [{ http: 'https://eth.d.outbe.net' }],
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

### Trading Pairs Configuration

Trading pairs are stored in `config/tradingPairs/pairs.json` . Manage them via CLI commands:

```sh
yarn pairs:init      # Create pairs.json from example
yarn pairs:list      # Show configured pairs
yarn pairs:add       # Add a pair interactively
yarn pairs:remove    # Remove a pair interactively
yarn pairs:oracle    # List available oracle pairs and current rates
```

Example `pairs.json`:

```json
[
  {
    "originChain": "outbetestnet",
    "destinationChain": "bsctestnet",
    "inputToken": "0x0000000000000000000000000000000000000000",
    "outputToken": "0xFEcF2FcDcF899b907371165bf26C353A7b6950ae",
    "exchangeRate": "COEN/USDC",
    "quoteTolerance": 0.01
  },
  {
    "originChain": "bsctestnet",
    "destinationChain": "outbetestnet",
    "inputToken": "0xFEcF2FcDcF899b907371165bf26C353A7b6950ae",
    "outputToken": "0x0000000000000000000000000000000000000000",
    "exchangeRate": 1,
    "quoteTolerance": 0
  }
]
```

**Parameters**:
- `exchangeRate`: One of three formats:
    - **Fixed**: number, e.g. `1`
    - **Oracle**: string key, e.g. `"COEN/USDC"` or `"1/COEN/USDC"` for inverse
    - **URL**: e.g. `"https://my-api.com/rate"` — must return JSON `{"exchangeRate": "0.023271"}`
- `quoteTolerance`: Extra % added to output to increase winning chances (e.g., `0.01` = 1% more)
- `inputToken` / `outputToken`: Token addresses. Use `0x0000000000000000000000000000000000000000` for native tokens (COEN, BNB).

Oracle rates are fetched on-chain at each order. Use `yarn pairs:oracle` to see available oracle pairs.

### Intent Filtering

Configure which intents to fill or ignore using allow/block lists at `config/allowBlockLists.ts`:

```typescript
const allowBlockLists: AllowBlockLists = {
  allowList: [],
  blockList: [],
};
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

## Router Auction Solver

The Router solver targets the shared `Router` settler contract, which abstracts the underlying cross-chain transport (Hyperlane / LayerZero) behind a single `bridge()`. It implements a **commit-reveal Vickrey auction** where multiple solvers compete by first committing a hash of their quote, then revealing the actual amount. The highest bidder wins but pays the second-highest price.

### Architecture

The solver uses a **four-module architecture**:

1. **Listener** (`listener.ts`): Detects `Open` events from Router contracts
2. **Prepare** (`prepare.ts`): Orchestrates auction flow and claims winning orders on the router
3. **Auction** (`auction.ts`): Manages commit-reveal phases, winner detection, and auction restart handling
4. **Filler** (`filler.ts`): Executes fills when solver wins the auction

### Auction Flow

#### Phase 1: Commit

When an order is detected, the solver:
1. Calculates competitive output amount using trading pair config (exchange rate + quote tolerance)
2. Runs pre-commit checks (escrow collateral, token balance)
3. Generates a random salt and commits a hash: `keccak256(abi.encode(orderId, outputAmount, salt))`
4. Waits for commit deadline (precise sleep based on on-chain deadline)

#### Phase 2: Reveal

After commit phase ends:
1. Solver reveals the actual `outputAmount`, `salt`, and `originData` (encoded order data from `fillInstructions`)
2. Contract verifies the reveal matches the committed hash
3. Waits for auction to end (reveal deadline)

#### Phase 3: Winner & Claim

After auction ends:
1. Contract determines winner (Vickrey: highest bidder, second-highest price)
2. Solver checks if it won via `auction.getWinner()`
3. If winner, claims the order on the router contract via `router.claimOrder()`
4. If claim triggers `AuctionRestarted` (winner disqualified for insufficient collateral), solver does not retry

#### Auction Restart

If the solver loses the auction, it waits up to 30 seconds for an `AuctionRestarted` event (emitted when the winner is disqualified). If restarted, the solver enters a new auction round automatically.

### Key Features

- **Commit-reveal scheme**: Prevents front-running — quotes are hidden until reveal phase
- **Vickrey pricing**: Winner pays second-highest price, incentivizing truthful bidding
- **Escrow collateral check**: Verifies solver has sufficient collateral before committing
- **Oracle exchange rates**: Supports on-chain oracle rates (e.g., `COEN/USDC`) alongside fixed rates
- **Auction restart handling**: Automatically re-enters auction if winner is disqualified
- **Precise phase timing**: Uses on-chain deadlines for phase transitions to avoid missed reveals

### Example Flow

```
User creates order: 100 COEN → wants minimum 1 USDC

TradingPair: exchangeRate = "COEN/USDC" (oracle), quoteTolerance = 0.01
Oracle returns: COEN/USDC = 0.023

1. Calculate output:
   - Base: 100 * 0.023 = 2.3 USDC
   - Boost: 2.3 * (1 + 0.01) = 2.323 USDC
   - Check: 2.323 >= 1 ✅

2. Commit phase:
   - Generate salt
   - Commit hash of (orderId, 2.323 USDC, salt)
   - Wait for commit deadline

3. Reveal phase:
   - Reveal 2.323 USDC + salt
   - Wait for auction end

4. Winner check:
   - If won → claim order on router → fill
   - If lost → wait 30s for possible restart
```

## Logging

The application uses a custom Logger class. Default: `stdout` with `INFO` level.

Customize using pino transports. See [pino transports docs](https://github.com/pinojs/pino/blob/main/docs/transports.md). There's an example for logging to a Syslog server running on `localhost` commented in [logger.ts](logger.ts).

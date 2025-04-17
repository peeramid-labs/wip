# WIP Contract Demo

This repository contains a demo for the WIP (World In Progress) contract, which simulates user activity in a decentralized citizenship-based governance system.

## Prerequisites

- Node.js (>= 16)
- pnpm
- Anvil (from Foundry)

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Compile the contracts:
   ```bash
   pnpm build
   ```

3. Run the test demo:
   ```bash
   pnpm test-demo
   ```

## Available Scripts

- `pnpm build` - Compile the contracts
- `pnpm deploy` - Deploy to Celo network
- `pnpm demo` - Run the demo with an existing contract
- `pnpm test-demo` - Deploy and run the demo on a local Anvil node
- `pnpm dev` - Deploy and run the demo, then keep the node running for frontend development
- `pnpm update-abi <address>` - Update the frontend ABI with a specific contract address

## Demo Configuration

The demo simulates:
- Multiple users from different countries
- Users submitting proposals and voting over multiple days
- Citizens earning governance tokens by receiving votes

You can customize the demo by setting environment variables:
- `NUM_DAYS` - Number of days to simulate (default: 5)
- `KEEP_RUNNING` - Keep the Anvil node running after the demo completes (default: false)

## How It Works

1. The demo first deploys all necessary contracts (WIP, DAODistribution, etc.)
2. It registers multiple users from different countries
3. Each user submits a daily proposal and votes on other proposals
4. Time is advanced on the blockchain to simulate multiple days
5. The voting logic follows the rules in the WIP contract:
   - Same country votes cost score²
   - Cross country votes cost score³
   - Users must spend at least half their daily tokens

## Frontend Integration

When you run `pnpm test-demo` or `pnpm dev`, the script automatically updates the frontend ABI file (`frontend/app/content/abi.ts`) with the newly deployed contract address. This ensures your frontend is always pointing to the latest deployment.

If you want to use a specific contract address, you can manually update the frontend:

```bash
pnpm update-abi 0x123...abc
```

Running `pnpm dev` will:
1. Deploy the contracts to the local Anvil node
2. Run the demo to populate it with data
3. Update the frontend ABI file with the contract address
4. Keep the node running so you can interact with it through the frontend
#!/bin/bash

# Check if DEPLOY_CONTRACT is set (default to true)
DEPLOY_CONTRACT=${DEPLOY_CONTRACT:-true}

# Start Anvil in the background with a high number of accounts
echo "Starting Anvil node with 50 accounts..."
anvil --accounts 50 -m 'casual vacant letter raw trend tool vacant opera buzz jaguar bridge myself' --fork-url "https://alfajores-forno.celo-testnet.org/" > anvil.log 2>&1 &
ANVIL_PID=$!

# Wait for Anvil to start
sleep 2

echo "Anvil node started with PID: $ANVIL_PID"

# Deploy the WIP contract if DEPLOY_CONTRACT is true
if [ "$DEPLOY_CONTRACT" = true ]; then
  echo "Deploying WIP contract..."
  CONTRACT_ADDRESS=$(pnpm hardhat run scripts/wip.ts --network localhost | grep "WIP deployed to" | awk '{print $4}')

  if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Failed to deploy contract. Check the logs."
    kill $ANVIL_PID
    exit 1
  fi

  echo "Contract deployed at: $CONTRACT_ADDRESS"
else
  # If not deploying, use the provided address
  CONTRACT_ADDRESS=$1
  if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Error: No contract address provided. Either set DEPLOY_CONTRACT=true or provide an address."
    kill $ANVIL_PID
    exit 1
  fi
  echo "Using provided contract address: $CONTRACT_ADDRESS"
fi

# Update the abi.ts file with the new contract address
echo "Updating frontend abi.ts with contract address..."
ABI_FILE="../frontend/app/content/abi.ts"
if [ -f "$ABI_FILE" ]; then
  # Create a backup
  cp "$ABI_FILE" "$ABI_FILE.backup"

  # Detect OS for sed command compatibility
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/export const address = \"0x[a-fA-F0-9]*\"/export const address = \"$CONTRACT_ADDRESS\"/" "$ABI_FILE"
  else
    # Linux/others
    sed -i "s/export const address = \"0x[a-fA-F0-9]*\"/export const address = \"$CONTRACT_ADDRESS\"/" "$ABI_FILE"
  fi

  echo "Successfully updated contract address in $ABI_FILE"
else
  echo "Warning: abi.ts file not found at $ABI_FILE, skipping update"
fi

# Run the demo script
echo "Running demo script..."
# Pass the contract address as an environment variable
CONTRACT_ADDRESS=$CONTRACT_ADDRESS pnpm hardhat run scripts/demo.ts --network localhost

# Clean up by killing Anvil
echo "Demo completed. Shutting down Anvil node..."
kill $ANVIL_PID

echo "Done!"
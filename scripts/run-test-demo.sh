#!/bin/bash

# Default values
NUM_DAYS=${NUM_DAYS:-5}

# Print banner
echo "============================================="
echo "   Running WIP Contract Test Demo"
echo "============================================="

# Start Anvil in the background with a high number of accounts
echo "Starting Anvil node with 150 accounts..."
anvil --accounts 150 -m 'casual vacant letter raw trend tool vacant opera buzz jaguar bridge myself' --fork-url "https://alfajores-forno.celo-testnet.org/" > anvil.log 2>&1 &
ANVIL_PID=$!

# Wait for Anvil to start
sleep 2
echo "Anvil node started with PID: $ANVIL_PID"

# Deploy using the test deployment script
echo "Deploying contracts for testing..."
RESULT=$(pnpm hardhat run scripts/deploy-test.ts --network localhost)
echo "$RESULT"

# Extract the WIP contract address
CONTRACT_ADDRESS=$(echo "$RESULT" | grep "WIP deployed to" | awk '{print $4}')

if [ -z "$CONTRACT_ADDRESS" ]; then
  echo "Failed to deploy contract. Check the logs."
  kill $ANVIL_PID
  exit 1
fi

echo "Contract deployed at: $CONTRACT_ADDRESS"

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
# Pass the contract address as an environment variable instead of a positional argument
CONTRACT_ADDRESS=$CONTRACT_ADDRESS pnpm hardhat run scripts/demo.ts --network localhost

# If we want to keep the node running for frontend development
if [ "$KEEP_RUNNING" = "true" ]; then
  echo "Anvil node is still running with PID: $ANVIL_PID"
  echo "Contract address is: $CONTRACT_ADDRESS"
  echo "Frontend has been configured to use this address."
  echo "Press Ctrl+C to stop and clean up..."
  # Wait for user to cancel
  wait $ANVIL_PID
else
  # Clean up by killing Anvil
  echo "Demo completed. Shutting down Anvil node..."
  kill $ANVIL_PID
fi

echo "Done!"
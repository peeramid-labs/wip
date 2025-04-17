#!/bin/bash

# Check if contract address is provided
if [ -z "$1" ]; then
  echo "Error: Please provide a contract address"
  echo "Usage: $0 <contract_address>"
  exit 1
fi

CONTRACT_ADDRESS=$1

# Update the abi.ts file with the provided contract address
echo "Updating frontend abi.ts with contract address: $CONTRACT_ADDRESS"
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
  echo "A backup has been created at $ABI_FILE.backup"
else
  echo "Error: abi.ts file not found at $ABI_FILE"
  exit 1
fi
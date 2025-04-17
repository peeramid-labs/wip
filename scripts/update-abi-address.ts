import * as fs from 'fs';
import * as path from 'path';
import deployTest from './deploy-test';

async function main() {
  console.log('Deploying test contracts to get contract address...');

  // Deploy the test contracts
  const deployedContracts = await deployTest();

  // Get the WIP contract address
  const contractAddress = deployedContracts.wip;

  // Path to the abi.ts file
  const abiFilePath = path.resolve(__dirname, '../../frontend/app/content/abi.ts');

  // Check if the file exists
  if (!fs.existsSync(abiFilePath)) {
    console.error(`Error: abi.ts file not found at ${abiFilePath}`);
    return;
  }

  // Read the current abi.ts file
  let abiFileContent = fs.readFileSync(abiFilePath, 'utf8');

  // Update the contract address
  // This regex will match export const address = "0x..."; and replace it with the new address
  const addressRegex = /export const address = "0x[a-fA-F0-9]+";/;
  const updatedContent = abiFileContent.replace(addressRegex, `export const address = "${contractAddress}";`);

  // Write the updated content back to the file
  fs.writeFileSync(abiFilePath, updatedContent);

  console.log(`Successfully updated contract address in ${abiFilePath}`);
  console.log(`New contract address: ${contractAddress}`);
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error updating abi address:', error);
    process.exit(1);
  });
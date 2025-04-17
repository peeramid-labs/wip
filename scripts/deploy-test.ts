import { ethers } from "hardhat";
import { BigNumberish } from "ethers";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying test contracts with the account:", deployer.address);

  // Deploy the necessary contracts for testing

  // 1. Deploy GovernanceToken factory first to use as a template
  console.log("Deploying GovernanceToken factory...");
  const GovernanceTokenFactory = await ethers.getContractFactory("GovernanceToken");
  const templateToken = await GovernanceTokenFactory.deploy();
  await templateToken.waitForDeployment();
  console.log("Template GovernanceToken deployed to:", templateToken.target);

  // 2. Deploy a mock DAO
  console.log("Deploying mock DAO...");
  const DAOFactory = await ethers.getContractFactory("WORLD_DAO");
  const mockDao = await DAOFactory.deploy();
  await mockDao.waitForDeployment();
  console.log("Mock DAO deployed to:", mockDao.target);

  // 3. Deploy the DAO Distribution contract
  console.log("Deploying DAO Distribution contract...");
  const DAODistributionFactory = await ethers.getContractFactory("DAODistribution");
  const daoDistribution = await DAODistributionFactory.deploy(
    mockDao.target,          // Base DAO
    templateToken.target,    // Base token (using the template token we deployed)
    "Self-WIP-Test",
    { major: 1, minor: 0, patch: 0 }
  );
  await daoDistribution.waitForDeployment();
  console.log("DAODistribution deployed to:", daoDistribution.target);

  // 4. Deploy the WIP contract with test configuration
  const WIPFactory = await ethers.getContractFactory("WIP");

  // Test-specific constructor parameters - set to make testing easier
  const identityVerificationHub = "0x0000000000000000000000000000000000000000"; // Mock address for testing
  const scope = 1n;
  const attestationId = 1n;
  const olderThanEnabled = false; // Disable age verification for testing
  const olderThan = 0n; // No age requirement for testing
  const forbiddenCountriesEnabled = false;
  const forbiddenCountriesListPacked: [BigNumberish, BigNumberish, BigNumberish, BigNumberish] = [0n, 0n, 0n, 0n];
  const ofacEnabled: [boolean, boolean, boolean] = [false, false, false];

  console.log("Deploying WIP contract for testing...");
  const wip = await WIPFactory.deploy(
    identityVerificationHub,
    scope,
    attestationId,
    olderThanEnabled,
    olderThan,
    forbiddenCountriesEnabled,
    forbiddenCountriesListPacked,
    ofacEnabled,
    daoDistribution.target
  );

  await wip.waitForDeployment();

  console.log("WIP deployed to:", wip.target);
  console.log("Test deployment completed successfully!");

  // Return the deployed contract addresses for use in tests
  return {
    wip: wip.target,
    daoDistribution: daoDistribution.target,
    mockDao: mockDao.target,
    templateToken: templateToken.target
  };
}

// If running this script directly, execute main
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

// Export for use in other scripts
export default main;
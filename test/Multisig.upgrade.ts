import { expect } from "chai";
import { ethers, deployments, getNamedAccounts } from "hardhat";
import { WorldMultiSigV1__factory, TransparentUpgradeableProxy__factory } from "../typechain-types";

describe("WorldMultiSig Upgrade Test", function () {
  let deployer: string;
  let multiSigProxy: string;

  before(async function () {
    // This test requires longer timeout since it deploys multiple contracts
    this.timeout(60000);

    const signers = await ethers.getSigners();
    const { deployer: deployerAddress } = await getNamedAccounts();
    deployer = deployerAddress;

    // Fund the deployer account for testing
    const fundingAccount = signers[1];
    await fundingAccount.sendTransaction({
      to: deployer,
      value: ethers.parseEther("10.0") // Send 10 ETH
    });

    console.log(`Funded deployer account ${deployer} with 10 ETH`);

    // Deploy all required contracts using the 'wip' tag from deploy/wip.ts
    await deployments.fixture(["wip"]);

    multiSigProxy = (await deployments.get("WorldMultiSigV1")).address;
    console.log("WorldMultiSig address:", multiSigProxy);
  });

  it("should allow the initialOperator to upgrade WorldMultiSig", async function () {
    // Get the original multiSig contract
    const signer = await ethers.getSigner(deployer);
    const multiSig = WorldMultiSigV1__factory.connect(multiSigProxy, signer);

    // Check if deployer is the initialOperator
    const [initialOperator, timeLeft] = await multiSig.getInitialOperator();
    console.log("Initial Operator:", initialOperator);
    console.log("Time left for operator authority:", timeLeft.toString());
    expect(initialOperator).to.equal(deployer);
    expect(timeLeft).to.be.gt(0);

    // Deploy a new WorldMultiSig implementation
    const WorldMultiSigFactory = await ethers.getContractFactory("WorldMultiSigV1");
    const newMultiSigImpl = await WorldMultiSigFactory.deploy(true);
    await newMultiSigImpl.waitForDeployment();
    const newImplAddress = await newMultiSigImpl.getAddress();
    console.log("New MultiSig implementation:", newImplAddress);

    // Get the proxy admin address for the multiSig
    const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
    const proxyAdminData = await ethers.provider.getStorage(multiSigProxy, adminSlot);
    const proxyAdmin = ethers.getAddress("0x" + proxyAdminData.slice(26));
    console.log("Proxy admin:", proxyAdmin);

    // Create the upgrade data
    const proxyAdminContract = new ethers.Contract(proxyAdmin, [
      "function upgradeAndCall(address proxy, address implementation, bytes calldata data)",
    ], signer);

    const upgradeData = proxyAdminContract.interface.encodeFunctionData("upgradeAndCall", [
      multiSigProxy,
      newImplAddress,
      "0x"
    ]);

    // Execute the upgrade directly through the multiSig (since deployer is initialOperator)
    console.log("Executing upgrade...");
    const tx = await multiSig.execute(upgradeData, proxyAdmin);
    await tx.wait();
    console.log("Upgrade executed");

    // Verify the implementation was updated
    const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const implementationData = await ethers.provider.getStorage(multiSigProxy, implementationSlot);
    const actualImplementation = ethers.getAddress("0x" + implementationData.slice(26));

    console.log("New implementation address:", actualImplementation);
    expect(actualImplementation).to.equal(newImplAddress);

    // Verify we can still call functions on the upgraded contract
    const [operatorAfterUpgrade, timeLeftAfterUpgrade] = await multiSig.getInitialOperator();
    expect(operatorAfterUpgrade).to.equal(deployer);
    expect(timeLeftAfterUpgrade).to.be.gt(0);
  });
});
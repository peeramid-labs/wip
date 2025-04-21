import { expect } from "chai";
import { ethers, deployments,  getNamedAccounts } from "hardhat";
import { WIP__factory, WorldMultiSigV1__factory, TransparentUpgradeableProxy__factory } from "../typechain-types";

describe("WIP Upgrade Test", function () {
  let deployer: string;
  let worldDistributionAddress: string;
  let wipProxy: string;
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

    wipProxy = (await deployments.get("WIP")).address;
    multiSigProxy = (await deployments.get("WorldMultiSigV1")).address;
    console.log("WorldMultiSig address:", multiSigProxy);
    console.log("WIP address:", wipProxy);
  });

  it("should allow the deployer to upgrade WIP through multisig", async function () {
    // Deploy new WIP implementation
    const WIPFactory = await ethers.getContractFactory("WIP");
    const wipV2Implementation = await WIPFactory.deploy(false);
    await wipV2Implementation.waitForDeployment();
    const wipV2ImplAddress = await wipV2Implementation.getAddress();

    // Connect to the multisig with the deployer
    const signer = await ethers.getSigner(deployer);
    const multiSig = WorldMultiSigV1__factory.connect(multiSigProxy, signer);
    console.log("multiSig",await  multiSig.getAddress());
    console.log("wip v2",await  wipV2ImplAddress);

    // Create upgrade data
    const proxyAdminContract = new ethers.Contract(wipProxy, [
      "function upgradeAndCall(address proxy, address newImplementation, bytes calldata data)",
    ], signer);
    const upgradeData =  proxyAdminContract.interface.encodeFunctionData("upgradeAndCall", [
    wipProxy,
      wipV2ImplAddress,
      "0x"
    ]);

    // Verify the implementation was updated
    const wip = WIP__factory.connect(wipProxy, signer);

    const wipProxyAdmin = await ethers.provider.getStorage(wipProxy, "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103");
    const wipProxyAdminAddress = ethers.getAddress("0x" + wipProxyAdmin.slice(26));

    const worldMultiSig = await wip.worldMultiSig();
    expect(worldMultiSig).to.equal(multiSigProxy);
    // Execute the upgrade through multisig
    console.log('executing...', wipProxy,await  multiSig.getAddress())
    const tx = await multiSig.execute(upgradeData, wipProxyAdminAddress);
    await tx.wait();


    // Verify the upgrade worked by checking implementation address (EIP-1967 storage slot)
    const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    // Use getStorage instead of getStorageAt for ethers v6
    const implementationAddress = await ethers.provider.getStorage(wipProxy, implementationSlot);

    // Clean up the address (remove padding)
    const actualImplementation = ethers.getAddress("0x" + implementationAddress.slice(26));
    expect(actualImplementation).to.equal(wipV2ImplAddress);
  });
});
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Wallet Change Coverage Test", function () {
  let wip: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let mockGovernanceToken: any;
  let worldMultiSig: any;
  let deployerSigner: any;
  let walletSigner: any;
  let newWalletSigner: any;
  let mockWalletSigner: any;

  beforeEach(async function() {
    // Deploy a standard WIP contract to test
    const WIPFactory = await ethers.getContractFactory("WIP");
    wip = await WIPFactory.deploy(true);

    // Deploy mock contracts for testing
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    mockDistribution = await MockDistributionFactory.deploy();

    // Deploy WorldMultiSig
    const WorldMultiSigFactory = await ethers.getContractFactory("MockWorldMultiSig");
    worldMultiSig = await WorldMultiSigFactory.deploy(true);

    // Get signers
    const signers = await ethers.getSigners();
    deployerSigner = signers[0];
    walletSigner = signers[1];
    newWalletSigner = signers[2];
    mockWalletSigner = signers[3];

    // Setup mock distribution instances
    const mockGovernanceTokenFactory = await ethers.getContractFactory("MockGovernanceToken");
    mockGovernanceToken = await mockGovernanceTokenFactory.deploy();
    const mockToken = await mockGovernanceToken.getAddress();
    const mockDao = ethers.Wallet.createRandom().address;
    const instances = [mockToken, mockDao];
    await mockDistribution.mockSetInstances(instances);

    // Initialize WIP
    await wip.initialize(
      await mockVerifier.getAddress(),
      await mockDistribution.getAddress(),
      await worldMultiSig.getAddress()
    );

    // Setup mock WorldMultiSig
    await worldMultiSig.mockSetWIP(await wip.getAddress());
  });

  // Test just the core change wallet function with a simple input that will cause it to revert
  it("should not allow non-citizen to change wallet", async function() {
    // Call change wallet directly without any passport setup
    await expect(
      wip.connect(mockWalletSigner).changeWallet(newWalletSigner.address)
    ).to.be.revertedWith("only passport holder");
  });
});
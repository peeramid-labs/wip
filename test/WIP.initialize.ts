import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers, deployments } from "hardhat";

describe("WIP - Initialization", function () {
  let wip: any;
  let worldMultiSig: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let deployer: string;

  async function deployWIPFixture() {
    // Deploy all fixtures first to get the real proxies
    await deployments.fixture(["wip"]);

    // Get deployed contracts
    const wipDeployment = await deployments.get("WIP");
    const worldMultiSigDeployment = await deployments.get("WorldMultiSigV1");

    // Connect to the contracts
    const [deployerSigner] = await ethers.getSigners();
    deployer = deployerSigner.address;

    // Create contract instances
    const WIPFactory = await ethers.getContractFactory("WIP");
    wip = WIPFactory.attach(wipDeployment.address);

    const WorldMultiSigFactory = await ethers.getContractFactory("WorldMultiSigV1");
    worldMultiSig = WorldMultiSigFactory.attach(worldMultiSigDeployment.address);

    // For mocking purposes, also deploy mock implementations
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    mockDistribution = await MockDistributionFactory.deploy();

    return { wip, worldMultiSig, mockVerifier, mockDistribution, deployer };
  }

  beforeEach(async function () {
    // Deploy fresh instances for each test
    const deployed = await loadFixture(deployWIPFixture);

    wip = deployed.wip;
    worldMultiSig = deployed.worldMultiSig;
    mockVerifier = deployed.mockVerifier;
    mockDistribution = deployed.mockDistribution;
    deployer = deployed.deployer;
  });

  describe("Basic Initialization", function () {
    it("should have correct initial values", async function () {
      // Since we're using the real deployed contracts, they're already initialized
      // Check initialization values
      expect(await wip.name()).to.equal("WIP");
      expect(await wip.symbol()).to.equal("WIP");

      // Get WorldMultiSig address from WIP
      const multiSigAddress = await wip.worldMultiSig();
      expect(multiSigAddress).to.equal(await worldMultiSig.getAddress());
    });

    it("should not allow double initialization", async function() {
      // Try to initialize the existing, already initialized WIP contract again
      const worldMultiSigAddress = await worldMultiSig.getAddress();
      const mockVerifierAddress = await mockVerifier.getAddress();
      const mockDistributionAddress = await mockDistribution.getAddress();

      // Direct attempt to re-initialize should revert
      await expect(
        wip.initialize(
          mockVerifierAddress,
          mockDistributionAddress,
          worldMultiSigAddress
        )
      ).to.be.reverted;
    });

    it("should revert initialization with zero addresses", async function() {
      // Deploy a new contract
      const WIPFactory = await ethers.getContractFactory("WIP");
      const newWip = await WIPFactory.deploy(false);

      // Get the WorldMultiSig address
      const worldMultiSigAddress = await worldMultiSig.getAddress();
      const mockVerifierAddress = await mockVerifier.getAddress();
      const mockDistributionAddress = await mockDistribution.getAddress();

      // Using .to.be.reverted is more reliable than .to.be.revertedWith
      // when dealing with custom errors in solidity 0.8.x

      // Zero verifier address
      await expect(newWip.initialize(
        ethers.ZeroAddress,
        mockDistributionAddress,
        worldMultiSigAddress
      )).to.be.reverted;

      // Zero distribution address
      await expect(newWip.initialize(
        mockVerifierAddress,
        ethers.ZeroAddress,
        worldMultiSigAddress
      )).to.be.reverted;

      // Zero WorldMultiSig address
      await expect(newWip.initialize(
        mockVerifierAddress,
        mockDistributionAddress,
        ethers.ZeroAddress
      )).to.be.reverted;
    });
  });
});
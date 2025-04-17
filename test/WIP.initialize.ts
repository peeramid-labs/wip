import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Initialization", function () {
  let wip: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let worldMultiSig: any;
  let deployer: string;
  let initialOperator: string;

  async function deployWIPFixture() {
    // Deploy mock contracts for testing
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    mockDistribution = await MockDistributionFactory.deploy();

    // Deploy WorldMultiSig first
    const WorldMultiSigFactory = await ethers.getContractFactory("MockWorldMultiSig");
    worldMultiSig = await WorldMultiSigFactory.deploy();

    // Deploy WIP
    const WIPFactory = await ethers.getContractFactory("WIP");
    wip = await WIPFactory.deploy();

    // Get signers
    const [deployerSigner, initialOperatorSigner] = await ethers.getSigners();

    // Setup addresses
    deployer = deployerSigner.address;
    initialOperator = initialOperatorSigner.address;

    return { wip, mockVerifier, mockDistribution, worldMultiSig, deployer, initialOperator };
  }

  beforeEach(async function () {
    // Deploy fresh instances for each test
    const { wip: _wip, mockVerifier: _mockVerifier, mockDistribution: _mockDistribution,
            worldMultiSig: _worldMultiSig, deployer: _deployer, initialOperator: _initialOperator } =
            await loadFixture(deployWIPFixture);

    wip = _wip;
    mockVerifier = _mockVerifier;
    mockDistribution = _mockDistribution;
    worldMultiSig = _worldMultiSig;
    deployer = _deployer;
    initialOperator = _initialOperator;
  });

  describe("Basic Initialization", function () {
    it("should initialize with correct values", async function () {
      // Setup mock distribution instances
      const mockGovernanceTokenFactory = await ethers.getContractFactory("MockGovernanceToken");
      const mockGovernanceToken = await mockGovernanceTokenFactory.deploy();
      const mockToken = await mockGovernanceToken.getAddress();
      const mockDao = ethers.Wallet.createRandom().address;
      const instances = [mockToken, mockDao];
      await mockDistribution.mockSetInstances(instances);

      // Initialize WIP
      await wip.initialize(
        await mockVerifier.getAddress(),
        await mockDistribution.getAddress(),
        await worldMultiSig.getAddress(),
        initialOperator
      );

      // Setup mock WorldMultiSig
      await worldMultiSig.mockSetWIP(await wip.getAddress());

      // Verify initialization
      expect(await wip.name()).to.equal("WIP");
      expect(await wip.symbol()).to.equal("WIP");
      expect(await wip.worldMultiSig()).to.equal(await worldMultiSig.getAddress());
      expect(await wip.daoDistribution()).to.equal(await mockDistribution.getAddress());
    });

    it("should not allow double initialization", async function() {
      // Setup mock distribution instances
      const mockGovernanceTokenFactory = await ethers.getContractFactory("MockGovernanceToken");
      const mockGovernanceToken = await mockGovernanceTokenFactory.deploy();
      const mockToken = await mockGovernanceToken.getAddress();
      const mockDao = ethers.Wallet.createRandom().address;
      const instances = [mockToken, mockDao];
      await mockDistribution.mockSetInstances(instances);

      // Initialize WIP
      await wip.initialize(
        await mockVerifier.getAddress(),
        await mockDistribution.getAddress(),
        await worldMultiSig.getAddress(),
        initialOperator
      );

      // Try to initialize again
      await expect(wip.initialize(
        await mockVerifier.getAddress(),
        await mockDistribution.getAddress(),
        await worldMultiSig.getAddress(),
        initialOperator
      )).to.be.reverted; // Should be reverted with InvalidInitialization
    });

    it("should revert initialization with zero addresses", async function() {
      // Deploy a new contract
      const WIPFactory = await ethers.getContractFactory("WIP");
      const newWip = await WIPFactory.deploy();

      // Try to initialize with null addresses
      await expect(newWip.initialize(
        ethers.ZeroAddress,
        await mockDistribution.getAddress(),
        await worldMultiSig.getAddress(),
        initialOperator
      )).to.be.revertedWith("Verifier is required");

      await expect(newWip.initialize(
        await mockVerifier.getAddress(),
        ethers.ZeroAddress,
        await worldMultiSig.getAddress(),
        initialOperator
      )).to.be.revertedWith("DAO distribution is required");

      await expect(newWip.initialize(
        await mockVerifier.getAddress(),
        await mockDistribution.getAddress(),
        ethers.ZeroAddress,
        initialOperator
      )).to.be.revertedWith("WorldMultiSig is required");

      await expect(newWip.initialize(
        await mockVerifier.getAddress(),
        await mockDistribution.getAddress(),
        await worldMultiSig.getAddress(),
        ethers.ZeroAddress
      )).to.be.revertedWith("Initial operator is required");
    });
  });
});
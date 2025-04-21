import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Basic Claims", function () {
  let wip: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let worldMultiSig: any;
  let deployerSigner: any;
  let operator: any;

  // Function to create a mock proof
  function createMockProof() {
    return {
      a: [0, 0],
      b: [[0, 0], [0, 0]],
      c: [0, 0],
      pubSignals: new Array(21).fill(0)
    };
  }

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
    const signers = await ethers.getSigners();
    deployerSigner = signers[0];
    operator = signers[1];

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
      operator.address
    );

    // Setup mock WorldMultiSig
    await worldMultiSig.mockSetWIP(await wip.getAddress());
    await worldMultiSig.mockAddAuthorizedPauser(deployerSigner.address);
    await worldMultiSig.mockEnablePausing();

    return { wip, mockVerifier, mockDistribution, worldMultiSig };
  }

  beforeEach(async function () {
    // Deploy fresh instances for each test
    const { wip: _wip, mockVerifier: _mockVerifier, mockDistribution: _mockDistribution,
            worldMultiSig: _worldMultiSig } = await loadFixture(deployWIPFixture);

    wip = _wip;
    mockVerifier = _mockVerifier;
    mockDistribution = _mockDistribution;
    worldMultiSig = _worldMultiSig;
  });

  describe("Pause/Unpause", function() {
    it("should allow pause by WorldMultisig", async function() {
      // Pause the contract
      await worldMultiSig.connect(operator).pause();
      expect(await wip.paused()).to.be.true;
    });

    it("should allow unpause by WorldMultisig", async function() {
      // First pause
      await worldMultiSig.connect(operator).pause();
      expect(await wip.paused()).to.be.true;

      // Then unpause
      await worldMultiSig.connect(operator).unpause();
      expect(await wip.paused()).to.be.false;
    });

    it("should revert operations when paused", async function() {
      // Pause the contract
      await worldMultiSig.connect(operator).pause();
      expect(await wip.paused()).to.be.true;

      // Try to run verifySelfProof
      const proof = createMockProof();
      await expect(wip.verifySelfProof(proof)).to.be.reverted;
    });
  });

  describe("WorldMultiSig Integration", function() {
    it("should have the correct WIP address in WorldMultiSig", async function() {
      expect(await worldMultiSig.getWIP()).to.equal(await wip.getAddress());
    });

    it("should only allow WorldMultiSig to pause", async function() {
      await expect(wip.pause()).to.be.revertedWith("only worldMultiSig");
    });

    it("should only allow WorldMultiSig to unpause", async function() {
      // First pause using WorldMultiSig
      await worldMultiSig.connect(operator).pause();
      expect(await wip.paused()).to.be.true;

      // Try to unpause directly
      await expect(wip.unpause()).to.be.revertedWith("only worldMultiSig");

      // Unpause using WorldMultiSig
      await worldMultiSig.connect(operator).unpause();
      expect(await wip.paused()).to.be.false;
    });
  });
});
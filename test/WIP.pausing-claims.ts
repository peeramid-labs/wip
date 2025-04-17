import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";

describe("WIP - Claims and Pausing", function () {
  let wip: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let worldMultiSig: any;
  let deployerSigner: any;
  let operator: any;
  let citizen: any;

  // Helper to create a mock proof structure
  function createMockProof() {
    return {
      a: [0, 0],
      b: [[0, 0], [0, 0]],
      c: [0, 0],
      pubSignals: new Array(21).fill(0)
    };
  }

  // Helper to generate VoteElement array
  function generateVoteElements(proposals: string[], scores: number[]) {
    return proposals.map((proposal, index) => ({
      proposal: proposal,
      scoresGiven: scores[index] || 1
    }));
  }

  async function deployWIPFixture() {
    // Deploy mock contracts for testing
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    mockDistribution = await MockDistributionFactory.deploy();

    // Deploy mock governance token
    const MockGovernanceTokenFactory = await ethers.getContractFactory("MockGovernanceToken");
    const mockGovernanceToken = await MockGovernanceTokenFactory.deploy();

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
    citizen = signers[2];

    // Setup mock distribution instances
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

    return { wip, mockVerifier, mockDistribution, worldMultiSig, mockGovernanceToken };
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

  describe("Pause/Unpause Effects on Claims", function() {
    it("should prevent verifySelfProof when paused", async function() {
      // Pause the contract
      await worldMultiSig.connect(operator).pause();
      expect(await wip.paused()).to.be.true;

      // Try to verify a citizen - should be reverted because contract is paused
      const mockProof = createMockProof();
      await expect(wip.connect(citizen).verifySelfProof(mockProof))
        .to.be.reverted;

      // Unpause to verify the reverse
      await worldMultiSig.connect(operator).unpause();

      // Setup mock verifier to return a valid response
      await mockVerifier.mockSetReturnValues({
        revealedData: {
          issuingState: "TestCountry",
          dateOfBirth: "19900101",
          dateOfExpiry: "20300101",
          documentNumber: "ABC123456",
          fullName: "Test User"
        },
        expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        isExpired: false,
        issuingState: "TestCountry",
        citizen: citizen.address
      });

      // Now verification should proceed without revert until it hits actual functionality
      // This test just verifies that pausing/unpausing works, not the actual verification logic
      await expect(wip.connect(citizen).verifySelfProof(mockProof))
        .not.to.be.revertedWith("Pausable: paused");

      // It might still fail for other reasons, depending on the mock implementation
    });

    it("should prevent claim when paused", async function() {
      // Pause the contract
      await worldMultiSig.connect(operator).pause();
      expect(await wip.paused()).to.be.true;

      // Setup a claim attempt
      const proposal = "Test Proposal";
      const voteElements: any[] = [];

      // Try to claim - should be reverted because contract is paused
      await expect(wip.connect(citizen).claim(proposal, voteElements, citizen.address))
        .to.be.reverted;

      // Unpause to verify the reverse
      await worldMultiSig.connect(operator).unpause();

      // Now the claim would be processed until it hits actual functionality requirements
      // This test just verifies that pausing/unpausing works, not the actual claim logic
      await expect(wip.connect(citizen).claim(proposal, voteElements, citizen.address))
        .not.to.be.revertedWith("Pausable: paused");

      // It will likely fail with a different error message related to eligibility
    });
  });

  describe("WorldMultiSig Integration for Claims", function() {
    it("should allow changing paused state via WorldMultiSig", async function() {
      // Start unpaused
      expect(await wip.paused()).to.be.false;

      // Pause via WorldMultiSig
      await worldMultiSig.connect(operator).pause();
      expect(await wip.paused()).to.be.true;

      // Unpause via WorldMultiSig
      await worldMultiSig.connect(operator).unpause();
      expect(await wip.paused()).to.be.false;
    });

    it("should only allow WorldMultiSig to change pause state", async function() {
      // Try to pause directly (not via WorldMultiSig)
      await expect(wip.connect(citizen).pause())
        .to.be.revertedWith("only wolrdMultiSig");

      // Pause via WorldMultiSig
      await worldMultiSig.connect(operator).pause();
      expect(await wip.paused()).to.be.true;

      // Try to unpause directly (not via WorldMultiSig)
      await expect(wip.connect(citizen).unpause())
        .to.be.revertedWith("only wolrdMultiSig");
    });
  });
});
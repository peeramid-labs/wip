import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Essential Functions", function () {
  let wip: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let worldMultiSig: any;
  let deployerSigner: any;
  let citizen1Signer: any;
  let citizen2Signer: any;

  async function deployWIPFixture() {
    // Deploy mock contracts for testing
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    mockDistribution = await MockDistributionFactory.deploy();

    // Deploy WorldMultiSig first
    const WorldMultiSigFactory = await ethers.getContractFactory("MockWorldMultiSig");
    worldMultiSig = await WorldMultiSigFactory.deploy(true);

    // Deploy WIP
    const WIPFactory = await ethers.getContractFactory("WIP");
    wip = await WIPFactory.deploy(true);

    // Get signers
    const signers = await ethers.getSigners();
    deployerSigner = signers[0];
    citizen1Signer = signers[2];
    citizen2Signer = signers[3];

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
      await worldMultiSig.getAddress()
    );

    // Setup mock WorldMultiSig
    await worldMultiSig.mockSetWIP(await wip.getAddress());
    await worldMultiSig.mockAddAuthorizedPauser(deployerSigner.address);
    await worldMultiSig.mockEnablePausing();
    await worldMultiSig.mockAuthorizeForTests(deployerSigner.address);

    return { wip, mockVerifier, mockDistribution, worldMultiSig };
  }

  beforeEach(async function () {
    // Deploy fresh instances for each test
    const { wip: _wip, mockVerifier: _mockVerifier, mockDistribution: _mockDistribution,
            worldMultiSig: _worldMultiSig } =
            await loadFixture(deployWIPFixture);

    wip = _wip;
    mockVerifier = _mockVerifier;
    mockDistribution = _mockDistribution;
    worldMultiSig = _worldMultiSig;
  });

  describe("Additional getters", function() {
    it("should correctly report passportHolders state", async function() {
      const passportData = await wip.passportHolders(citizen1Signer.address);
      expect(passportData.citizenship).to.equal("");
      expect(passportData.isQualified).to.be.false;
      expect(passportData.revalidateAt).to.equal(0);
    });

    it("should correctly report daos state", async function() {
      const stateHash = ethers.keccak256(ethers.toUtf8Bytes("TestState"));
      const daoData = await wip.daos(stateHash);
      expect(daoData.dao).to.equal(ethers.ZeroAddress);
      expect(daoData.token).to.equal(ethers.ZeroAddress);
      expect(daoData.bonusBase).to.equal(0);
    });

    it("should correctly report proposal scores", async function() {
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("TestProposal"));
      const score = await wip.proposalScores(proposalHash);
      expect(score).to.equal(0);
    });


    it("should correctly report daoDistribution", async function() {
      expect(await wip.daoDistribution()).to.equal(await mockDistribution.getAddress());
    });
  });

  describe("Day and time functionality", function() {
    it("should handle no proposal bonus calculation correctly", async function() {
      // First day, no bonus
      const day1 = await wip.currentDay();
      expect(await wip.getNoProposalBonus(day1)).to.equal(0);

      // Advance time to day 2 (still no bonus)
      await time.increase(24 * 60 * 60);
      const day2 = await wip.currentDay();
      expect(await wip.getNoProposalBonus(day2)).to.equal(0);

      // Advance time to day 4 (should have a bonus)
      await time.increase(2 * 24 * 60 * 60);
      const day4 = await wip.currentDay();
      expect(await wip.getNoProposalBonus(day4)).to.be.gt(0);
    });

    it("should report daily proposal count correctly", async function() {
      const day = await wip.currentDay();
      expect(await wip.getDayProposalCnt(day)).to.equal(0);
    });
  });
});
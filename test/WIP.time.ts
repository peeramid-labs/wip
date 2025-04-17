import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Time Functionality", function () {
  let wip: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let worldMultiSig: any;
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
    initialOperator = initialOperatorSigner.address;

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

  it("should correctly report the current day", async function() {
    const currentDay = await wip.currentDay();
    const expectedDay = Math.floor(Math.floor(Date.now() / 1000) / (24 * 60 * 60));

    // Since the test might run at different times, we need to allow for a small difference
    const dayDifference = Math.abs(Number(currentDay) - expectedDay);
    expect(dayDifference).to.be.lessThanOrEqual(1);
  });

  it("should report 0 for getYesterdayProposalCnt initially", async function() {
    // No proposals submitted yet, so should be 0
    expect(await wip.getYesterdayProposalCnt()).to.equal(0);
  });

  it("should report false for votedToday initially", async function() {
    const [, , testAddress] = await ethers.getSigners();
    // No voting yet
    expect(await wip.votedToday(testAddress.address)).to.be.false;
  });

  it("should report 0 for getNoProposalBonus initially", async function() {
    const currentDay = await wip.currentDay();
    expect(await wip.getNoProposalBonus(currentDay)).to.equal(0);
  });
});
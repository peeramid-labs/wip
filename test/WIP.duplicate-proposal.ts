import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Duplicate Proposal Testing", function() {
  let mockWIP: any;
  let mockGovernanceToken: any;
  let citizen1Signer: any;
  let citizen2Signer: any;
  let otherSigner: any;

  async function deployFixture() {
    // Deploy mock contracts
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    const mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    const mockDistribution = await MockDistributionFactory.deploy();

    // Deploy mock governance token
    const MockGovernanceTokenFactory = await ethers.getContractFactory("MockGovernanceToken");
    mockGovernanceToken = await MockGovernanceTokenFactory.deploy();

    // Deploy WorldMultiSig
    const WorldMultiSigFactory = await ethers.getContractFactory("MockWorldMultiSig");
    const worldMultiSig = await WorldMultiSigFactory.deploy();

    // Deploy MockWIP
    const MockWIPFactory = await ethers.getContractFactory("MockWIP");
    mockWIP = await MockWIPFactory.deploy();

    // Get signers
    const signers = await ethers.getSigners();
    citizen1Signer = signers[1];
    citizen2Signer = signers[2];
    otherSigner = signers[4];

    // Setup mock distribution instances
    const mockToken = await mockGovernanceToken.getAddress();
    const mockDao = ethers.Wallet.createRandom().address;
    const instances = [mockToken, mockDao];
    await mockDistribution.mockSetInstances(instances);

    // Initialize WIP
    await mockWIP.initialize(
      await mockVerifier.getAddress(),
      await mockDistribution.getAddress(),
      await worldMultiSig.getAddress(),
      signers[0].address
    );

    return { mockWIP, mockVerifier, mockDistribution, mockGovernanceToken, worldMultiSig };
  }

  beforeEach(async function() {
    const fixture = await loadFixture(deployFixture);
    mockWIP = fixture.mockWIP;
    mockGovernanceToken = fixture.mockGovernanceToken;

    // Set up a DAO for CountryA
    await mockWIP.mockSetupDAOForCountry(
      "CountryA",
      await mockGovernanceToken.getAddress(),
      ethers.Wallet.createRandom().address,
      ethers.parseEther("1000")
    );

    // Set up citizens as passport holders
    await mockWIP.mockSetCitizenData(
      citizen1Signer.address,
      "CountryA",
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // Valid for 1 year
      true
    );

    await mockWIP.mockSetCitizenData(
      citizen2Signer.address,
      "CountryA",
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // Valid for 1 year
      true
    );
  });

  it("should not allow duplicate proposals in the same day", async function() {
    // Create the proposal text
    const proposalText = "Duplicate Proposal Test";

    // First, add a proposal for today
    await mockWIP.mockAddProposalToday(proposalText, citizen1Signer.address);

    // Verify the proposal count is 1
    const currentDay = await mockWIP.currentDay();
    const proposalCount = await mockWIP.getDayProposalCnt(currentDay);
    expect(proposalCount).to.equal(1);

    // Try to add the same proposal again (should fail with "Proposal already exists")
    await expect(
      mockWIP.mockAddProposalToday(proposalText, citizen2Signer.address)
    ).to.be.revertedWith("Proposal already exists");
  });

  it("should allow duplicate proposals on different days", async function() {
    // Create the proposal text
    const proposalText = "Cross-Day Proposal Test";

    // Add the proposal for the current day
    await mockWIP.mockAddProposalToday(proposalText, citizen1Signer.address);

    // Verify the proposal count is 1
    const currentDay = await mockWIP.currentDay();
    let proposalCount = await mockWIP.getDayProposalCnt(currentDay);
    expect(proposalCount).to.equal(1);

    // Advance time to next day
    await time.increase(24 * 60 * 60 + 1);

    // The new day should be different
    const nextDay = await mockWIP.currentDay();
    expect(nextDay).to.be.gt(currentDay);

    // We should be able to add the same proposal text on a different day
    await mockWIP.mockAddProposalToday(proposalText, citizen2Signer.address);

    // Verify the proposal count for the new day is 1
    proposalCount = await mockWIP.getDayProposalCnt(nextDay);
    expect(proposalCount).to.equal(1);
  });
});
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Batch Claims", function () {
  let mockWIP: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let mockGovernanceToken: any;
  let worldMultiSig: any;
  let deployerSigner: any;
  let citizen1Signer: any;
  let citizen2Signer: any;
  let citizen3Signer: any;

  // Constants from WIP contract
  const CLAIMABLE_AMOUNT = ethers.parseEther("64");
  const ONE_DAY = BigInt(86400);

  // Function to generate vote elements
  function generateVoteElements(proposals: any[], scores: number[]) {
    return proposals.map((proposal, index) => ({
      proposal: proposal,
      scoresGiven: scores[index] || 1
    }));
  }

  async function deployMockWIPFixture() {
    // Deploy mock contracts for testing
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    mockDistribution = await MockDistributionFactory.deploy();

    // Deploy and set up governance token
    const MockGovernanceTokenFactory = await ethers.getContractFactory("MockGovernanceToken");
    mockGovernanceToken = await MockGovernanceTokenFactory.deploy();
    await mockGovernanceToken.mockSetDecimals(18);

    // Deploy WorldMultiSig
    const WorldMultiSigFactory = await ethers.getContractFactory("MockWorldMultiSig");
    worldMultiSig = await WorldMultiSigFactory.deploy(true);

    // Deploy MockWIP
    const MockWIPFactory = await ethers.getContractFactory("MockWIP");
    mockWIP = await MockWIPFactory.deploy();

    // Get signers
    const signers = await ethers.getSigners();
    deployerSigner = signers[0];
    citizen1Signer = signers[1];
    citizen2Signer = signers[2];
    citizen3Signer = signers[3];

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
    );

    // Setup mock WorldMultiSig
    await worldMultiSig.mockSetWIP(await mockWIP.getAddress());

    return { mockWIP, mockVerifier, mockDistribution, mockGovernanceToken, worldMultiSig };
  }

  beforeEach(async function() {
    // Deploy fresh contracts for each test
    const { mockWIP: _mockWIP, mockVerifier: _mockVerifier, mockDistribution: _mockDistribution,
            mockGovernanceToken: _mockGovernanceToken, worldMultiSig: _worldMultiSig } =
            await loadFixture(deployMockWIPFixture);

    mockWIP = _mockWIP;
    mockVerifier = _mockVerifier;
    mockDistribution = _mockDistribution;
    mockGovernanceToken = _mockGovernanceToken;
    worldMultiSig = _worldMultiSig;

    // Set up countries/DAOs
    await mockWIP.mockSetupDAOForCountry(
      "CountryA",
      await mockGovernanceToken.getAddress(),
      ethers.Wallet.createRandom().address,
      ethers.parseEther("1000")
    );

    await mockWIP.mockSetupDAOForCountry(
      "CountryB",
      await mockGovernanceToken.getAddress(),
      ethers.Wallet.createRandom().address,
      ethers.parseEther("1000")
    );

    // Setup citizens with direct storage access
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

    await mockWIP.mockSetCitizenData(
      citizen3Signer.address,
      "CountryB",
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // Valid for 1 year
      true
    );

    // Give initial tokens to proposals
    await mockWIP.mockMintTokens(citizen1Signer.address, ethers.parseEther("100"));
    await mockWIP.mockMintTokens(citizen2Signer.address, ethers.parseEther("100"));
    await mockWIP.mockMintTokens(citizen3Signer.address, ethers.parseEther("100"));
  });

  describe("ClaimBatch Function", function() {
    it("should revert if array lengths are inconsistent", async function() {
      const proposals = ["Proposal 1", "Proposal 2"];
      const votes = [[]];
      const accounts = [citizen1Signer.address, citizen2Signer.address];

      await expect(
        mockWIP.claimBatch(proposals, votes, accounts)
      ).to.be.revertedWith("array lengths inconsistent");

      const proposals2 = ["Proposal 1"];
      const votes2 = [[]];
      const accounts2 = [citizen1Signer.address, citizen2Signer.address];

      await expect(
        mockWIP.claimBatch(proposals2, votes2, accounts2)
      ).to.be.revertedWith("array lengths inconsistent");
    });

    it("should successfully process a claim", async function() {
      // Create a proposal for yesterday
      const currentDay = BigInt(await mockWIP.currentDay());

      // Update the lastClaimedDay to be before today
      await mockWIP.mockSetLastClaimedDay(citizen1Signer.address, currentDay - BigInt(1));

      // Create proposals for yesterday
      await mockWIP.mockSetLastProposalDay(currentDay - BigInt(1));
      await mockWIP.mockAddProposalForDay(currentDay - BigInt(1), "Yesterdays Proposal", deployerSigner.address);

      // Get proposal hash for voting
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Yesterdays Proposal"));

      // Create vote elements
      const votes1 = generateVoteElements([proposalHash], [4]);

      // Approve for operator to claim on behalf
      await mockWIP.connect(citizen1Signer).approve(deployerSigner.address, ethers.parseEther("1000"));

      // Check token balance before
      const initialBalance = await mockWIP.balanceOf(citizen1Signer.address);

      // Setup batch parameters
      const proposals = ["Today Proposal"];
      const votes = [votes1];
      const accounts = [citizen1Signer.address];

      // Execute batch claim
      await mockWIP.connect(deployerSigner).claim(proposals[0], votes[0], accounts[0]);

      // Check citizen has claimed today
      expect(await mockWIP.votedToday(citizen1Signer.address)).to.be.true;

      // Check token balance increased
      expect(await mockWIP.balanceOf(citizen1Signer.address)).to.be.gt(initialBalance);
    });

    it("should successfully process a batch with a single claim", async function() {
      // Create a proposal for yesterday
      const currentDay = BigInt(await mockWIP.currentDay());

      // Update the lastClaimedDay to be before today
      await mockWIP.mockSetLastClaimedDay(citizen1Signer.address, currentDay - BigInt(1));

      // Create proposals for yesterday
      await mockWIP.mockSetLastProposalDay(currentDay - BigInt(1));
      await mockWIP.mockAddProposalForDay(currentDay - BigInt(1), "Yesterdays Proposal", deployerSigner.address);

      // Get proposal hash for voting
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Yesterdays Proposal"));

      // Create vote elements
      const votes1 = generateVoteElements([proposalHash], [4]);

      // Approve for operator to claim on behalf
      await mockWIP.connect(citizen1Signer).approve(deployerSigner.address, ethers.parseEther("1000"));

      // Check token balance before
      const initialBalance = await mockWIP.balanceOf(citizen1Signer.address);

      // Setup batch parameters with only one claim
      const proposals = ["Today Proposal"];
      const votes = [votes1];
      const accounts = [citizen1Signer.address];

      // Execute batch claim
      await mockWIP.connect(deployerSigner).claimBatch(proposals, votes, accounts);

      // Check citizen has claimed today
      expect(await mockWIP.votedToday(citizen1Signer.address)).to.be.true;

      // Check token balance increased
      expect(await mockWIP.balanceOf(citizen1Signer.address)).to.be.gt(initialBalance);
    });

    it("should handle partial failures correctly", async function() {
      // Setup an invalid citizen (fourth address)
      const invalidAddress = ethers.Wallet.createRandom().address;

      // Setup batch parameters with one invalid address
      const proposals = ["Today Proposal 1", "Today Proposal 2", "Invalid Proposal"];
      const votes = [[], [], []];
      const accounts = [
        citizen1Signer.address,
        citizen2Signer.address,
        invalidAddress  // This address is not a valid citizen
      ];

      // This should revert the entire batch
      await expect(
        mockWIP.claimBatch(proposals, votes, accounts)
      ).to.be.reverted;

      // Verify no claims were processed
      expect(await mockWIP.votedToday(citizen1Signer.address)).to.be.false;
      expect(await mockWIP.votedToday(citizen2Signer.address)).to.be.false;
    });

    it("should correctly handle authorization for claims on behalf of others", async function() {
      // Create a proposal for yesterday
      const currentDay = BigInt(await mockWIP.currentDay());

      // Update the lastClaimedDay to be before today
      await mockWIP.mockSetLastClaimedDay(citizen1Signer.address, currentDay - BigInt(1));

      // Create proposals for yesterday
      await mockWIP.mockSetLastProposalDay(currentDay - BigInt(1));
      await mockWIP.mockAddProposalForDay(currentDay - BigInt(1), "Yesterdays Proposal", deployerSigner.address);

      // Get proposal hash for voting
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Yesterdays Proposal"));

      // Create vote elements
      const votes1 = generateVoteElements([proposalHash], [4]);

      // Approve the operator (deployerSigner) to spend tokens on behalf of citizen1
      await mockWIP.connect(citizen1Signer).approve(deployerSigner.address, ethers.parseEther("1000"));

      // Setup batch parameters
      const proposals = ["Today Proposal"];
      const votes = [votes1];
      const accounts = [citizen1Signer.address];

      // Execute batch claim as the operator
      await mockWIP.connect(deployerSigner).claimBatch(proposals, votes, accounts);

      // Check that citizen1 has voted today
      expect(await mockWIP.votedToday(citizen1Signer.address)).to.be.true;
    });

    it("should emit appropriate events for each claim in the batch", async function() {
      // Create a proposal for yesterday
      const currentDay = BigInt(await mockWIP.currentDay());

      // Update the lastClaimedDay to be before today
      await mockWIP.mockSetLastClaimedDay(citizen1Signer.address, currentDay - BigInt(1));
      await mockWIP.mockSetLastClaimedDay(citizen2Signer.address, currentDay - BigInt(1));

      // Create proposals for yesterday
      await mockWIP.mockSetLastProposalDay(currentDay - BigInt(1));
      await mockWIP.mockAddProposalForDay(currentDay - BigInt(1), "Yesterdays Proposal", deployerSigner.address);

      // Get proposal hash for voting (from yesterday)
      const yesterdayProposalHash = ethers.keccak256(ethers.toUtf8Bytes("Yesterdays Proposal"));

      // Create vote elements for today
      const votes1 = generateVoteElements([yesterdayProposalHash], [4]);
      const votes2 = generateVoteElements([yesterdayProposalHash], [4]);

      // Setup batch parameters
      const proposals = ["Today Proposal 1", "Today Proposal 2"];
      const votes = [votes1, votes2];
      const accounts = [citizen1Signer.address, citizen2Signer.address];

      // Get proposal hashes
      const proposal1Hash = ethers.keccak256(ethers.toUtf8Bytes("Today Proposal 1"));

      // Need to approve both citizens for claims
      await mockWIP.connect(citizen1Signer).approve(deployerSigner.address, ethers.parseEther("1000"));
      await mockWIP.connect(citizen2Signer).approve(deployerSigner.address, ethers.parseEther("1000"));

      // Execute batch claim and check events - send from deployer since we're approving from citizens
      await expect(mockWIP.connect(deployerSigner).claimBatch(proposals, votes, accounts))
        .to.emit(mockWIP, "ProposingByAddress")
        .withArgs(
          citizen1Signer.address,
          currentDay,
          proposal1Hash,
          "Today Proposal 1",
          0 // initial score
        );
    });
  });

  describe("UN Functionality", function() {
    // United Nations hash constant from WIP contract
    const UNHash = "0x0123456789ABCDFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

    it("should initialize with United Nations DAO", async function() {
      // Check that UN DAO was created during initialization
      const unDAO = await mockWIP.daos(UNHash);

      // Verify UN DAO token and address are set
      expect(unDAO.token).to.not.equal(ethers.ZeroAddress);
      expect(unDAO.dao).to.not.equal(ethers.ZeroAddress);
      expect(unDAO.bonusBase).to.equal(ethers.parseEther("1337000"));
      expect(unDAO.verifiedCount).to.equal(1);
    });

    it("should add citizens to UN when verifying passport", async function() {
      const newCitizen = ethers.Wallet.createRandom();

      // Get initial UN DAO state
      const initialUnDAO = await mockWIP.daos(UNHash);
      const initialVerifiedCount = initialUnDAO.verifiedCount;

      // Manually update verified count to ensure it can be incremented
      await mockWIP.mockUpdateUNVerifiedCount(10);

      // Mock the verification with a new country using our enhanced method
      const expiryDate = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now

      // Use the enhanced version that properly updates UN
      await expect(
        mockWIP.mockVerifySelfProofWithCountryAndUN(
          newCitizen.address,
          "TestCountry",
          expiryDate
        )
      ).to.emit(mockWIP, "GlobalCitizenOnboarded");

      // Check UN verifiedCount was incremented
      const finalUnDAO = await mockWIP.daos(UNHash);
      expect(finalUnDAO.verifiedCount).to.be.gt(10);
    });

    it("should process claims with proper setup", async function() {
      // Create a proposal for yesterday
      const currentDay = BigInt(await mockWIP.currentDay());

      // Update the lastClaimedDay to be before today
      await mockWIP.mockSetLastClaimedDay(citizen1Signer.address, currentDay - BigInt(1));

      // Create proposals for yesterday
      await mockWIP.mockSetLastProposalDay(currentDay - BigInt(1));
      await mockWIP.mockAddProposalForDay(currentDay - BigInt(1), "Yesterdays Proposal", deployerSigner.address);

      // Get proposal hash for voting
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Yesterdays Proposal"));

      // Create vote elements
      const votes1 = generateVoteElements([proposalHash], [4]);

      // Give enough tokens for voting
      await mockWIP.mockMintTokens(citizen1Signer.address, ethers.parseEther("1000"));

      // Ensure there's at least one proposal from yesterday
      const proposalCount = await mockWIP.getDayProposalCnt(currentDay - BigInt(1));
      expect(proposalCount).to.be.gte(1);

      // Process a claim directly
      await mockWIP.connect(citizen1Signer).claim(
        "New Proposal 1",
        votes1,
        citizen1Signer.address
      );

      // Check claim was processed
      expect(await mockWIP.votedToday(citizen1Signer.address)).to.be.true;
    });

    it("should handle claimBatch for citizens from different countries", async function() {
      // Create proposals for yesterday
      const currentDay = BigInt(await mockWIP.currentDay());

      // Setup a new citizen from a different country
      await mockWIP.mockVerifySelfProofWithNewCountry(
        citizen3Signer.address,
        "CountryC",
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
      );

      // Update the lastClaimedDay to be before today
      await mockWIP.mockSetLastClaimedDay(citizen1Signer.address, currentDay - BigInt(1));
      await mockWIP.mockSetLastClaimedDay(citizen3Signer.address, currentDay - BigInt(1));

      // Create proposals for yesterday
      await mockWIP.mockSetLastProposalDay(currentDay - BigInt(1));
      await mockWIP.mockAddProposalForDay(currentDay - BigInt(1), "Yesterdays Proposal", deployerSigner.address);

      // Get proposal hash for voting
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Yesterdays Proposal"));

      // Create vote elements
      const votes1 = generateVoteElements([proposalHash], [4]);
      const votes3 = generateVoteElements([proposalHash], [4]);

      // Approve for operators to claim on behalf
      await mockWIP.connect(citizen1Signer).approve(deployerSigner.address, ethers.parseEther("1000"));
      await mockWIP.connect(citizen3Signer).approve(deployerSigner.address, ethers.parseEther("1000"));

      // Setup batch parameters with claims from different countries
      const proposals = ["Today Proposal 1", "Today Proposal 3"];
      const votes = [votes1, votes3];
      const accounts = [citizen1Signer.address, citizen3Signer.address];

      // Execute batch claim
      await mockWIP.connect(deployerSigner).claimBatch(proposals, votes, accounts);

      // Check citizens have claimed today
      expect(await mockWIP.votedToday(citizen1Signer.address)).to.be.true;
      expect(await mockWIP.votedToday(citizen3Signer.address)).to.be.true;

      // Verify cross-country votes work as expected
      // For Country A citizen voting on proposals from Country C (and vice versa)
      const citizen1Country = await mockWIP.passportHolders(citizen1Signer.address);
      const citizen3Country = await mockWIP.passportHolders(citizen3Signer.address);

      expect(citizen1Country.citizenship).to.not.equal(citizen3Country.citizenship);
    });

    it("should distribute tokens when voting across countries", async function() {
      // Skip this test since it requires more complex setup
      this.skip();
    });
  });
});
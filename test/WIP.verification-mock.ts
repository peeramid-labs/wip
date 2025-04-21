import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Verification Coverage Tests", function () {
  let mockWIP: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let mockGovernanceToken: any;
  let worldMultiSig: any;
  let deployerSigner: any;
  let citizen1Signer: any;
  let citizen2Signer: any;
  let citizen3Signer: any;
  let nonCitizenSigner: any;

  // Constants from WIP contract
  const CLAIMABLE_AMOUNT = ethers.parseEther("64");
  const MAX_SCORE_ALLOCATION = 900000;

  // Function to create a mock proof
  function createMockProof() {
    return {
      a: [0, 0],
      b: [[0, 0], [0, 0]],
      c: [0, 0],
      pubSignals: new Array(21).fill(0)
    };
  }

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

    // Deploy WIP
    const MockWIPFactory = await ethers.getContractFactory("MockWIP");
    mockWIP = await MockWIPFactory.deploy();

    // Get signers
    const signers = await ethers.getSigners();
    deployerSigner = signers[0];
    citizen1Signer = signers[1];
    citizen2Signer = signers[2];
    citizen3Signer = signers[3];
    nonCitizenSigner = signers[4];

    // Setup mock distribution instances
    const mockToken = await mockGovernanceToken.getAddress();
    const mockDao = ethers.Wallet.createRandom().address;
    const instances = [mockToken, mockDao];
    await mockDistribution.mockSetInstances(instances);

    // Initialize WIP
    await mockWIP.initialize(
      await mockVerifier.getAddress(),
      await mockDistribution.getAddress(),
      await worldMultiSig.getAddress()
    );

    // Setup mock WorldMultiSig
    await worldMultiSig.mockSetWIP(await mockWIP.getAddress());

    return { mockWIP, mockVerifier, mockDistribution, mockGovernanceToken, worldMultiSig };
  }

  describe("verifySelfProof - Complete Coverage Tests", function() {
    beforeEach(async function() {
      const { mockWIP: _mockWIP, mockVerifier: _mockVerifier, mockDistribution: _mockDistribution,
              mockGovernanceToken: _mockGovernanceToken, worldMultiSig: _worldMultiSig } =
              await loadFixture(deployMockWIPFixture);

      mockWIP = _mockWIP;
      mockVerifier = _mockVerifier;
      mockDistribution = _mockDistribution;
      mockGovernanceToken = _mockGovernanceToken;
      worldMultiSig = _worldMultiSig;
    });

    it("should emit Verified event with correct parameters", async function() {
      // Use mockVerifySelfProofWithNewCountry to simulate verification
      const futureTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now

      // This should emit the Verified event
      await expect(mockWIP.mockVerifySelfProofWithNewCountry(
        citizen1Signer.address,
        "CountryA",
        futureTimestamp
      ))
        .to.emit(mockWIP, "Verified")
        .withArgs(citizen1Signer.address, futureTimestamp, "CountryA", false);

      // Check if the passport holder data was set correctly
      const passportData = await mockWIP.passportHolders(citizen1Signer.address);
      expect(passportData.isQualified).to.be.true;
      expect(passportData.citizenship).to.equal("CountryA");
    });

    it("should create a new DAO when the first citizen from a country verifies", async function() {
      // Use mockVerifySelfProofWithNewCountry to simulate verification
      const futureTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now

      // This should emit the NewCountryOnboarded event
      await expect(mockWIP.mockVerifySelfProofWithNewCountry(
        citizen1Signer.address,
        "NewCountry",
        futureTimestamp
      ))
        .to.emit(mockWIP, "NewCountryOnboarded");

      // Check if the DAO was created
      const countryHash = ethers.keccak256(ethers.toUtf8Bytes("NewCountry"));
      const daoInfo = await mockWIP.daos(countryHash);
      expect(daoInfo.bonusBase).to.be.gt(0);
    });

    it("should mint tokens to a citizen joining an existing country", async function() {
      // First set up a country
      const countryName = "ExistingCountry";
      await mockWIP.mockSetupDAOForCountry(
        countryName,
        await mockGovernanceToken.getAddress(),
        ethers.Wallet.createRandom().address,
        ethers.parseEther("1000")
      );

      // Set up a citizen joining that country
      const futureTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now
      const onboardingBonus = 500;

      // This should emit a FirstCitizenOnboarded event
      await expect(mockWIP.mockVerifySelfProofWithExistingCountry(
        citizen1Signer.address,
        countryName,
        futureTimestamp,
        onboardingBonus
      ))
        .to.emit(mockWIP, "FirstCitizenOnboarded");

      // Check if citizen data was set correctly
      const passportData = await mockWIP.passportHolders(citizen1Signer.address);
      expect(passportData.isQualified).to.be.true;
      expect(passportData.citizenship).to.equal(countryName);
    });

    it("should mint minimal tokens when issuancePool is depleted", async function() {
      // First set up a country
      const countryName = "LowPool";
      await mockWIP.mockSetupDAOForCountry(
        countryName,
        await mockGovernanceToken.getAddress(),
        ethers.Wallet.createRandom().address,
        ethers.parseEther("0")  // Empty pool
      );

      // Set up a citizen joining that country
      const futureTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now

      // This should still emit FirstCitizenOnboarded but with minimal bonus
      await expect(mockWIP.mockVerifySelfProofWithExistingCountry(
        citizen1Signer.address,
        countryName,
        futureTimestamp,
        0
      ))
        .to.emit(mockWIP, "FirstCitizenOnboarded")
        .withArgs(countryName, 1, citizen1Signer.address);
    });
  });

  describe("Wallet Change with Verification", function() {
    beforeEach(async function() {
      const { mockWIP: _mockWIP, mockVerifier: _mockVerifier } = await loadFixture(deployMockWIPFixture);
      mockWIP = _mockWIP;
      mockVerifier = _mockVerifier;

      // Set up citizen1 as a passport holder using our mock function
      const futureTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now
      await mockWIP.mockVerifySelfProofWithNewCountry(
        citizen1Signer.address,
        "CountryA",
        futureTimestamp
      );
    });

    it("should allow a passport holder to change their wallet", async function() {
      // Change wallet
      await expect(mockWIP.connect(citizen1Signer).changeWallet(nonCitizenSigner.address))
        .to.emit(mockWIP, "WalletChanged")
        .withArgs(citizen1Signer.address, nonCitizenSigner.address);

      // Verify old wallet data is cleared
      const oldData = await mockWIP.passportHolders(citizen1Signer.address);
      expect(oldData.isQualified).to.be.false;

      // Verify new wallet has the passport data
      const newData = await mockWIP.passportHolders(nonCitizenSigner.address);
      expect(newData.isQualified).to.be.true;
      expect(newData.citizenship).to.equal("CountryA");
    });

    it("should not allow wallet change after claiming on the same day", async function() {
      // Simulate having claimed today
      await mockWIP.mockUpdateLastClaimed(citizen1Signer.address);

      // Try to change wallet
      await expect(mockWIP.connect(citizen1Signer).changeWallet(nonCitizenSigner.address))
        .to.be.revertedWith("can change wallet only before claiming");
    });
  });

  describe("Claim Processing - Complete Coverage", function() {
    beforeEach(async function() {
      const { mockWIP: _mockWIP, mockVerifier: _mockVerifier, mockGovernanceToken: _mockGovernanceToken } =
            await loadFixture(deployMockWIPFixture);

      mockWIP = _mockWIP;
      mockVerifier = _mockVerifier;
      mockGovernanceToken = _mockGovernanceToken;

      // Set up a DAO for CountryA
      await mockWIP.mockSetupDAOForCountry(
        "CountryA",
        await mockGovernanceToken.getAddress(),
        ethers.Wallet.createRandom().address,
        ethers.parseEther("1000")
      );

      // Set up citizen1 and citizen2 as passport holders
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

      await time.increase(60*60*240);

      // Set up a proposal from yesterday from citizen2 with a vote
      await mockWIP.mockAddProposalAndVote(
        "Yesterday's proposal",
        citizen2Signer.address,
        ethers.ZeroAddress,  // No voter
        0  // No score
      );

      // Mint tokens to both citizens
      await mockWIP.mockMintTokens(citizen1Signer.address, ethers.parseEther("100000"));
      await mockWIP.mockMintTokens(citizen2Signer.address, ethers.parseEther("100000"));
    });

    it("should require votes if there were proposals yesterday", async function() {
    //   await time.increase(60*60*23);
      const day = await mockWIP.currentDay();
      const propsYesterday = await mockWIP.getDayProposalCnt(Number(day) - 1);
      expect(propsYesterday).to.be.greaterThan(0);
      // Try to claim without voting
      await expect(
        mockWIP.connect(citizen1Signer).claim("New proposal", [], citizen1Signer.address)
      ).to.be.revertedWith("No vote");
    });

    it("should limit vote scores to the maximum allowed", async function() {
      // Get the proposal hash
      const proposalText = "Yesterday's proposal";
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes(proposalText));
      await mockWIP.mockAddProposal(proposalText, citizen2Signer.address);


      // Create vote with score exceeding maximum
      const votes = generateVoteElements([proposalHash], [MAX_SCORE_ALLOCATION + 100]);
      // Try to claim with excessive votes
      await expect(
        mockWIP.connect(citizen1Signer).claim("New proposal", votes, citizen1Signer.address)
      ).to.be.revertedWith("Score allocation exceeds maximum");
    });

    it("should not allow voting for your own proposal", async function() {
      // Get the proposal hash
      const proposalText = "Yesterday's proposal";
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes(proposalText));
      await mockWIP.mockAddProposal(proposalText+ "1", citizen1Signer.address);
      // Try to claim with a vote for own proposal
      const votes = generateVoteElements([proposalHash], [5]);
      await expect(
        mockWIP.connect(citizen2Signer).claim("New proposal", votes, citizen2Signer.address)
      ).to.be.revertedWith("You cannot vote for yourself");
    });

    it("should process valid claims with proper voting", async function() {
      // Get the proposal hash
      const proposalText = "Yesterday's proposal";
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes(proposalText));

      // Create valid vote
      const votes = generateVoteElements([proposalHash], [10]);

      // Claim with valid vote
      await expect(
        mockWIP.connect(citizen1Signer).claim("New proposal", votes, citizen1Signer.address)
      ).to.not.be.reverted;

      // Check that the claim was processed
      const lastClaimed = await mockWIP.votedToday(citizen1Signer.address);
      expect(lastClaimed).to.be.true;
    });

    it("should handle claim with no proposal bonus", async function() {
      // Reset last proposal day to simulate no recent proposals
      const currentDay = await mockWIP.currentDay();
      await mockWIP.mockSetLastProposalDay(Number(currentDay) - 3);

      // No proposals from yesterday
      // Clear yesterday's proposals by setting up a clean fixture
      const { mockWIP: cleanMockWIP, mockGovernanceToken: cleanMockToken } = await loadFixture(deployMockWIPFixture);

      // Set up a DAO
      await cleanMockWIP.mockSetupDAOForCountry(
        "CountryA",
        await cleanMockToken.getAddress(),
        ethers.Wallet.createRandom().address,
        ethers.parseEther("1000")
      );

      // Set up citizen
      await cleanMockWIP.mockSetCitizenData(
        citizen1Signer.address,
        "CountryA",
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        true
      );

      // Set last proposal day to simulate no proposals for a few days
      await time.increase(60*60*24*3);

      // Should get a bonus for claiming after days without proposals
      await expect(
        cleanMockWIP.connect(citizen1Signer).claim("New proposal", [], citizen1Signer.address)
      ).to.not.be.reverted;
    });

    it("should not allow creating a proposal that already exists", async function() {
      // Set up fresh tests
      const { mockWIP: _mockWIP, mockGovernanceToken: _mockToken } = await loadFixture(deployMockWIPFixture);
      mockWIP = _mockWIP;
      mockGovernanceToken = _mockToken;

      // Set up a DAO
      await mockWIP.mockSetupDAOForCountry(
        "CountryA",
        await mockGovernanceToken.getAddress(),
        ethers.Wallet.createRandom().address,
        ethers.parseEther("1000")
      );

      // Set up citizens
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

      // Set up a third citizen for creating proposals to vote on
      await mockWIP.mockSetCitizenData(
        citizen3Signer.address,
        "CountryA",
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // Valid for 1 year
        true
      );

      // Add a proposal from yesterday
      const yesterdayProposalText = "Yesterday's Proposal";
      await mockWIP.mockAddProposal(yesterdayProposalText, citizen3Signer.address);

      // Get yesterday's proposal hash
      const yesterdayProposalHash = ethers.keccak256(ethers.toUtf8Bytes(yesterdayProposalText));

      // Mint tokens to citizens
      await mockWIP.mockMintTokens(citizen1Signer.address, ethers.parseEther("64"));
      await mockWIP.mockMintTokens(citizen2Signer.address, ethers.parseEther("64"));

      // Create votes with max score to ensure spending enough
      const votes = [{
        proposal: yesterdayProposalHash,
        scoresGiven: 12 // Use max score
      }];

      // First citizen submits a proposal for today
      const proposalText = "Today's Proposal";
      await mockWIP.connect(citizen1Signer).claim(proposalText, votes, citizen1Signer.address);

      // Second citizen tries to submit the same proposal text (should fail with "Proposal already exists")
      await expect(
        mockWIP.connect(citizen2Signer).claim(proposalText, votes, citizen2Signer.address)
      ).to.be.revertedWith("Proposal already exists");
    });
  });

  describe("Claim Authorization", function() {
    beforeEach(async function() {
      const { mockWIP: _mockWIP } = await loadFixture(deployMockWIPFixture);
      mockWIP = _mockWIP;

      // Set up a DAO
      await mockWIP.mockSetupDAOForCountry(
        "CountryA",
        await mockGovernanceToken.getAddress(),
        ethers.Wallet.createRandom().address,
        ethers.parseEther("1000")
      );

      // Set up citizens
      await mockWIP.mockSetCitizenData(
        citizen1Signer.address,
        "CountryA",
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        true
      );

      await mockWIP.mockSetCitizenData(
        citizen2Signer.address,
        "CountryA",
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        true
      );

      // Set up a third citizen for creating proposals to vote on
      await mockWIP.mockSetCitizenData(
        citizen3Signer.address,
        "CountryA",
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        true
      );

      // Add a proposal from yesterday from the third citizen
      await mockWIP.mockAddProposal("Yesterday's Proposal", citizen3Signer.address);

      // Mint tokens for voting
      await mockWIP.mockMintTokens(citizen1Signer.address, ethers.parseEther("100000"));
    });

    it("should allow claiming on behalf of another with approval", async function() {
      // Get the proposal hash (from the third citizen, not citizen1 or citizen2)
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Yesterday's Proposal"));

      // Create votes with max score to ensure spending enough
      const votes = generateVoteElements([proposalHash], [12]);

      // Important: For the authorization to work, need to set allowances in both directions
      // First: onBehalfOf (citizen1) approves msg.sender (citizen2)
      await mockWIP.connect(citizen1Signer).approve(citizen2Signer.address, ethers.parseEther("100000"));

      // Second: msg.sender (citizen2) approves onBehalfOf (citizen1)
      await mockWIP.connect(citizen2Signer).approve(citizen1Signer.address, ethers.parseEther("100000"));

      // Citizen2 claims on behalf of citizen1
      await expect(
        mockWIP.connect(citizen2Signer).claim("New proposal from behalf", votes, citizen1Signer.address)
      ).to.not.be.reverted;
    });

    it("should revert if not authorized for on-behalf claim", async function() {
      // Get the proposal hash (from the third citizen, not citizen1 or citizen2)
      const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Yesterday's Proposal"));

      // Create votes with max score to ensure spending enough
      const votes = generateVoteElements([proposalHash], [12]);

      // No approval is given

      // Citizen2 tries to claim on behalf of citizen1 without approval
      await expect(
        mockWIP.connect(citizen2Signer).claim("New proposal from behalf", votes, citizen1Signer.address)
      ).to.be.revertedWith("Not authorized");
    });
  });
});

describe("WIP - Authorization Testing", function() {
  let mockWIP: any;
  let mockGovernanceToken: any;
  let citizen1Signer: any;
  let citizen2Signer: any;
  let citizen3Signer: any;

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
    const worldMultiSig = await WorldMultiSigFactory.deploy(true);

    // Deploy MockWIP
    const MockWIPFactory = await ethers.getContractFactory("MockWIP");
    mockWIP = await MockWIPFactory.deploy();

    // Get signers
    const signers = await ethers.getSigners();
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
      await worldMultiSig.getAddress()
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

    // Set up citizen1 as a passport holder
    await mockWIP.mockSetCitizenData(
      citizen1Signer.address,
      "CountryA",
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // Valid for 1 year
      true
    );

    // Setup citizen2 as well
    await mockWIP.mockSetCitizenData(
      citizen2Signer.address,
      "CountryA",
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      true
    );

    // Setup citizen3 (to create proposals to vote on, not self-voting)
    await mockWIP.mockSetCitizenData(
      citizen3Signer.address,
      "CountryA",
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      true
    );

    // Create a proposal from yesterday by citizen3 to vote on
    const proposalText = "Test Proposal";
    await mockWIP.mockAddProposal(proposalText, citizen3Signer.address);

    // Mint tokens to citizens
    await mockWIP.mockMintTokens(citizen1Signer.address, ethers.parseEther("100000"));
    await mockWIP.mockMintTokens(citizen2Signer.address, ethers.parseEther("100000"));
  });

  it("should verify unauthorized claim attempts are properly handled", async function() {
    // Test that without approval, you can't claim on behalf of another

    // Generate a vote for the proposal (the proposal is from citizen3, not self)
    const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Test Proposal"));
    const votes = [{
      proposal: proposalHash,
      scoresGiven: 12 // Use max score
    }];
    await mockWIP.connect(citizen1Signer).approve(citizen2Signer.address, ethers.parseEther("0"));

    // Attempt to claim on behalf of another without approval (should revert)
    await expect(
      mockWIP.connect(citizen2Signer).claim("New proposal", votes, citizen1Signer.address)
    ).to.be.revertedWith("Not authorized");
  });

  it("should allow claiming when properly authorized", async function() {
    // Generate a vote for the proposal (the proposal is from citizen3, not self)
    const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("Test Proposal"));
    const votes = [{
      proposal: proposalHash,
      scoresGiven: 12 // Use max score
    }];

    // For proper authorization need to set allowances in both directions
    // First: onBehalfOf (citizen1) approves msg.sender (citizen2)
    await mockWIP.connect(citizen1Signer).approve(citizen2Signer.address, ethers.parseEther("100000"));

    // Second: msg.sender (citizen2) approves onBehalfOf (citizen1)
    await mockWIP.connect(citizen2Signer).approve(citizen1Signer.address, ethers.parseEther("100000"));

    // Now the claim should succeed
    await expect(
      mockWIP.connect(citizen2Signer).claim("New proposal", votes, citizen1Signer.address)
    ).to.not.be.reverted;
  });
});
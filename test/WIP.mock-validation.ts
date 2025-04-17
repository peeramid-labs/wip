import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockWIP - Basic Functionality", function () {
  let mockWIP: any;
  let citizen1Signer: any;

  async function deployMockWIPFixture() {
    // Deploy mock contracts
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    const mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    const mockDistribution = await MockDistributionFactory.deploy();

    // Deploy mock governance token
    const MockGovernanceTokenFactory = await ethers.getContractFactory("MockGovernanceToken");
    const mockGovernanceToken = await MockGovernanceTokenFactory.deploy();

    // Deploy WorldMultiSig
    const WorldMultiSigFactory = await ethers.getContractFactory("MockWorldMultiSig");
    const worldMultiSig = await WorldMultiSigFactory.deploy();

    // Deploy MockWIP
    const MockWIPFactory = await ethers.getContractFactory("MockWIP");
    const mockWIP = await MockWIPFactory.deploy();

    // Get signers
    const signers = await ethers.getSigners();
    citizen1Signer = signers[1];

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

    // Setup mock WorldMultiSig
    await worldMultiSig.mockSetWIP(await mockWIP.getAddress());

    return { mockWIP, mockVerifier, mockDistribution, worldMultiSig, mockGovernanceToken };
  }

  describe("Testing Citizen Data", function() {
    beforeEach(async function() {
      // Deploy fresh instances for each test
      const { mockWIP: _mockWIP } = await loadFixture(deployMockWIPFixture);
      mockWIP = _mockWIP;
    });

    it("should validate initial citizen state", async function() {
      const passportData = await mockWIP.passportHolders(citizen1Signer.address);
      console.log("Initial citizen state:");
      console.log(" - isQualified:", passportData.isQualified);
      console.log(" - citizenship:", passportData.citizenship);
      console.log(" - revalidateAt:", passportData.revalidateAt.toString());

      // Initially, citizen should not be qualified
      expect(passportData.isQualified).to.be.false;
    });

    it("should set citizen data using mockSetCitizenData", async function() {
      // Set citizen data
      const futureTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year in the future
      await mockWIP.mockSetCitizenData(
        citizen1Signer.address,
        "TestCountry",
        futureTimestamp,
        true
      );

      // Get citizen data after setting
      const passportData = await mockWIP.passportHolders(citizen1Signer.address);
      console.log("Citizen data after setting:");
      console.log(" - isQualified:", passportData.isQualified);
      console.log(" - citizenship:", passportData.citizenship);
      console.log(" - revalidateAt:", passportData.revalidateAt.toString());

      // Verify data was set correctly
      expect(passportData.isQualified).to.be.true;
      expect(passportData.citizenship).to.equal("TestCountry");
      expect(passportData.revalidateAt).to.equal(futureTimestamp);
    });

    it("should work around the passport setup by directly testing wallet change", async function() {
      // Set up citizen1 as a passport holder using the mock function
      const futureTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year in the future
      await mockWIP.mockSetCitizenData(
        citizen1Signer.address,
        "TestCountry",
        futureTimestamp,
        true
      );

      // Get signers
      const signers = await ethers.getSigners();
      const newWalletSigner = signers[3];

      // Check if the citizen was set up correctly
      const passportData = await mockWIP.passportHolders(citizen1Signer.address);
      console.log("Citizen data after mockSetCitizenData:");
      console.log(" - isQualified:", passportData.isQualified);
      console.log(" - citizenship:", passportData.citizenship);
      console.log(" - revalidateAt:", passportData.revalidateAt.toString());

      // Verify the citizen data is correct
      expect(passportData.isQualified).to.be.true;
      expect(passportData.citizenship).to.equal("TestCountry");

      // Now try changing the wallet
      await mockWIP.connect(citizen1Signer).changeWallet(newWalletSigner.address);

      // Check if the wallet was changed
      const oldWalletData = await mockWIP.passportHolders(citizen1Signer.address);
      const newWalletData = await mockWIP.passportHolders(newWalletSigner.address);

      console.log("Old wallet data after change:");
      console.log(" - isQualified:", oldWalletData.isQualified);

      console.log("New wallet data after change:");
      console.log(" - isQualified:", newWalletData.isQualified);

      // Verify the change was successful
      expect(oldWalletData.isQualified).to.be.false;
      expect(newWalletData.isQualified).to.be.true;
      expect(newWalletData.citizenship).to.equal("TestCountry");
    });
  });
});

describe("WIP - Wallet Change Fix", function () {
  let mockWIP: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let mockGovernanceToken: any;
  let worldMultiSig: any;
  let deployerSigner: any;
  let citizen1Signer: any;
  let citizen2Signer: any;
  let newWalletSigner: any;

  async function deployMockWIPFixture() {
    // Deploy mock contracts
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifierFactory.deploy();

    const MockDistributionFactory = await ethers.getContractFactory("MockDistribution");
    mockDistribution = await MockDistributionFactory.deploy();

    // Deploy mock governance token
    const MockGovernanceTokenFactory = await ethers.getContractFactory("MockGovernanceToken");
    mockGovernanceToken = await MockGovernanceTokenFactory.deploy();

    // Deploy WorldMultiSig
    const WorldMultiSigFactory = await ethers.getContractFactory("MockWorldMultiSig");
    worldMultiSig = await WorldMultiSigFactory.deploy();

    // Deploy MockWIP
    const MockWIPFactory = await ethers.getContractFactory("MockWIP");
    mockWIP = await MockWIPFactory.deploy();

    // Get signers
    const signers = await ethers.getSigners();
    deployerSigner = signers[0];
    citizen1Signer = signers[1];
    citizen2Signer = signers[2];
    newWalletSigner = signers[3];

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
      deployerSigner.address
    );

    // Setup mock WorldMultiSig
    await worldMultiSig.mockSetWIP(await mockWIP.getAddress());

    // Set up a DAO for TestCountry
    await mockWIP.mockSetupDAOForCountry(
      "TestCountry",
      await mockGovernanceToken.getAddress(),
      ethers.Wallet.createRandom().address,
      ethers.parseEther("1000")
    );

    return { mockWIP, mockVerifier, mockDistribution, worldMultiSig, mockGovernanceToken };
  }

  it("should properly handle wallet changes with the fixed MockWIP contract", async function() {
    // Deploy fresh instances for the test
    const { mockWIP, mockGovernanceToken } = await loadFixture(deployMockWIPFixture);

    // Set up citizen1 as a passport holder
    const futureTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year in the future
    await mockWIP.mockSetCitizenData(
      citizen1Signer.address,
      "TestCountry",
      futureTimestamp,
      true
    );

    // Verify passport holder data is set correctly
    const initialData = await mockWIP.passportHolders(citizen1Signer.address);
    expect(initialData.isQualified).to.be.true;
    expect(initialData.citizenship).to.equal("TestCountry");

    // Perform wallet change
    await mockWIP.connect(citizen1Signer).changeWallet(newWalletSigner.address);

    // Verify old wallet data is cleared
    const oldData = await mockWIP.passportHolders(citizen1Signer.address);
    expect(oldData.isQualified).to.be.false;
    expect(oldData.citizenship).to.equal("");

    // Verify new wallet has the passport data
    const newData = await mockWIP.passportHolders(newWalletSigner.address);
    expect(newData.isQualified).to.be.true;
    expect(newData.citizenship).to.equal("TestCountry");
    expect(newData.revalidateAt).to.equal(futureTimestamp);

    console.log("=== SUCCESS UPDATE ===");
    console.log("The MockWIP contract is now fixed and working correctly!");
    console.log("Wallet change functionality has been properly implemented with direct storage access.");
    console.log("======================");
  });
});
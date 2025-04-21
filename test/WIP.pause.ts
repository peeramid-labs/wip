import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("WIP - Pause/Unpause", function () {
  let wip: any;
  let mockVerifier: any;
  let mockDistribution: any;
  let worldMultiSig: any;
  let deployer: string;
  let initialOperator: string;
  let citizen1: string;
  let deployerSigner: any;
  let citizen1Signer: any;

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
    const [_deployerSigner, initialOperatorSigner, _citizen1Signer] = await ethers.getSigners();

    // Setup addresses
    deployer = _deployerSigner.address;
    initialOperator = initialOperatorSigner.address;
    citizen1 = _citizen1Signer.address;

    // Store signers
    deployerSigner = _deployerSigner;
    citizen1Signer = _citizen1Signer;

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
    await worldMultiSig.mockAddAuthorizedPauser(deployer);
    await worldMultiSig.mockEnablePausing();
    await worldMultiSig.mockAuthorizeForTests(deployer);

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

  it("should have the correct paused state initially", async function () {
    // Check initial state
    expect(await wip.paused()).to.be.false;
  });

  it("should reject pause attempts from non-authorized addresses", async function() {
    // Try to pause from a non-authorized account (citizen1)
    await expect(wip.connect(citizen1Signer).pause())
      .to.be.revertedWith("only worldMultiSig");
  });

  it("should reject unpause attempts from non-authorized addresses", async function() {
    // Try to unpause from a non-authorized account (citizen1)
    await expect(wip.connect(citizen1Signer).unpause())
      .to.be.revertedWith("only worldMultiSig");
  });

  it("should allow authorized address to pause and unpause", async function() {
    // First pause with authorized account via WorldMultiSig
    await worldMultiSig.connect(deployerSigner).pause();
    expect(await wip.paused()).to.be.true;

    // Then unpause
    await worldMultiSig.connect(deployerSigner).unpause();
    expect(await wip.paused()).to.be.false;
  });
});
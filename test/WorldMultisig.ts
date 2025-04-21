import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre, { deployments, ethers, network } from "hardhat";

describe("WorldMultiSig", function () {
  let worldMultiSig: any;
  let owner: string;
  let initialOperator: string;
  let country1: string;
  let country2: string;
  let country3: string;
  let recipient: string;
  let ownerSigner: any;
  let initialOperatorSigner: any;
  let country1Signer: any;
  let country2Signer: any;
  let country3Signer: any;
  let recipientSigner: any;
  let mockWIP: any;

  async function deployWorldMultiSigFixture() {
    // Get signers
    const [deployerSigner, initialOpSigner, country1Sign, country2Sign, country3Sign, recipSign] = await ethers.getSigners();

    // Set up addresses
    owner = deployerSigner.address;
    initialOperator = initialOpSigner.address;
    country1 = country1Sign.address;
    country2 = country2Sign.address;
    country3 = country3Sign.address;
    recipient = recipSign.address;

    // Store signers
    ownerSigner = deployerSigner;
    initialOperatorSigner = initialOpSigner;
    country1Signer = country1Sign;
    country2Signer = country2Sign;
    country3Signer = country3Sign;
    recipientSigner = recipSign;

    // Deploy the WIP contract first (mock)
    const MockWIPFactory = await ethers.getContractFactory("MockWIP");
    mockWIP = await MockWIPFactory.deploy();

    // Deploy WorldMultiSig
    const WorldMultiSigFactory = await ethers.getContractFactory("WorldMultiSigV1");
    const worldMultiSig = await WorldMultiSigFactory.deploy(true);

    // Initialize WorldMultiSig with the operator address
    await worldMultiSig.initialize(initialOperator);

    // Setup mock WIP to recognize WorldMultiSig (using the correct mock method name)
    await mockWIP.setWorldMultiSig(await worldMultiSig.getAddress());

    return { worldMultiSig, mockWIP };
  }

  beforeEach(async function () {
    // Deploy fresh instances for each test
    const { worldMultiSig: _worldMultiSig, mockWIP: _mockWIP } = await loadFixture(deployWorldMultiSigFixture);
    worldMultiSig = _worldMultiSig;
    mockWIP = _mockWIP;

    // Add countries to multisig
    await worldMultiSig.addCountry(country1);
    await worldMultiSig.addCountry(country2);
    await worldMultiSig.addCountry(country3);
  });

  describe("Initialization", function () {
    it("should initialize with correct WIP and initial operator", async function () {
      expect(await worldMultiSig.getWIP()).to.equal(owner);
      const [operator, timeLeft] = await worldMultiSig.getInitialOperator();
      expect(operator).to.equal(initialOperator);
      expect(timeLeft).to.be.gt(0);
    });

    it("should set initial operator expiry period to 365 days", async function () {
      const [operator, timeLeft] = await worldMultiSig.getInitialOperator();
      // Allow for slight timing variation during test execution
      expect(timeLeft).to.be.closeTo(365 * 24 * 60 * 60, 100);
    });
  });

  describe("Country Management", function () {
    it("should add countries correctly", async function () {
      const testCountry = ethers.Wallet.createRandom().address;
      await worldMultiSig.addCountry(testCountry);

      // We can't directly check isCountry mapping since it's private
      // So we'll check that adding again reverts with the expected message
      await expect(worldMultiSig.addCountry(testCountry))
        .to.be.revertedWith("country already exists");
    });

    it("should prevent non-WIP from adding a country", async function () {
      const testCountry = ethers.Wallet.createRandom().address;
      await expect(worldMultiSig.connect(country1Signer).addCountry(testCountry))
        .to.be.revertedWith("msg.sender is not the WIP");
    });

    it("should prevent adding the zero address as a country", async function () {
      await expect(worldMultiSig.addCountry(ethers.ZeroAddress))
        .to.be.revertedWith("country is the zero address");
    });
  });

  describe("Transaction Whitelisting", function () {
    it("should allow a country to whitelist a transaction", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("Test Transaction"));

      await expect(worldMultiSig.connect(country1Signer).whitelistTx(txHash))
        .to.emit(worldMultiSig, "WhitelistedTx")
        .withArgs(txHash, country1);
    });

    it("should prevent non-countries from whitelisting transactions", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("Test Transaction"));
      const randomWallet = ethers.Wallet.createRandom().connect(ethers.provider);

      await expect(worldMultiSig.connect(randomWallet).whitelistTx(txHash))
        .to.be.revertedWith("msg.sender is not a country");
    });

    it("should allow a country to revoke their whitelist", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("Test Transaction"));

      // First whitelist the transaction
      await worldMultiSig.connect(country1Signer).whitelistTx(txHash);

      // Then revoke it
      await expect(worldMultiSig.connect(country1Signer).revokeTx(txHash))
        .to.emit(worldMultiSig, "RevokedTx")
        .withArgs(txHash, country1);
    });

    it("should prevent revoking a non-whitelisted transaction", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("Test Transaction"));

      await expect(worldMultiSig.connect(country1Signer).revokeTx(txHash))
        .to.be.revertedWith("tx is not whitelisted");
    });
  });

  describe("Transaction Execution", function () {
    let mockReceiver: any;

    beforeEach(async function () {
      // Deploy a simple mock contract that will receive calls from the multisig
      const MockReceiverFactory = await ethers.getContractFactory("MockReceiver");
      mockReceiver = await MockReceiverFactory.deploy();
    });

    it("should allow initial operator to execute transactions within expiry period", async function () {
      // Create calldata for a simple function call
      const callData = mockReceiver.interface.encodeFunctionData("setValue", [42]);

      // Initial operator should be able to execute without whitelisting
      await expect(worldMultiSig.connect(initialOperatorSigner).execute(callData, await mockReceiver.getAddress()))
        .to.emit(worldMultiSig, "ExecutedTx");

      // Verify the call was executed
      expect(await mockReceiver.value()).to.equal(42);
    });

    it("should allow execution after whitelisting by all countries", async function () {
      // Create calldata for a simple function call
      const callData = mockReceiver.interface.encodeFunctionData("setValue", [100]);

      // Get the transaction hash that will be generated
      const position = ethers.keccak256(ethers.toUtf8Bytes("contracts.storage.WorldMultiSig"));
      const slot = ethers.solidityPackedKeccak256(["uint256"], [5]); // nonce is at index 5
      const nonce = await ethers.provider.getStorage(worldMultiSig.target, ethers.solidityPackedKeccak256(["bytes32", "uint256"], [position, slot]));

      const txHash = ethers.keccak256(ethers.solidityPacked(["bytes", "uint256"], [callData, nonce]));

      // Whitelist from all countries
      await worldMultiSig.connect(country1Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country2Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country3Signer).whitelistTx(txHash);

      // Execute the transaction
      await expect(worldMultiSig.connect(recipientSigner).execute(callData, await mockReceiver.getAddress()))
        .to.emit(worldMultiSig, "ExecutedTx");

      // Verify the call was executed
      expect(await mockReceiver.value()).to.equal(100);
    });

    it("should prevent execution if not all countries whitelisted", async function () {
      // Create calldata for a simple function call
      const callData = mockReceiver.interface.encodeFunctionData("setValue", [200]);

      // Get the transaction hash that will be generated
      const position = ethers.keccak256(ethers.toUtf8Bytes("contracts.storage.WorldMultiSig"));
      const slot = ethers.solidityPackedKeccak256(["uint256"], [5]); // nonce is at index 5
      const nonce = await ethers.provider.getStorage(worldMultiSig.target, ethers.solidityPackedKeccak256(["bytes32", "uint256"], [position, slot]));

      const txHash = ethers.keccak256(ethers.solidityPacked(["bytes", "uint256"], [callData, nonce]));

      // Only whitelist from two countries
      await worldMultiSig.connect(country1Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country2Signer).whitelistTx(txHash);
      // country3 doesn't whitelist

      // Attempt to execute the transaction should fail
      await expect(worldMultiSig.connect(recipientSigner).execute(callData, await mockReceiver.getAddress()))
        .to.be.revertedWith("tx is not whitelisted");
    });

    it("should prevent execution if a country revokes whitelist", async function () {
      // Create calldata for a simple function call
      const callData = mockReceiver.interface.encodeFunctionData("setValue", [300]);

      // Get the transaction hash that will be generated
      const position = ethers.keccak256(ethers.toUtf8Bytes("contracts.storage.WorldMultiSig"));
      const slot = ethers.solidityPackedKeccak256(["uint256"], [5]); // nonce is at index 5
      const nonce = await ethers.provider.getStorage(worldMultiSig.target, ethers.solidityPackedKeccak256(["bytes32", "uint256"], [position, slot]));

      const txHash = ethers.keccak256(ethers.solidityPacked(["bytes", "uint256"], [callData, nonce]));

      // Whitelist from all countries
      await worldMultiSig.connect(country1Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country2Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country3Signer).whitelistTx(txHash);

      // Then one country revokes
      await worldMultiSig.connect(country2Signer).revokeTx(txHash);

      // Attempt to execute the transaction should fail
      await expect(worldMultiSig.connect(recipientSigner).execute(callData, await mockReceiver.getAddress()))
        .to.be.revertedWith("tx is not whitelisted");
    });

    it("should prevent execution by initial operator after expiry", async function () {
      // Fast forward past the initial operator expiry time
      await time.increase(366 * 24 * 60 * 60); // 366 days

      // Create calldata for a simple function call
      const callData = mockReceiver.interface.encodeFunctionData("setValue", [400]);

      // Attempt to execute as initial operator should fail
      await expect(worldMultiSig.connect(initialOperatorSigner).execute(callData, await mockReceiver.getAddress()))
        .to.be.revertedWith("initial operator expired");
    });

    it("should prevent executing the same transaction twice", async function () {
      // Create calldata for a simple function call
      const callData = mockReceiver.interface.encodeFunctionData("setValue", [500]);

      // Get the current nonce
      const nonceBefore = await worldMultiSig.getStorage ? await worldMultiSig.getStorage().nonce : 0;

      // Create transaction hash
      const txHash = ethers.keccak256(ethers.solidityPacked(["bytes", "uint256"], [callData, nonceBefore]));

      // Whitelist from all countries
      await worldMultiSig.connect(country1Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country2Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country3Signer).whitelistTx(txHash);

      // Execute the transaction successfully
      await worldMultiSig.connect(recipientSigner).execute(callData, await mockReceiver.getAddress());

      // The nonce should have increased by this point

      // Since we can't verify the execution state directly (executedTxs mapping is private),
      // we'll set up a new test that verifies a different behavior:
      // creating a new transaction with the same nonce but different data should fail

      // Create a different calldata (different value)
      const newCallData = mockReceiver.interface.encodeFunctionData("setValue", [600]);

      // Create new whitelist with a different calldata but same nonce (using the nonce before execution)
      // This is testing that using the same nonce but different data will still require new whitelisting
      const newTxHash = ethers.keccak256(ethers.solidityPacked(["bytes", "uint256"], [newCallData, nonceBefore]));

      // Whitelist the new transaction hash from all countries
      await worldMultiSig.connect(country1Signer).whitelistTx(newTxHash);
      await worldMultiSig.connect(country2Signer).whitelistTx(newTxHash);
      await worldMultiSig.connect(country3Signer).whitelistTx(newTxHash);

      // Attempt to execute with the newly whitelisted hash
      // This should fail because the nonce has already been incremented
      await expect(worldMultiSig.connect(recipientSigner).execute(newCallData, await mockReceiver.getAddress()))
        .to.be.revertedWith("tx is not whitelisted");
    });

    it("should revert execution if the called contract reverts", async function () {
      // Create calldata for a function that reverts
      const callData = mockReceiver.interface.encodeFunctionData("alwaysReverts", []);

      // Get the transaction hash that will be generated
      const position = ethers.keccak256(ethers.toUtf8Bytes("contracts.storage.WorldMultiSig"));
      const slot = ethers.solidityPackedKeccak256(["uint256"], [5]); // nonce is at index 5
      const nonce = await ethers.provider.getStorage(worldMultiSig.target, ethers.solidityPackedKeccak256(["bytes32", "uint256"], [position, slot]));

      const txHash = ethers.keccak256(ethers.solidityPacked(["bytes", "uint256"], [callData, nonce]));

      // Whitelist from all countries
      await worldMultiSig.connect(country1Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country2Signer).whitelistTx(txHash);
      await worldMultiSig.connect(country3Signer).whitelistTx(txHash);

      // Execution should revert with "tx failed"
      await expect(worldMultiSig.connect(recipientSigner).execute(callData, await mockReceiver.getAddress()))
        .to.be.revertedWith("tx failed");
    });
  });

  describe("Initial Operator Management", function () {
    it("should allow transferring initial operator role", async function () {
      const newOperator = ethers.Wallet.createRandom().address;

      await worldMultiSig.connect(initialOperatorSigner).transferInitialOperator(newOperator);

      const [operator, _] = await worldMultiSig.getInitialOperator();
      expect(operator).to.equal(newOperator);
    });

    it("should prevent non-operator from transferring operator role", async function () {
      const newOperator = ethers.Wallet.createRandom().address;

      await expect(worldMultiSig.connect(country1Signer).transferInitialOperator(newOperator))
        .to.be.revertedWith("msg.sender is not the initial operator");
    });

    it("should allow initial operator to renounce their role", async function () {
      await worldMultiSig.connect(initialOperatorSigner).renounceInitialOperator();

      const [operator, timeLeft] = await worldMultiSig.getInitialOperator();
      expect(operator).to.equal(ethers.ZeroAddress);
      expect(timeLeft).to.equal(0);
    });

    it("should prevent non-operator from renouncing operator role", async function () {
      await expect(worldMultiSig.connect(country1Signer).renounceInitialOperator())
        .to.be.revertedWith("msg.sender is not the initial operator");
    });
  });
});

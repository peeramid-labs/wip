// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "hardhat/console.sol";
struct WorldStorage {
    address[] countries;
    mapping(address => bool) isCountry;
    address WIP;
    mapping(bytes32 => mapping(address => bool)) whitelistedTxs;
    mapping(bytes32 => bool) executedTxs;
    uint256 nonce;
    address initialOperator;
    uint256 initialOperatorExpiresAt;
}

/**
 * @title World MultiSig
 * @author Peeramid
 * @notice World MultiSig is a multi-signature contract that allows a group of countries to execute transactions.
 * @dev It allows InitialOperator to have authority over the contract for 365 days.
 */
contract WorldMultiSigV1 is Initializable {
    constructor(bool isTest) {
        if (!isTest) {
            _disableInitializers();
        }
    }

    function getStorage() internal pure returns (WorldStorage storage s) {
        bytes32 position = keccak256("contracts.storage.WorldMultiSig");
        assembly {
            s.slot := position
        }
    }

    event WhitelistedTx(bytes32 indexed txHash, address indexed country);
    event ExecutedTx(bytes32 indexed txHash, address indexed country, bytes returnData);
    event RevokedTx(bytes32 indexed txHash, address indexed country);

    function initialize(address initialOperator) public initializer {
        WorldStorage storage s = getStorage();
        s.WIP = msg.sender;
        s.initialOperator = initialOperator;
        s.initialOperatorExpiresAt = block.timestamp + 365 days;
    }

    function renounceInitialOperator() public {
        WorldStorage storage s = getStorage();
        require(msg.sender == s.initialOperator, "msg.sender is not the initial operator");
        s.initialOperator = address(0);
        s.initialOperatorExpiresAt = 0;
    }

    function transferInitialOperator(address newInitialOperator) public {
        WorldStorage storage s = getStorage();
        require(msg.sender == s.initialOperator, "msg.sender is not the initial operator");
        s.initialOperator = newInitialOperator;
    }

    function getInitialOperator() public view returns (address operator, uint256 timeLeft) {
        WorldStorage storage s = getStorage();
        return (
            s.initialOperator,
            s.initialOperatorExpiresAt > block.timestamp ? s.initialOperatorExpiresAt - block.timestamp : 0
        );
    }

    function addCountry(address country) public {
        WorldStorage storage s = getStorage();
        require(msg.sender == s.WIP, "msg.sender is not the WIP");
        require(!s.isCountry[country], "country already exists");
        require(country != address(0), "country is the zero address");
        s.isCountry[country] = true;
        s.countries.push(country);
    }

    function whitelistTx(bytes32 txHash) public {
        WorldStorage storage s = getStorage();
        require(s.isCountry[msg.sender], "msg.sender is not a country");
        s.whitelistedTxs[txHash][msg.sender] = true;
        emit WhitelistedTx(txHash, msg.sender);
    }

    function revokeTx(bytes32 txHash) public {
        WorldStorage storage s = getStorage();
        require(s.isCountry[msg.sender], "msg.sender is not a country");
        require(s.whitelistedTxs[txHash][msg.sender], "tx is not whitelisted");
        s.whitelistedTxs[txHash][msg.sender] = false;
        emit RevokedTx(txHash, msg.sender);
    }

    function execute(bytes calldata data, address destination) public {
        WorldStorage storage s = getStorage();
        bytes32 txHash = keccak256(abi.encodePacked(data, s.nonce));

        if (msg.sender == s.initialOperator) {
            require(block.timestamp < s.initialOperatorExpiresAt, "initial operator expired");
        } else {
            require(s.countries.length > 0, "no countries");
            for (uint256 i = 0; i < s.countries.length; i++) {
                if (s.isCountry[s.countries[i]]) {
                    require(s.whitelistedTxs[txHash][s.countries[i]], "tx is not whitelisted");
                }
            }
        }
        require(!s.executedTxs[txHash], "tx is already executed");
        console.log("executing tx", address(this));
        s.nonce++;
        (bool success, bytes memory returnData) = destination.call(data);
        emit ExecutedTx(txHash, destination, returnData);
        require(success, "tx failed");
    }

    function getWIP() public view returns (address) {
        WorldStorage storage s = getStorage();
        return s.WIP;
    }
}

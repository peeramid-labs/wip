// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title MockWorldMultiSig
 * @dev Mock implementation of the WorldMultiSig contract for testing
 */
contract MockWorldMultiSig is Initializable {
    address public wip;
    address public operator;
    mapping(address => bool) public authorizedPausers;
    bool public pausingEnabled;
    bool public isTestMode;

    constructor(bool isTest) {
        if (!isTest) {
            _disableInitializers();
        }
    }

    function mockSetWIP(address _wip) external {
        wip = _wip;
    }

    function mockAddAuthorizedPauser(address pauser) external {
        authorizedPausers[pauser] = true;
    }

    function mockEnablePausing() external {
        pausingEnabled = true;
    }

    function mockAuthorizeForTests(address account) external {
        isTestMode = true;
        operator = account;
    }

    function getWIP() external view returns (address) {
        return wip;
    }

    function initialize(address _operator) external initializer {
        require(operator == address(0), "Already initialized");
        operator = _operator;
        wip = msg.sender;
    }

    // For testing pause functionality
    function pause() external returns (bool) {
        require(msg.sender == operator || isTestMode, "Only operator can call");
        require(pausingEnabled, "Pausing not enabled");
        // Call pause on WIP contract
        (bool success, ) = wip.call(abi.encodeWithSignature("pause()"));
        return success;
    }

    function unpause() external returns (bool) {
        require(msg.sender == operator || isTestMode, "Only operator can call");
        // Call unpause on WIP contract
        (bool success, ) = wip.call(abi.encodeWithSignature("unpause()"));
        return success;
    }
}

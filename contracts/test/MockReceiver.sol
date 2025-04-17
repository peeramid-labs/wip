// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

/**
 * @title MockReceiver
 * @dev A simple contract used for testing WorldMultiSig transactions
 */
contract MockReceiver {
    uint256 public value;

    function setValue(uint256 _value) public {
        value = _value;
    }

    function alwaysReverts() public pure {
        revert("This function always reverts");
    }
}

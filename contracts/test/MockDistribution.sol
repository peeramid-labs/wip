// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title MockDistribution
 * @dev Mock implementation of the DAODistribution contract for testing
 */
contract MockDistribution {
    address[] public instances;
    bool public success;
    bytes public data;

    // Function to set the instances returned by instantiate
    function mockSetInstances(address[] memory _instances) external {
        instances = _instances;
    }

    // Mock instantiate function that returns the stored instances
    function instantiate(bytes memory _data) external returns (address[] memory, bool, bytes memory) {
        data = _data; // Store the data for verification in tests
        return (instances, true, bytes(""));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title MockGovernanceToken
 * @dev Mock implementation of the GovernanceToken contract for testing
 */
contract MockGovernanceToken {
    string private _name;
    string private _symbol;
    uint8 private _decimals;
    mapping(address => uint256) private _balances;
    uint256 private _totalSupply;

    constructor() {
        _name = "Mock Governance Token";
        _symbol = "MOCK";
        _decimals = 18;
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function symbol() external view returns (string memory) {
        return _symbol;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function mockSetDecimals(uint8 newDecimals) external {
        _decimals = newDecimals;
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function mint(address to, uint256 amount) external returns (bool) {
        _totalSupply += amount;
        _balances[to] += amount;
        return true;
    }

    function burn(address from, uint256 amount) external returns (bool) {
        require(_balances[from] >= amount, "Insufficient balance");
        _balances[from] -= amount;
        _totalSupply -= amount;
        return true;
    }
}

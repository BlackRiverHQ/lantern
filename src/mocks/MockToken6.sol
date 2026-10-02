// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";

/// @notice A six-decimal asset, the shape of USDC and USDG. Exists so the mechanism is tested
///         against the decimals real stablecoins actually use.
contract MockToken6 is IERC20 {
    string public name = "Six Decimal Asset";
    string public symbol = "SIX";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error InsufficientBalance();
    error InsufficientAllowance();

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; totalSupply += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

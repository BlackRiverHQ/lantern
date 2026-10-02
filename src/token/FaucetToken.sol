// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";

/// @title FaucetToken
/// @notice The settlement asset for a testnet deployment: real balances, real allowances, real
///         transfers - and issuance that is a faucet rather than a mint.
///
///         What this replaces had `mint(address,uint256)` open to anyone, which is worse than it
///         looks: an asset anyone can conjure means anyone can conjure a bond, so the collateral
///         behind a feed would be worth nothing. Here the only way to obtain it is one capped claim
///         per address per cooldown, which is a supply that cannot be summoned at will.
///
///         On mainnet this asset is a stablecoin and no faucet exists. The market takes its asset as
///         a constructor argument, so pointing it at one is a deployment argument, not a code change.
contract FaucetToken is IERC20 {
    string public name = "Held Unit";
    string public symbol = "HOLD";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice What one claim delivers, fixed at deploy.
    uint256 public immutable claimAmount;
    /// @notice How long a caller waits between claims.
    uint64 public immutable cooldown;
    mapping(address => uint64) public claimedAt;

    error InsufficientBalance();
    error InsufficientAllowance();
    error ClaimTooSoon(address caller, uint64 availableAt);
    error ZeroAmount();

    event Claimed(address indexed caller, uint256 amount);
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(uint256 claimAmount_, uint64 cooldown_) {
        if (claimAmount_ == 0) revert ZeroAmount();
        if (cooldown_ < 1 minutes) revert ClaimTooSoon(address(0), 1 minutes);
        claimAmount = claimAmount_;
        cooldown = cooldown_;
    }

    /// @notice Take one claim. The only issuance there is.
    function claim() external {
        uint64 availableAt = claimedAt[msg.sender] == 0 ? 0 : claimedAt[msg.sender] + cooldown;
        if (block.timestamp < availableAt) revert ClaimTooSoon(msg.sender, availableAt);
        claimedAt[msg.sender] = uint64(block.timestamp);
        balanceOf[msg.sender] += claimAmount;
        totalSupply += claimAmount;
        emit Claimed(msg.sender, claimAmount);
        emit Transfer(address(0), msg.sender, claimAmount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
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
            emit Approval(from, msg.sender, allowed - amount);
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Bounty configuration.
/// @notice Paid out of the at-fault party's money, never from a fee charged to markets.
interface IBounty {
    function bountyBps() external view returns (uint16);
    function borrowerFirstBps() external view returns (uint16);
    function stakeFloor(uint256 bonus) external view returns (uint256);
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title What a market needs to know about a liquidation's aftermath.
interface IWindfallMarket {
    function bonusSettled(uint256 liquidationId) external view returns (bool);
    function bonusOutcome(uint256 liquidationId) external view returns (uint8);
    function priceable(bytes32 feedId) external view returns (bool);
}

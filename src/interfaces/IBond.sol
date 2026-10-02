// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Provider bond.
/// @notice Bonds are sized to the exposure a feed has actually underwritten, not to a flat
///         number chosen at listing time.
interface IBond {
    function bondOf(bytes32 feedId) external view returns (uint256);
    function exposureOf(bytes32 feedId) external view returns (uint256);
    function exposureFloor(bytes32 feedId) external view returns (uint256);
    function isPriceable(bytes32 feedId) external view returns (bool);
    function deposit(bytes32 feedId, uint256 amount) external;
    function withdraw(bytes32 feedId, uint256 amount) external;
    function charge(bytes32 feedId, uint256 amount) external returns (uint256 paid, uint256 shortfall);
    function addExposure(bytes32 feedId, uint256 amount) external;
    function removeExposure(bytes32 feedId, uint256 amount) external;
}

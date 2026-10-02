// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title A price feed Lantern can consume.
/// @notice Deliberately minimal: a feed identifies itself, scales its values and names its
///         current signer set. Lantern never calls out for a price; reports are pushed in.
interface IFeed {
    function feedId() external view returns (bytes32);
    function decimals() external view returns (uint8);
    function signerSet() external view returns (bytes32);
}

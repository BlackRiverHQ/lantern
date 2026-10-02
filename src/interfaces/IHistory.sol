// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Self-history for a feed.
/// @notice The band comes from the feed's own realized moves, never from an external reference.
interface IHistory {
    struct Snapshot {
        uint256 anchor;    // last accepted value
        uint64  round;     // last accepted round
        uint64  updatedAt; // last accepted timestamp
        uint32  moveBps;   // realized move, bps, exponentially weighted
        uint32  samples;   // accepted reports observed
    }

    function snapshot(bytes32 feedId) external view returns (Snapshot memory);
}

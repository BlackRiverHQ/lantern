// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Packing
/// @notice Three fields in one word: round, timestamp, and the realized move observed at that
///         round. Keeps a feed's history cheap to store and cheap to read back.
library Packing {
    uint256 internal constant ROUND_MASK = 0xFFFFFFFFFFFFFFFF;
    uint256 internal constant TS_MASK = 0xFFFFFFFFFFFFFFFF;
    uint256 internal constant MOVE_MASK = 0xFFFFFFFF;

    function pack(uint64 round, uint64 timestamp, uint32 moveBps) internal pure returns (uint256) {
        return (uint256(round) << 96) | (uint256(timestamp) << 32) | uint256(moveBps);
    }

    function unpack(uint256 word) internal pure returns (uint64 round, uint64 timestamp, uint32 moveBps) {
        round = uint64((word >> 96) & ROUND_MASK);
        timestamp = uint64((word >> 32) & TS_MASK);
        moveBps = uint32(word & MOVE_MASK);
    }

    function roundOf(uint256 word) internal pure returns (uint64) {
        return uint64((word >> 96) & ROUND_MASK);
    }

    function timestampOf(uint256 word) internal pure returns (uint64) {
        return uint64((word >> 32) & TS_MASK);
    }
}

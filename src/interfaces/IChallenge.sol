// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Challenges against a held bonus.
interface IChallenge {
    enum Rule {
        SLOT_UNIQUENESS,   // two different values for one feed in one block
        ROUND_ORDERING,    // stale or non-monotone round
        SELF_HISTORY,      // value outside the feed's own realized band
        PAYLOAD_PROVENANCE, // payload hash reused across assets or rounds
        CROSS_SOURCE       // a declared independent source disagrees beyond tolerance
    }

    struct Record {
        uint256 liquidationId;
        address prover;
        uint256 stake;
        Rule    rule;
        bytes   evidence;
        bool    resolved;
        bool    upheld;
        uint64  openedAt;
    }

    function challengeOf(uint256 liquidationId) external view returns (Record memory);
}

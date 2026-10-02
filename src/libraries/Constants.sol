// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Constants
/// @notice Every number a reviewer might want to argue with, in one place, set at deploy.
library Constants {
    uint256 internal constant BPS = 10_000;

    // Band
    uint32 internal constant MOVE_MULTIPLIER = 6;      // width = 6x realized move
    uint16 internal constant MIN_WIDTH_BPS = 50;      // 0.50% floor
    uint16 internal constant MAX_WIDTH_BPS = 5_000;   // 50% ceiling
    uint32 internal constant PRIOR_SAMPLES = 32;      // cold-start widening
    uint32 internal constant MOVE_EWMA_SHIFT = 3;     // 1/8 weight on the newest move

    // Drift
    uint16 internal constant MAX_REPORT_DRIFT_BPS = 2_000;      // 20% per report
    uint16 internal constant MAX_CUMULATIVE_DRIFT_BPS = 5_000;  // 50% across driftCapWindow
    uint64 internal constant DRIFT_WINDOW = 1 hours;

    // Windowing
    uint64 internal constant MIN_HOLD_WINDOW = 30 seconds;
    uint64 internal constant MAX_HOLD_WINDOW = 1 hours;
    uint64 internal constant STALENESS_BOUND = 5 minutes;

    // Money
    uint16 internal constant BOUNTY_BPS = 2_000;          // 20% of the at-fault pool to the prover
    uint16 internal constant MIN_STAKE_BPS = 100;         // 1% of the held bonus
    /// @dev Reference values for an 18-decimal asset. A deployment with a different asset derives
    ///      its own floors from the token's own decimals; see Lantern.minBond and Lantern.minStake.
    uint256 internal constant MIN_STAKE_ABSOLUTE_18 = 1e15;   // 0.001 unit at 18 decimals

        // Bonds
        uint256 internal constant MIN_BOND = 1e17;         // 0.1 unit to list a feed
        uint16 internal constant COVERAGE_BPS = 10_000;    // bond >= exposure, 1:1
        uint16 internal constant ERROR_BOND_PENALTY_BPS = 2_000; // each caught print raises the floor 20%
        uint256 internal constant MAX_ERROR_STEPS = 10;          // so the requirement stops at 3x

        // Reconciliation across independent sources
        uint16 internal constant CROSS_SOURCE_TOLERANCE_BPS = 500; // two sources may differ by 5%

        // Liveness
        uint64 internal constant CHALLENGE_GRACE = 6 hours; // after this, an unresolved challenge is void
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Errors shared across Lantern.
/// @notice Every failure is loud and named; nothing degrades silently.
interface ILanternErrors {
    error NotMarket(address caller);
    error UnknownFeed(bytes32 feedId);
    error FeedAlreadyRegistered(bytes32 feedId);
    error UnderBonded(bytes32 feedId, uint256 bond, uint256 required);
    error ReportTooOld(bytes32 feedId, uint64 timestamp, uint64 limit);
    error RoundNotMonotone(bytes32 feedId, uint64 round, uint64 previous);
    error SlotConflict(bytes32 feedId, uint64 round);
    error PayloadReused(bytes32 payloadHash);
    error ValueOutsideBand(bytes32 feedId, uint256 value, uint256 lo, uint256 hi);
    error DriftExceeded(uint256 previous, uint256 next, uint256 maxDriftBps);
    error UnknownLiquidation(uint256 liquidationId);
    error LiquidationAlreadySettled(uint256 liquidationId);
    error WindowClosed(uint256 liquidationId, uint256 deadline);
    error WindowOpen(uint256 liquidationId, uint256 deadline);
    error ChallengeAlreadyOpen(uint256 liquidationId);
    error UnknownChallenge(uint256 challengeId);
    error ChallengeAlreadyResolved(uint256 challengeId);
    error StakeBelowMinimum(uint256 provided, uint256 required);
    error EmptyEvidence();
    error BadRuleKind(uint8 kind);
    error NothingToPay(uint256 liquidationId);
    error ZeroAmount();
    error ZeroAddress();
    error ImmutableParameter();
    error BadDecimals(uint256 decimals);
    error DecimalsMismatch(uint8 declared, uint8 asset);

}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

/// @title ChainlinkSource
/// @notice Turns a live aggregator into a report Lantern can consume, scaled to the asset's own
///         decimals. This is one of the two sources a feed can reconcile against: the aggregator
///         publishes on Arbitrum, the feed publishes through Lantern, and the fifth rule compares
///         them for the same round.
/// @dev Nothing here is trusted more than any other source. A disagreement is evidence about
///      both parties, which is exactly why the comparison is useful.
contract ChainlinkSource {
    error NoAnswer(int256 answer);
    error Stale(int256 answer, uint256 updatedAt);

    IAggregatorV3 public immutable aggregator;
    uint8 public immutable aggregatorDecimals;
    uint8 public immutable targetDecimals;

    constructor(address aggregator_, uint8 targetDecimals_) {
        aggregator = IAggregatorV3(aggregator_);
        aggregatorDecimals = IAggregatorV3(aggregator_).decimals();
        targetDecimals = targetDecimals_;
    }

    function description() external view returns (string memory) { return aggregator.description(); }

    /// @return value the answer scaled to `targetDecimals`
    /// @return round the aggregator's own round id, truncated to 64 bits
    /// @return updatedAt when the aggregator says the answer was published
    function latest() external view returns (uint256 value, uint64 round, uint64 updatedAt) {
    (uint80 roundId, int256 answer, , uint256 updated, ) = aggregator.latestRoundData();
    if (answer <= 0) revert NoAnswer(answer);
    return (_scale(uint256(answer)), _round(roundId), uint64(updated));
    }

    /// @notice The same read, refusing an answer older than `maxAge`. A stale aggregator is an
    ///         absence of evidence, not evidence.
    function latestFresh(uint256 maxAge) external view returns (uint256 value, uint64 round, uint64 updatedAt) {
    (uint80 roundId, int256 answer, , uint256 updated, ) = aggregator.latestRoundData();
    if (answer <= 0) revert NoAnswer(answer);
    if (maxAge != 0 && block.timestamp > updated + maxAge) revert Stale(answer, updated);
    return (_scale(uint256(answer)), _round(roundId), uint64(updated));
    }

    /// @dev Chainlink encodes its phase into a very large round id. One that does not fit in 64
    ///      bits is reported as zero rather than silently truncated into a different number.
    function _round(uint80 roundId) internal pure returns (uint64) {
    return roundId <= type(uint64).max ? uint64(roundId) : 0;
    }

    function _scale(uint256 raw) internal view returns (uint256) {
        if (aggregatorDecimals == targetDecimals) return raw;
        if (aggregatorDecimals < targetDecimals) return raw * (10 ** (targetDecimals - aggregatorDecimals));
        return raw / (10 ** (aggregatorDecimals - targetDecimals));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The shape of a Chainlink aggregator, declared here rather than imported so the
///         project carries no dependency it does not use.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

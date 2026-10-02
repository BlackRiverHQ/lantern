// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

/// @notice A deterministic aggregator, so the integration logic is tested without a network.
contract MockAggregator is IAggregatorV3 {
    uint8 private immutable _decimals;
    string private _description;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId;

    constructor(uint8 decimals_, string memory description_) {
        _decimals = decimals_;
        _description = description_;
    }

    function decimals() external view returns (uint8) { return _decimals; }
    function description() external view returns (string memory) { return _description; }
    function setAnswer(int256 a) external { answer = a; }
    function setUpdatedAt(uint256 t) external { updatedAt = t; }
    function setRound(uint80 r) external { roundId = r; }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}

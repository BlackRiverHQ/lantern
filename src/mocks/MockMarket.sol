// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";
import {IWindfall} from "../interfaces/IWindfall.sol";

/// @title MockMarket
/// @notice Stands in for a lending market: funds a bonus and reports a liquidation.
contract MockMarket {
    IERC20 public immutable asset;
    IWindfall public immutable lantern;
    uint256 public liquidationsSeen;

    error NotLantern();

    constructor(IERC20 asset_, IWindfall lantern_) {
        asset = asset_;
        lantern = lantern_;
    }

    modifier onlyLantern() {
        if (msg.sender != address(lantern)) revert NotLantern();
        _;
    }

    /// @notice Approve Lantern to pull a bonus, then report the liquidation.
    function liquidate(
        uint256 liquidationId,
        bytes32 feedId,
        uint64  round,
        uint256 bonus,
        address borrower
    ) external {
        asset.approve(address(lantern), bonus);
        lantern.recordLiquidation(liquidationId, feedId, round, bonus, msg.sender, borrower);
        liquidationsSeen += 1;
    }
}

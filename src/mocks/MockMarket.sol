// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";
import {IWindfall} from "../interfaces/IWindfall.sol";

/// @title MockMarket
/// @notice Stands in for a lending market: funds a bonus and reports a liquidation.
/// @dev A real market knows the notional it is putting at risk and declares it. This one guesses it,
///      as ten times the bonus — a convenience of the emulator and nothing more. The requirement
///      itself lives inside Lantern, and `liquidateWithNotional` exercises it exactly as written.
contract MockMarket {
    IERC20 public immutable asset;
    IWindfall public immutable lantern;
    uint256 public liquidationsSeen;

    uint256 internal constant DEFAULT_NOTIONAL_MULTIPLE = 10;

    error NotLantern();

    constructor(IERC20 asset_, IWindfall lantern_) {
        asset = asset_;
        lantern = lantern_;
    }

    modifier onlyLantern() {
        if (msg.sender != address(lantern)) revert NotLantern();
        _;
    }

    function liquidate(
        uint256 liquidationId,
        bytes32 feedId,
        uint64  round,
        uint256 bonus,
        address borrower
    ) external {
        _report(liquidationId, feedId, round, bonus, bonus * DEFAULT_NOTIONAL_MULTIPLE, borrower);
    }

    function liquidateWithNotional(
        uint256 liquidationId,
        bytes32 feedId,
        uint64  round,
        uint256 bonus,
        uint256 notional,
        address borrower
    ) external {
        _report(liquidationId, feedId, round, bonus, notional, borrower);
    }

    function _report(
        uint256 liquidationId,
        bytes32 feedId,
        uint64  round,
        uint256 bonus,
        uint256 notional,
        address borrower
    ) internal {
        asset.approve(address(lantern), bonus);
        lantern.recordLiquidation(liquidationId, feedId, round, bonus, notional, msg.sender, borrower);
        liquidationsSeen += 1;
    }
}

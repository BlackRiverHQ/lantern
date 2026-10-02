// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IChallenge} from "./IChallenge.sol";
import {IWindfallMarket} from "./IWindfallMarket.sol";

/// @title Lantern facade.
/// @notice A market reports the bonus it paid; Lantern holds it, adjudicates claims against the
///         report that priced the liquidation, and settles once.
interface IWindfall is IWindfallMarket {
    function recordLiquidation(
        uint256 liquidationId,
        bytes32 feedId,
        uint64  round,
        uint256 bonus,
        address liquidator,
        address borrower
    ) external;

    function openChallenge(uint256 liquidationId, IChallenge.Rule rule, bytes calldata evidence)
        external payable returns (uint256 challengeId);

    function adjudicate(uint256 liquidationId) external returns (bool upheld);
    function release(uint256 liquidationId) external;
    function market() external view returns (address);
}

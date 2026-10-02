// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Constants} from "./Constants.sol";
import {FixedPoint} from "./FixedPoint.sol";

/// @title WaterfallMath
/// @notice Splits what is actually available. Order: borrower restoration, prover bounty, bond
///         charge, then a remainder that goes to the queue rather than being discarded.
library WaterfallMath {
    struct Split {
        uint256 toBorrower;
        uint256 toProver;
        uint256 toBond;
        uint256 remainder;
    }

    function split(uint256 available, uint256 borrowerClaim, uint16 bountyBps)
        internal pure returns (Split memory s)
    {
        s.toBorrower = FixedPoint.min(available, borrowerClaim);
        uint256 rest = available - s.toBorrower;

        uint256 bounty = FixedPoint.bpsOf(rest, bountyBps);
        s.toProver = rest >= bounty ? bounty : rest;
        rest -= s.toProver;
        s.toBond = rest;
    }

    /// @notice The shortfall when the pot cannot cover the borrower's claim.
    function shortfall(uint256 available, uint256 borrowerClaim) internal pure returns (uint256) {
        return borrowerClaim > available ? borrowerClaim - available : 0;
    }

    /// @notice Minimum stake a prover must post for a given held bonus.
    /// @param minStakeAbsolute the smallest stake this deployment accepts, in the asset's own units.
    function stakeFloor(uint256 bonus, uint256 minStakeAbsolute) internal pure returns (uint256) {
    uint256 proportional = FixedPoint.bpsOf(bonus, Constants.MIN_STAKE_BPS);
    return FixedPoint.max(proportional, minStakeAbsolute);
    }
}

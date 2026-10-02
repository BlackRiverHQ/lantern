// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Constants} from "./Constants.sol";
import {FixedPoint} from "./FixedPoint.sol";

/// @title BondMath
/// @notice A feed's required bond is a function of what it has already underwritten.
library BondMath {
    /// @notice A feed that has been caught pays for the next one in collateral, not in apologies.
    function penalisedFloor(uint256 floor, uint256 errors, uint16 penaltyBps) internal pure returns (uint256) {
    uint256 steps = errors > Constants.MAX_ERROR_STEPS ? Constants.MAX_ERROR_STEPS : errors;
    return floor * (Constants.BPS + steps * penaltyBps) / Constants.BPS;
    }

    /// @param minBond the smallest bond this deployment accepts, in the asset's own units, so a
    ///        6-decimal asset is not asked for a 18-decimal minimum.
    function exposureFloor(uint256 exposure, uint256 minBond) internal pure returns (uint256) {
    return FixedPoint.max(minBond, FixedPoint.bpsOf(exposure, Constants.COVERAGE_BPS));
    }

    function isPriceable(uint256 bond, uint256 exposure, uint256 minBond) internal pure returns (bool) {
        return bond >= exposureFloor(exposure, minBond);
    }

    function chargeable(uint256 bond, uint256 amount) internal pure returns (uint256 paid, uint256 shortfall) {
        paid = bond < amount ? bond : amount;
        shortfall = amount - paid;
    }

    function withdrawable(uint256 bond, uint256 exposure, uint256 requested, uint256 minBond)
        internal pure returns (uint256 allowed)
    {
        uint256 floor = exposureFloor(exposure, minBond);
        if (bond <= floor) return 0;
        uint256 spare = bond - floor;
        allowed = requested < spare ? requested : spare;
    }
}

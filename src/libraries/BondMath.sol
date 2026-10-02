// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Constants} from "./Constants.sol";
import {FixedPoint} from "./FixedPoint.sol";

/// @title BondMath
/// @notice A feed's required bond is a function of what it has already underwritten.
library BondMath {
    function exposureFloor(uint256 exposure) internal pure returns (uint256) {
        return FixedPoint.max(Constants.MIN_BOND, FixedPoint.bpsOf(exposure, Constants.COVERAGE_BPS));
    }

    function isPriceable(uint256 bond, uint256 exposure) internal pure returns (bool) {
        return bond >= exposureFloor(exposure);
    }

    function chargeable(uint256 bond, uint256 amount) internal pure returns (uint256 paid, uint256 shortfall) {
        paid = bond < amount ? bond : amount;
        shortfall = amount - paid;
    }

    function withdrawable(uint256 bond, uint256 exposure, uint256 requested)
        internal pure returns (uint256 allowed)
    {
        uint256 floor = exposureFloor(exposure);
        if (bond <= floor) return 0;
        uint256 spare = bond - floor;
        allowed = requested < spare ? requested : spare;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Constants} from "./Constants.sol";

/// @title TimeLib
/// @notice Window arithmetic with the bounds enforced, so a deployment cannot open a window
///         long enough to make liquidator participation unworkable.
library TimeLib {
    function validateWindow(uint64 window) internal pure returns (uint64) {
        require(window >= Constants.MIN_HOLD_WINDOW && window <= Constants.MAX_HOLD_WINDOW, "WINDOW");
        return window;
    }

    function deadline(uint256 nowTs, uint64 window) internal pure returns (uint64) {
        return uint64(nowTs) + window;
    }

    function isOpen(uint256 nowTs, uint64 openAt) internal pure returns (bool) {
        return nowTs < openAt;
    }

    function isClosed(uint256 nowTs, uint64 openAt) internal pure returns (bool) {
        return nowTs >= openAt;
    }

    function expired(uint256 nowTs, uint64 at_) internal pure returns (bool) {
        return nowTs > at_;
    }
}

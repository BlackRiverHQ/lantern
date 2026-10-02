// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Constants} from "./Constants.sol";
import {FixedPoint} from "./FixedPoint.sol";

/// @title Band
/// @notice The acceptable range for a new report, derived only from the feed's own realized
///         moves. Cold feeds are wide; warm feeds tighten. The band can never be set by hand.
library Band {
    struct State {
        uint256 anchor;
        uint32  moveBps;   // exponentially weighted realized move
        uint32  samples;
    }

    /// @notice Blend a new realized move into the running estimate.
    function observeMove(State memory s, uint256 value) internal pure returns (uint32 moveBps) {
        if (s.anchor == 0) return Constants.MIN_WIDTH_BPS;
        uint256 observed = FixedPoint.absDiffBps(value, s.anchor);
        uint256 cap = Constants.MAX_WIDTH_BPS;
        if (observed > cap) observed = cap;
        uint256 blended = (uint256(s.moveBps) * ((1 << Constants.MOVE_EWMA_SHIFT) - 1) + observed)
            >> Constants.MOVE_EWMA_SHIFT;
        return uint32(blended);
    }

    /// @notice Width in bps for the given history state. Cold start widens by sample deficit.
    function widthBps(State memory s) internal pure returns (uint32) {
        uint256 base = uint256(s.moveBps) * Constants.MOVE_MULTIPLIER;
        if (base < Constants.MIN_WIDTH_BPS) base = Constants.MIN_WIDTH_BPS;
        if (base > Constants.MAX_WIDTH_BPS) base = Constants.MAX_WIDTH_BPS;

        if (s.samples < Constants.PRIOR_SAMPLES) {
        // Thin history means wide band: interpolate toward the ceiling, so a feed with no
        // samples accepts almost anything and a warm feed tightens onto its own realized moves.
        uint256 deficit = Constants.PRIOR_SAMPLES - s.samples;
        uint256 headroom = Constants.MAX_WIDTH_BPS - base;
        base += (headroom * deficit) / Constants.PRIOR_SAMPLES;
        }
        return uint32(base);
    }

    function range(State memory s) internal pure returns (uint256 lo, uint256 hi) {
        uint256 w = widthBps(s);
        uint256 delta = FixedPoint.bpsOf(s.anchor, w);
        lo = s.anchor > delta ? s.anchor - delta : 0;
        hi = s.anchor + delta;
    }

    function accepts(State memory s, uint256 value) internal pure returns (bool) {
        (uint256 lo, uint256 hi) = range(s);
        return value >= lo && value <= hi;
    }

    /// @notice Per-report drift guard, independent of the band, so a single print cannot jump.
    function withinReportDrift(uint256 previous, uint256 next) internal pure returns (bool) {
        return FixedPoint.absDiffBps(next, previous) <= Constants.MAX_REPORT_DRIFT_BPS;
    }
}

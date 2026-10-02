// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Band} from "../../src/libraries/Band.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {FixedPoint} from "../../src/libraries/FixedPoint.sol";

contract BandFuzzTest is Test {
    function _state(uint256 anchor, uint32 moveBps, uint32 samples) internal pure returns (Band.State memory) {
        return Band.State({anchor: anchor, moveBps: moveBps, samples: samples});
    }

    function testFuzz_width_is_always_bounded(uint32 moveBps, uint32 samples) public pure {
        assertLe(Band.widthBps(_state(1e18, moveBps, samples)), Constants.MAX_WIDTH_BPS);
    }

    function testFuzz_width_has_a_floor(uint32 moveBps, uint32 samples) public pure {
        assertGe(Band.widthBps(_state(1e18, moveBps, samples)), Constants.MIN_WIDTH_BPS);
    }

    function testFuzz_zero_move_gives_the_floor(uint32 samples) public pure {
        vm.assume(samples >= Constants.PRIOR_SAMPLES);
        assertEq(Band.widthBps(_state(1e18, 0, samples)), Constants.MIN_WIDTH_BPS);
    }

    function testFuzz_more_samples_is_never_wider(uint32 moveBps, uint32 a, uint32 b) public pure {
        vm.assume(a <= b);
        assertGe(Band.widthBps(_state(1e18, moveBps, a)), Band.widthBps(_state(1e18, moveBps, b)));
    }

    function testFuzz_anchor_is_always_accepted(uint32 moveBps, uint32 samples, uint96 anchor) public pure {
        vm.assume(anchor > 0);
        assertTrue(Band.accepts(_state(anchor, moveBps, samples), anchor));
    }

    function testFuzz_range_contains_the_anchor(uint32 moveBps, uint32 samples) public pure {
        (uint256 lo, uint256 hi) = Band.range(_state(1_000e18, moveBps, samples));
        assertLe(lo, 1_000e18);
        assertGe(hi, 1_000e18);
    }

    function testFuzz_range_is_symmetric_above_the_floor(uint32 moveBps, uint32 samples, uint96 anchor) public pure {
        vm.assume(anchor > 1e18);
        (uint256 lo, uint256 hi) = Band.range(_state(anchor, moveBps, samples));
        assertEq(uint256(anchor) - lo, hi - uint256(anchor));
    }

    function testFuzz_accepts_is_the_range(uint32 moveBps, uint32 samples, uint96 value) public pure {
        Band.State memory s = _state(1_000e18, moveBps, samples);
        (uint256 lo, uint256 hi) = Band.range(s);
        assertEq(Band.accepts(s, value), value >= lo && value <= hi);
    }

    /// @dev An outlier contributes at most the band it contradicted, so the blended estimate
    ///      can rise by at most one blend step: 13/8 of the previous width. The ceiling still binds.
    function testFuzz_outlier_widening_is_bounded(uint32 moveBps, uint256 value) public pure {
    vm.assume(value > 0);
    Band.State memory s = _state(1_000e18, uint32(bound(moveBps, 0, Constants.MAX_WIDTH_BPS)), 64);
    uint32 before = Band.widthBps(s);
    uint32 widened = Band.widthBps(_state(1_000e18, Band.observeMove(s, value), 64));

    assertLe(widened, Constants.MAX_WIDTH_BPS);
    if (widened > before) assertLe(uint256(widened) * 8, uint256(before) * 13 + 8);
    }

    /// @dev Drift is a fraction of the previous value, so it is deliberately not symmetric.
    function testFuzz_report_drift_is_a_fraction_of_the_previous(uint96 previous, uint96 next) public pure {
    vm.assume(previous > 0);
    assertEq(Band.withinReportDrift(previous, next), FixedPoint.absDiffBps(next, previous) <= Constants.MAX_REPORT_DRIFT_BPS);
    }

    function testFuzz_report_drift_bounds_the_move(uint96 previous, uint96 next) public pure {
    vm.assume(previous > 1e18 && next > 0);
    if (Band.withinReportDrift(previous, next)) {
    assertLe(uint256(next) * 100, uint256(previous) * 120);
    assertGe(uint256(next) * 100, uint256(previous) * 80);
    }
    }

    function testFuzz_report_drift_accepts_an_unchanged_value(uint96 previous) public pure {
    vm.assume(previous > 0);
    assertTrue(Band.withinReportDrift(previous, previous));
    }

    function testFuzz_report_drift_rejects_large_jumps(uint96 base) public pure {
        vm.assume(base > 1e18);
        assertFalse(Band.withinReportDrift(base, uint256(base) * 2));
    }
}

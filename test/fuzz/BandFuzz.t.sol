// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Band} from "../../src/libraries/Band.sol";
import {Constants} from "../../src/libraries/Constants.sol";

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

    function testFuzz_observe_never_widens_past_the_current_band(uint32 moveBps, uint256 value) public pure {
        vm.assume(value > 0);
        Band.State memory s = _state(1_000e18, uint32(bound(moveBps, 0, Constants.MAX_WIDTH_BPS)), 64);
        uint32 next = Band.observeMove(s, value);
        assertLe(Band.widthBps(_state(1_000e18, next, 64)), Band.widthBps(s));
    }

    function testFuzz_report_drift_is_symmetric(uint96 a, uint96 b) public pure {
        vm.assume(a > 0 && b > 0);
        assertEq(Band.withinReportDrift(a, b), Band.withinReportDrift(b, a));
    }

    function testFuzz_report_drift_rejects_large_jumps(uint96 base) public pure {
        vm.assume(base > 1e18);
        assertFalse(Band.withinReportDrift(base, uint256(base) * 2));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Band} from "../../src/libraries/Band.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract BandTest is Test {
    function _cold(uint256 anchor) internal pure returns (Band.State memory) {
        return Band.State({anchor: anchor, moveBps: 0, samples: 0});
    }

    function test_cold_start_is_widest_allowed() public pure {
        Band.State memory s = _cold(100e18);
        assertEq(Band.widthBps(s), Constants.MAX_WIDTH_BPS);
    }

    function test_cold_start_accepts_near_value() public pure {
        assertTrue(Band.accepts(_cold(100e18), 101e18));
    }

    function test_cold_start_rejects_far_value() public pure {
        assertFalse(Band.accepts(_cold(100e18), 400e18));
    }

    function test_warm_band_is_narrow() public pure {
        Band.State memory s = Band.State({anchor: 100e18, moveBps: 100, samples: 64});
        assertEq(Band.widthBps(s), 100 * Constants.MOVE_MULTIPLIER);
    }

    function test_warm_band_accepts_two_percent() public pure {
        Band.State memory s = Band.State({anchor: 100e18, moveBps: 100, samples: 64});
        assertTrue(Band.accepts(s, 101e18));
    }

    function test_warm_band_rejects_ten_percent() public pure {
        Band.State memory s = Band.State({anchor: 100e18, moveBps: 100, samples: 64});
        assertFalse(Band.accepts(s, 110e18));
    }

    function test_width_floor_applies() public pure {
        Band.State memory s = Band.State({anchor: 100e18, moveBps: 1, samples: 64});
        assertEq(Band.widthBps(s), Constants.MIN_WIDTH_BPS);
    }

    function test_width_ceiling_applies() public pure {
        Band.State memory s = Band.State({anchor: 100e18, moveBps: 9_000, samples: 64});
        assertEq(Band.widthBps(s), Constants.MAX_WIDTH_BPS);
    }

    function test_partial_warm_is_wider_than_warm() public pure {
        Band.State memory half = Band.State({anchor: 100e18, moveBps: 100, samples: Constants.PRIOR_SAMPLES / 2});
        Band.State memory warm = Band.State({anchor: 100e18, moveBps: 100, samples: Constants.PRIOR_SAMPLES});
        assertGt(Band.widthBps(half), Band.widthBps(warm));
    }

    function test_observe_move_from_cold_returns_floor() public pure {
        assertEq(Band.observeMove(_cold(0), 100e18), Constants.MIN_WIDTH_BPS);
    }

    function test_observe_move_blends_down() public pure {
        Band.State memory s = Band.State({anchor: 100e18, moveBps: 1_000, samples: 10});
        uint32 next = Band.observeMove(s, 100e18); // zero realized move pulls the estimate down
        assertLt(next, 1_000);
    }

    function test_observe_move_blends_up() public pure {
        Band.State memory s = Band.State({anchor: 100e18, moveBps: 10, samples: 10});
        uint32 next = Band.observeMove(s, 110e18);
        assertGt(next, 10);
    }

    function test_observe_move_is_capped_by_the_current_width() public pure {
    // moveBps small, so the band is narrow; a print an order of magnitude away cannot
    // widen the estimate past that narrow band.
    Band.State memory s = Band.State({anchor: 100e18, moveBps: 1, samples: 64});
    uint32 before = Band.widthBps(s);
    uint32 widened = Band.widthBps(Band.State({anchor: 100e18, moveBps: Band.observeMove(s, 200e18), samples: 64}));
    assertLe(widened, before + 2);
    }

    function test_observe_move_keeps_a_warm_band_warm() public pure {
    Band.State memory s = Band.State({anchor: 100e18, moveBps: 10, samples: 64});
    uint32 next = Band.observeMove(s, 130e18);
    assertLt(Band.widthBps(Band.State({anchor: 130e18, moveBps: next, samples: 64})), 200);
    }

    function testFuzz_observe_move_widening_is_bounded(uint32 moveBps, uint256 value) public pure {
    moveBps = uint32(bound(moveBps, 0, Constants.MAX_WIDTH_BPS));
    Band.State memory s = Band.State({anchor: 1_000e18, moveBps: moveBps, samples: 64});
    uint32 before = Band.widthBps(s);
    uint32 widened = Band.observeMove(s, value);
    assertLe(widened, before);
    }

    function test_observe_move_caps_at_ceiling() public pure {
        Band.State memory s = Band.State({anchor: 1e18, moveBps: 100, samples: 10});
        assertLe(Band.observeMove(s, 1_000e18), Constants.MAX_WIDTH_BPS);
    }

    function test_range_is_symmetric() public pure {
        Band.State memory s = Band.State({anchor: 100e18, moveBps: 100, samples: 64});
        (uint256 lo, uint256 hi) = Band.range(s);
        assertEq(100e18 - lo, hi - 100e18);
    }

    function test_range_floor_never_negative() public pure {
    Band.State memory s = Band.State({anchor: 1, moveBps: 5_000, samples: 64});
    (uint256 lo, uint256 hi) = Band.range(s);
    assertLe(lo, 1); // a sub-unit anchor cannot produce a negative or zero floor
    assertGe(hi, 1);
    }

    function test_report_drift_inside() public pure {
        assertTrue(Band.withinReportDrift(100e18, 110e18));
    }

    function test_report_drift_at_boundary() public pure {
        assertTrue(Band.withinReportDrift(100e18, 120e18));
    }

    function test_report_drift_outside() public pure {
        assertFalse(Band.withinReportDrift(100e18, 130e18));
    }

    function test_report_drift_symmetric() public pure {
        assertTrue(Band.withinReportDrift(120e18, 100e18));
    }

    function testFuzz_width_always_within_bounds(uint32 moveBps, uint32 samples) public pure {
        Band.State memory s = Band.State({anchor: 1_000e18, moveBps: moveBps, samples: samples});
        uint256 w = Band.widthBps(s);
        assertGe(w, Constants.MIN_WIDTH_BPS);
        assertLe(w, Constants.MAX_WIDTH_BPS);
    }

    function testFuzz_accepts_own_anchor(uint32 moveBps, uint32 samples) public pure {
        vm.assume(moveBps <= Constants.MAX_WIDTH_BPS);
        Band.State memory s = Band.State({anchor: 1_000e18, moveBps: moveBps, samples: samples});
        assertTrue(Band.accepts(s, 1_000e18));
    }
}

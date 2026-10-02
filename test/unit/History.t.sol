// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {History} from "../../src/core/History.sol";
import {IHistory} from "../../src/interfaces/IHistory.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @dev The test contract is the controller, so history can be driven directly.
contract HistoryTest is Test {
    History internal h;
    bytes32 internal constant FEED = keccak256("FEED");

    function setUp() public {
        h = new History(address(this));
    }

    function test_first_observation_sets_anchor() public {
        h.observe(FEED, 100e18, 1, 1_000);
        assertEq(h.snapshot(FEED).anchor, 100e18);
    }

    function test_first_observation_counts_a_sample() public {
        h.observe(FEED, 100e18, 1, 1_000);
        assertEq(h.snapshot(FEED).samples, 1);
    }

    function test_round_and_timestamp_recorded() public {
        h.observe(FEED, 100e18, 9, 4_242);
        IHistory.Snapshot memory s = h.snapshot(FEED);
        assertEq(s.round, 9);
        assertEq(s.updatedAt, 4_242);
    }

    function test_packed_word_matches_snapshot() public {
        h.observe(FEED, 100e18, 9, 4_242);
        (uint64 r, uint64 t, uint32 m) = (uint64(0), uint64(0), uint32(0));
        (r, t, m) = _unpack(h.packed(FEED));
        assertEq(r, 9);
        assertEq(t, 4_242);
        assertEq(m, h.snapshot(FEED).moveBps);
    }

    function _unpack(uint256 word) internal pure returns (uint64 r, uint64 t, uint32 m) {
        r = uint64((word >> 96) & 0xFFFFFFFFFFFFFFFF);
        t = uint64((word >> 32) & 0xFFFFFFFFFFFFFFFF);
        m = uint32(word & 0xFFFFFFFF);
    }

    function test_second_observation_moves_anchor() public {
        h.observe(FEED, 100e18, 1, 1_000);
        h.observe(FEED, 101e18, 2, 1_060);
        assertEq(h.snapshot(FEED).anchor, 101e18);
    }

    function test_samples_accumulate() public {
        h.observe(FEED, 100e18, 1, 1_000);
        h.observe(FEED, 101e18, 2, 1_060);
        h.observe(FEED, 102e18, 3, 1_120);
        assertEq(h.snapshot(FEED).samples, 3);
    }

    function test_band_is_wide_when_cold() public {
        h.observe(FEED, 100e18, 1, 1_000);
        assertEq(h.widthBps(FEED), Constants.MAX_WIDTH_BPS);
    }

    function test_band_tightens_as_samples_grow() public {
        uint256 warm = 0;
        for (uint256 i = 0; i < 40; i++) {
            h.observe(FEED, 100e18 + i * 1e15, uint64(i + 1), uint64(1_000 + i * 60));
        }
        warm = h.widthBps(FEED);
        h.observe(FEED, 100e18, 100, 100_000);
        assertLt(warm, Constants.MAX_WIDTH_BPS);
    }

    function test_band_accepts_anchor_value() public {
        h.observe(FEED, 100e18, 1, 1_000);
        assertTrue(h.accepts(FEED, 100e18));
    }

    function test_only_controller_can_observe() public {
        History other = h;
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, address(0xBAD)));
        other.observe(FEED, 1e18, 1, 1);
    }

    function test_only_controller_can_check_drift() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, address(0xBAD)));
        h.checkDrift(FEED, 1e18, 1);
    }

    function test_drift_check_passes_on_first_observation() public {
        h.checkDrift(FEED, 1e30, 1); // no history yet, nothing to compare against
    }

    function test_drift_check_reverts_on_a_jump() public {
        h.observe(FEED, 100e18, 1, 1_000);
        vm.expectRevert(
            abi.encodeWithSelector(ILanternErrors.DriftExceeded.selector, 100e18, 130e18, Constants.MAX_REPORT_DRIFT_BPS)
        );
        h.checkDrift(FEED, 130e18, 1_100);
    }

    function test_drift_check_passes_inside_bound() public {
        h.observe(FEED, 100e18, 1, 1_000);
        h.checkDrift(FEED, 110e18, 1_100);
    }

    function test_cumulative_drift_reverts_after_repeated_creep() public {
        h.observe(FEED, 100e18, 1, 1_000);
        h.checkDrift(FEED, 119e18, 1_010);
        h.observe(FEED, 119e18, 2, 1_010);
        h.checkDrift(FEED, 138e18, 1_020);
        h.observe(FEED, 138e18, 3, 1_020);
        vm.expectRevert();
        h.checkDrift(FEED, 160e18, 1_030); // past the cumulative cap inside one window
    }

    function test_zero_controller_reverts() public {
        vm.expectRevert(ILanternErrors.ZeroAddress.selector);
        new History(address(0));
    }
}

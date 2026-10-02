// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {IFeedRegistry} from "../../src/interfaces/IFeedRegistry.sol";

contract LanternReportTest is LanternTest {
    function test_report_by_operator_recorded() public {
        _openFeedCold(FEED);
        _push(FEED, 100e18);
        IFeedRegistry.Report memory r = lantern.reg().reportAt(FEED, roundCounter);
        assertTrue(r.exists);
        assertEq(r.value, 100e18);
    }

    function test_report_by_stranger_reverts() public {
        _openFeedCold(FEED);
        vm.prank(OTHER);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, OTHER));
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
    }

    function test_report_on_unknown_feed_reverts() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownFeed.selector, FEED));
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
    }

    function test_report_on_under_bonded_feed_reverts() public {
        vm.prank(OPERATOR);
        lantern.registerFeed(FEED, keccak256("S"), 18);
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnderBonded.selector, FEED, 0, BOND * 0 + 1e17));
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
    }

    function test_report_count_moves() public {
        _openFeedCold(FEED);
        _push(FEED, 100e18);
        assertEq(lantern.reg().book().pricedRounds(FEED), 1);
    }

    function test_repeated_payload_reverts() public {
        _openFeedCold(FEED);
        bytes32 payload = keccak256("same");
        vm.startPrank(OPERATOR);
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), payload, OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.PayloadReused.selector, payload));
        lantern.recordReport(FEED, 100e18, 2, uint64(block.timestamp), payload, OPERATOR);
        vm.stopPrank();
    }

    function test_round_going_backwards_reverts() public {
    _openFeedCold(FEED);
    _push(FEED, 100e18);
    uint64 stale = roundCounter - 1;
    vm.prank(OPERATOR);
    vm.expectRevert(abi.encodeWithSelector(ILanternErrors.RoundNotMonotone.selector, FEED, stale, roundCounter));
    lantern.recordReport(FEED, 101e18, stale, uint64(block.timestamp), keccak256("fresh"), OPERATOR);
    }

    /// @dev A duplicate print of an already-used round is refused outright: there is nothing new
    ///      to learn from it, unlike a *different* value for the same round, which is recorded.
    function test_duplicate_round_same_value_is_refused() public {
    _openFeedCold(FEED);
    uint64 round = _push(FEED, 100e18);
    vm.prank(OPERATOR);
    vm.expectRevert(abi.encodeWithSelector(ILanternErrors.SlotConflict.selector, FEED, round));
    lantern.recordReport(FEED, 100e18, round, uint64(block.timestamp), keccak256("dup"), OPERATOR);
    }

    /// @dev The rule that proves a conflict needs the conflict to survive on-chain.
    function test_conflicting_value_for_a_used_round_is_recorded() public {
    _openFeedCold(FEED);
    uint64 round = _push(FEED, 100e18);
    vm.prank(OPERATOR);
    lantern.recordReport(FEED, 105e18, round, uint64(block.timestamp), keccak256("revised"), OPERATOR);
    assertTrue(lantern.reg().book().slotOf(FEED, round).conflicted);
    }

    function test_recorded_conflict_keeps_the_first_print() public {
    _openFeedCold(FEED);
    uint64 round = _push(FEED, 100e18);
    vm.prank(OPERATOR);
    lantern.recordReport(FEED, 105e18, round, uint64(block.timestamp), keccak256("revised"), OPERATOR);
    assertEq(lantern.reg().reportAt(FEED, round).value, 100e18);
    }

    function test_fresh_payload_accepted() public {
        _openFeedCold(FEED);
        uint64 r1 = _push(FEED, 100e18);
        uint64 r2 = _push(FEED, 101e18);
        assertTrue(r2 > r1);
    }

    function test_two_feeds_may_share_a_round_number() public {
    _openFeedCold(FEED);
    _openFeedCold(FEED_B);
    uint64 shared = 7_777;
    vm.startPrank(OPERATOR);
    lantern.recordReport(FEED, 100e18, shared, uint64(block.timestamp), keccak256("a"), OPERATOR);
    lantern.recordReport(FEED_B, 50e18, shared, uint64(block.timestamp), keccak256("b"), OPERATOR);
    vm.stopPrank();
    assertTrue(lantern.reg().reportAt(FEED, shared).exists);
    assertTrue(lantern.reg().reportAt(FEED_B, shared).exists);
    }

    function test_report_event_carries_value() public {
        _openFeedCold(FEED);
        vm.expectEmit(true, false, false, true, address(lantern));
        emit ReportRecorded(FEED, roundCounter + 1, 100e18);
        _push(FEED, 100e18);
    }

    event ReportRecorded(bytes32 indexed feedId, uint64 round, uint256 value);

    function test_large_jump_beyond_drift_reverts() public {
        _openFeedCold(FEED);
        _push(FEED, 100e18);
        vm.prank(OPERATOR);
        vm.expectRevert();
        lantern.recordReport(FEED, 300e18, ++roundCounter, uint64(block.timestamp), keccak256("jump"), OPERATOR);
    }

    function test_small_jump_accepted() public {
        _openFeedCold(FEED);
        _push(FEED, 100e18);
        _push(FEED, 110e18);
        assertTrue(lantern.reg().reportAt(FEED, roundCounter).exists);
    }

    function test_report_inside_band_records_cleanly() public {
        _openFeedCold(FEED);
        _push(FEED, 100e18);
        _push(FEED, 101e18);
        assertFalse(lantern.reg().book().slotOf(FEED, roundCounter).conflicted);
    }
}

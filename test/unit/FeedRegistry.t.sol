// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FeedRegistry} from "../../src/core/FeedRegistry.sol";
import {IFeedRegistry} from "../../src/interfaces/IFeedRegistry.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @dev The test contract is the controller, so the registry can be driven directly.
contract FeedRegistryTest is Test {
    FeedRegistry internal reg;
    bytes32 internal constant FEED = keccak256("F");
    bytes32 internal constant FEED_B = keccak256("G");

    function setUp() public {
        reg = new FeedRegistry(address(this));
        reg.registerFeed(FEED, address(this), keccak256("S"), 18);
    }

    function test_register_sets_the_operator() public view {
        assertEq(reg.operatorOf(FEED), address(this));
    }

    function test_register_sets_decimals() public view {
        assertEq(reg.decimalsOf(FEED), 18);
    }

    function test_registered_flag() public view {
        assertTrue(reg.registered(FEED));
        assertFalse(reg.registered(FEED_B));
    }

    function test_register_twice_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.FeedAlreadyRegistered.selector, FEED));
        reg.registerFeed(FEED, address(this), keccak256("S"), 18);
    }

    function test_register_zero_operator_reverts() public {
        vm.expectRevert(ILanternErrors.ZeroAddress.selector);
        reg.registerFeed(FEED_B, address(0), keccak256("S"), 18);
    }

    function test_only_controller_may_register() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, address(0xBAD)));
        reg.registerFeed(FEED_B, address(0xBAD), keccak256("S"), 18);
    }

    function test_only_controller_may_record() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, address(0xBAD)));
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), address(this));
    }

    function test_report_is_stored() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), address(this));
        IFeedRegistry.Report memory r = reg.reportAt(FEED, 1);
        assertTrue(r.exists);
        assertEq(r.value, 100e18);
    }

    function test_report_keeps_its_round_and_payload() public {
        bytes32 payload = keccak256("p");
        reg.recordReport(FEED, 100e18, 9, uint64(block.timestamp), payload, address(0x5EED));
        IFeedRegistry.Report memory r = reg.reportAt(FEED, 9);
        assertEq(r.round, 9);
        assertEq(r.payloadHash, payload);
        assertEq(r.signer, address(0x5EED));
    }

    function test_unknown_round_is_empty() public view {
        assertFalse(reg.reportAt(FEED, 123).exists);
    }

    function test_last_report_empty_at_first() public view {
        assertFalse(reg.lastReport(FEED).exists);
    }

    function test_last_report_tracks_the_newest() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, 101e18, 2, uint64(block.timestamp), keccak256("p2"), address(this));
        assertEq(reg.lastReport(FEED).value, 101e18);
    }

    function test_prev_value_links_consecutive_reports() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, 101e18, 2, uint64(block.timestamp), keccak256("p2"), address(this));
        assertEq(reg.reportAt(FEED, 2).prevValue, 100e18);
    }

    function test_first_report_snapshots_an_empty_band() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        IFeedRegistry.Report memory r = reg.reportAt(FEED, 1);
        assertEq(r.prevBandLo, 0);
        assertEq(r.prevBandHi, 0);
    }

    function test_second_report_snapshots_a_band() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, 101e18, 2, uint64(block.timestamp), keccak256("p2"), address(this));
        IFeedRegistry.Report memory r = reg.reportAt(FEED, 2);
        assertGt(r.prevBandHi, 0);
        assertLe(r.prevBandLo, 100e18);
    }

    function test_zero_value_reverts() public {
        vm.expectRevert(ILanternErrors.ZeroAmount.selector);
        reg.recordReport(FEED, 0, 1, uint64(block.timestamp), keccak256("p"), address(this));
    }

    function test_future_timestamp_reverts() public {
        vm.expectRevert();
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp + 120), keccak256("p"), address(this));
    }

    function test_stale_timestamp_reverts() public {
        vm.warp(10_000);
        vm.expectRevert();
        reg.recordReport(FEED, 100e18, 1, uint64(10_000 - Constants.STALENESS_BOUND - 1), keccak256("p"), address(this));
    }

    function test_timestamp_at_the_staleness_edge_is_accepted() public {
        vm.warp(10_000);
        reg.recordReport(FEED, 100e18, 1, uint64(10_000 - Constants.STALENESS_BOUND), keccak256("p"), address(this));
        assertTrue(reg.reportAt(FEED, 1).exists);
    }

    function test_unknown_feed_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownFeed.selector, FEED_B));
        reg.recordReport(FEED_B, 100e18, 1, uint64(block.timestamp), keccak256("p"), address(this));
    }

    function test_duplicate_round_same_value_reverts() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.SlotConflict.selector, FEED, 1));
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p2"), address(this));
    }

    function test_duplicate_round_different_value_records_a_conflict() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, 105e18, 1, uint64(block.timestamp), keccak256("p2"), address(this));
        assertTrue(reg.book().slotOf(FEED, 1).conflicted);
    }

    function test_conflict_leaves_the_first_print_intact() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, 105e18, 1, uint64(block.timestamp), keccak256("p2"), address(this));
        assertEq(reg.reportAt(FEED, 1).value, 100e18);
    }

    function test_conflict_records_the_other_value() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, 105e18, 1, uint64(block.timestamp), keccak256("p2"), address(this));
        assertEq(reg.book().slotOf(FEED, 1).otherValue, 105e18);
    }

    function test_same_feed_payload_replay_reverts() public {
        bytes32 payload = keccak256("same");
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), payload, address(this));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.PayloadReused.selector, payload));
        reg.recordReport(FEED, 101e18, 2, uint64(block.timestamp), payload, address(this));
    }

    function test_cross_feed_payload_reuse_is_recorded() public {
        reg.registerFeed(FEED_B, address(this), keccak256("S"), 18);
        bytes32 payload = keccak256("shared");
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), payload, address(this));
        reg.recordReport(FEED_B, 50e18, 1, uint64(block.timestamp), payload, address(this));
        assertTrue(reg.reportAt(FEED_B, 1).exists);
        assertEq(reg.book().payloadFeed(payload), FEED);
    }

    function test_non_monotone_round_reverts() public {
        reg.recordReport(FEED, 100e18, 5, uint64(block.timestamp), keccak256("p1"), address(this));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.RoundNotMonotone.selector, FEED, 1, 5));
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p2"), address(this));
    }

    function test_priced_rounds_counter() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, 101e18, 2, uint64(block.timestamp), keccak256("p2"), address(this));
        assertEq(reg.book().pricedRounds(FEED), 2);
    }

    function test_band_view_is_readable() public {
        reg.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        (uint256 lo, uint256 hi) = reg.band(FEED);
        assertLe(lo, hi);
    }

    function test_history_view_returns_the_contract() public view {
        assertTrue(address(reg.history()) != address(0));
    }

    function test_zero_controller_reverts() public {
        vm.expectRevert(ILanternErrors.ZeroAddress.selector);
        new FeedRegistry(address(0));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FeedRegistry} from "../../src/core/FeedRegistry.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {Band} from "../../src/libraries/Band.sol";
import {FixedPoint} from "../../src/libraries/FixedPoint.sol";

contract RegistryFuzzTest is Test {
    FeedRegistry internal reg;
    bytes32 internal constant FEED = keccak256("F");

    function setUp() public {
        reg = new FeedRegistry(address(this));
        reg.registerFeed(FEED, address(this), keccak256("S"), 18);
    }

    function testFuzz_reports_inside_the_drift_cap_are_recorded(uint96 value) public {
        uint256 first = 100e18;
        reg.recordReport(FEED, first, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        uint256 next = bound(uint256(value), first - (first * Constants.MAX_REPORT_DRIFT_BPS) / Constants.BPS, first);
        vm.assume(next > 0);
        _record(2, next, keccak256("p2"));
        assertTrue(reg.reportAt(FEED, 2).exists);
    }

    function testFuzz_monotone_rounds_only_advance(uint64 first, uint64 second) public {
        first = uint64(bound(uint256(first), 1, type(uint64).max - 1));
        second = uint64(bound(uint256(second), 1, type(uint64).max - 1));
        vm.assume(second <= first);
        reg.recordReport(FEED, 100e18, first, uint64(block.timestamp), keccak256("p1"), address(this));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.RoundNotMonotone.selector, FEED, second, first));
        _record(second, 100e18, keccak256("p2"));
    }

    function testFuzz_payloads_are_unique_across_rounds(uint64 a, uint64 b, bytes32 payload) public {
        a = uint64(bound(uint256(a), 1, 1e12));
        b = uint64(bound(uint256(b), 1e13, type(uint64).max));
        reg.recordReport(FEED, 100e18, a, uint64(block.timestamp), payload, address(this));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.PayloadReused.selector, payload));
        _record(b, 100e18, payload);
    }

    function testFuzz_a_conflict_is_always_visible(uint64 round, uint96 v1, uint96 v2) public {
        vm.assume(v1 != v2 && v1 > 0 && v2 > 0);
        round = uint64(bound(uint256(round), 1, 1e12));
        reg.recordReport(FEED, v1, round, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, v2, round, uint64(block.timestamp), keccak256("p2"), address(this));
        assertTrue(reg.book().slotOf(FEED, round).conflicted);
    }

    function testFuzz_the_first_print_always_stands(uint64 round, uint96 v1, uint96 v2) public {
        vm.assume(v1 != v2 && v1 > 0 && v2 > 0);
        round = uint64(bound(uint256(round), 1, 1e12));
        reg.recordReport(FEED, v1, round, uint64(block.timestamp), keccak256("p1"), address(this));
        reg.recordReport(FEED, v2, round, uint64(block.timestamp), keccak256("p2"), address(this));
        assertEq(reg.reportAt(FEED, round).value, v1);
    }

    function testFuzz_reported_value_is_never_zero(uint64 round) public {
        round = uint64(bound(uint256(round), 1, 1e12));
        vm.expectRevert(ILanternErrors.ZeroAmount.selector);
        _record(round, 0, keccak256("p"));
    }

    function testFuzz_band_only_ever_contains_the_anchor_after_one_report(uint96 value) public {
        vm.assume(value > 0);
        reg.recordReport(FEED, value, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        assertTrue(reg.history().accepts(FEED, value));
    }

    function testFuzz_second_report_records_a_band_around_the_first(uint96 first, uint96 second) public {
        vm.assume(first > 0 && second > 0);
        uint256 lo = uint256(first) - (uint256(first) * Constants.MAX_REPORT_DRIFT_BPS) / Constants.BPS;
        uint256 hi = uint256(first) + (uint256(first) * Constants.MAX_REPORT_DRIFT_BPS) / Constants.BPS;
        vm.assume(uint256(second) >= lo && uint256(second) <= hi && second <= type(uint64).max);
        reg.recordReport(FEED, first, 1, uint64(block.timestamp), keccak256("p1"), address(this));
        vm.warp(block.timestamp + 1);
        _record(2, second, keccak256("p2"));
        assertLe(reg.reportAt(FEED, 2).prevBandLo, first);
    }

    function testFuzz_priced_rounds_counts_every_record(uint8 n) public {
        uint256 count = bound(uint256(n), 1, 8);
        for (uint256 i = 0; i < count; i++) {
            _record(uint64(i + 1), 100e18, keccak256(abi.encode(i)));
        }
        assertEq(reg.book().pricedRounds(FEED), count);
    }

    function _record(uint64 round, uint256 value, bytes32 payload) internal {
        reg.recordReport(FEED, value, round, uint64(block.timestamp), payload, address(this));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FixedPoint} from "../../src/libraries/FixedPoint.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract FixedPointTest is Test {
    function test_bpsOf_basic() public pure {
        assertEq(FixedPoint.bpsOf(1_000e18, 100), 10e18);
    }

    function test_bpsOf_zero() public pure {
        assertEq(FixedPoint.bpsOf(1_000e18, 0), 0);
    }

    function test_bpsOf_full() public pure {
        assertEq(FixedPoint.bpsOf(500e18, Constants.BPS), 500e18);
    }

    function test_bpsOf_rounds_down() public pure {
        assertEq(FixedPoint.bpsOf(1, 5_000), 0);
    }

    function test_bpsOf_one_bp() public pure {
        assertEq(FixedPoint.bpsOf(10_000e18, 1), 1e18);
    }

    function test_absDiff_both_ways() public pure {
        assertEq(FixedPoint.absDiff(10, 7), 3);
        assertEq(FixedPoint.absDiff(7, 10), 3);
    }

    function test_absDiff_equal() public pure {
        assertEq(FixedPoint.absDiff(42, 42), 0);
    }

    function test_absDiffBps_ten_percent() public pure {
        assertEq(FixedPoint.absDiffBps(110, 100), 1_000);
    }

    function test_absDiffBps_half() public pure {
        assertEq(FixedPoint.absDiffBps(50, 100), 5_000);
    }

    function test_absDiffBps_double() public pure {
        assertEq(FixedPoint.absDiffBps(200, 100), 10_000);
    }

    function test_absDiffBps_zero_base_is_max() public pure {
        assertEq(FixedPoint.absDiffBps(1, 0), type(uint256).max);
    }

    function test_absDiffBps_equal_is_zero() public pure {
        assertEq(FixedPoint.absDiffBps(123e18, 123e18), 0);
    }

    function test_min_max() public pure {
        assertEq(FixedPoint.min(3, 9), 3);
        assertEq(FixedPoint.max(3, 9), 9);
    }

    function test_mulDiv_exact() public pure {
        assertEq(FixedPoint.mulDiv(6, 7, 3), 14);
    }

    function test_mulDiv_truncates() public pure {
        assertEq(FixedPoint.mulDiv(10, 10, 3), 33);
    }

    function test_mulDiv_high_precision() public pure {
        assertEq(FixedPoint.mulDiv(type(uint256).max, 1, type(uint256).max), 1);
    }

    function testFuzz_mulDiv_never_overflows(uint128 a, uint128 b, uint128 d) public pure {
        vm.assume(d != 0);
        uint256 got = FixedPoint.mulDiv(uint256(a), uint256(b), uint256(d));
        assertLe(got, (uint256(a) * uint256(b)) / uint256(d) + 1);
    }

    function testFuzz_bpsOf_identity(uint256 amount) public pure {
        assertEq(FixedPoint.bpsOf(amount, Constants.BPS), amount);
    }

    function testFuzz_bpsOf_monotone(uint96 amount, uint16 bps) public pure {
        bps = uint16(bound(bps, 0, Constants.BPS));
        assertLe(FixedPoint.bpsOf(amount, bps), uint256(amount));
    }

    function testFuzz_absDiffBps_symmetry(uint128 a, uint128 b) public pure {
    // A zero base returns the sentinel max by design, so symmetry is claimed only off zero.
    vm.assume(a != 0 && b != 0);
    assertEq(FixedPoint.absDiffBps(a, b), FixedPoint.absDiffBps(b, a));
    }
}

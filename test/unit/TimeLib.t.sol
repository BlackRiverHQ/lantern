// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TimeLib} from "../../src/libraries/TimeLib.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract TimeLibTest is Test {
    function test_window_at_minimum_ok() public pure {
        assertEq(TimeLib.validateWindow(Constants.MIN_HOLD_WINDOW), Constants.MIN_HOLD_WINDOW);
    }

    function test_window_at_maximum_ok() public pure {
        assertEq(TimeLib.validateWindow(Constants.MAX_HOLD_WINDOW), Constants.MAX_HOLD_WINDOW);
    }

    function test_window_below_minimum_reverts() public {
        vm.expectRevert(bytes("WINDOW"));
        TimeLib.validateWindow(Constants.MIN_HOLD_WINDOW - 1);
    }

    function test_window_above_maximum_reverts() public {
        vm.expectRevert(bytes("WINDOW"));
        TimeLib.validateWindow(Constants.MAX_HOLD_WINDOW + 1);
    }

    function test_deadline_adds_window() public pure {
        assertEq(TimeLib.deadline(1_000, 60), 1_060);
    }

    function test_is_open_before_deadline() public pure {
        assertTrue(TimeLib.isOpen(1_059, 1_060));
    }

    function test_is_not_open_at_deadline() public pure {
        assertFalse(TimeLib.isOpen(1_060, 1_060));
    }

    function test_is_closed_at_deadline() public pure {
        assertTrue(TimeLib.isClosed(1_060, 1_060));
    }

    function test_is_closed_after_deadline() public pure {
        assertTrue(TimeLib.isClosed(2_000, 1_060));
    }

    function test_expired_strictly_after() public pure {
        assertFalse(TimeLib.expired(100, 100));
        assertTrue(TimeLib.expired(101, 100));
    }

    function testFuzz_open_and_closed_partition(uint64 nowTs, uint64 deadlineAt) public pure {
        bool open = TimeLib.isOpen(uint256(nowTs), deadlineAt);
        bool closed = TimeLib.isClosed(uint256(nowTs), deadlineAt);
        assertTrue(open != closed);
    }

    function testFuzz_deadline_monotone(uint64 nowTs, uint64 window) public pure {
    vm.assume(nowTs < type(uint64).max - 1_000); // keep the bound inside uint64 timestamps
    window = uint64(bound(window, Constants.MIN_HOLD_WINDOW, Constants.MAX_HOLD_WINDOW));
    assertGe(TimeLib.deadline(uint256(nowTs), window), uint256(nowTs));
    }
}

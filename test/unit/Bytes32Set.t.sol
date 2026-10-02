// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Bytes32Set} from "../../src/libraries/Bytes32Set.sol";

contract Bytes32SetTest is Test {
    using Bytes32Set for Bytes32Set.Set;
    Bytes32Set.Set internal set;

    function test_add_returns_true_first_time() public {
        assertTrue(set.add(bytes32(uint256(1))));
    }

    function test_add_returns_false_second_time() public {
        set.add(bytes32(uint256(1)));
        assertFalse(set.add(bytes32(uint256(1))));
    }

    function test_contains_after_add() public {
        set.add(bytes32(uint256(9)));
        assertTrue(set.contains(bytes32(uint256(9))));
    }

    function test_contains_false_when_absent() public {
        assertFalse(set.contains(bytes32(uint256(9))));
    }

    function test_length_grows() public {
        set.add(bytes32(uint256(1)));
        set.add(bytes32(uint256(2)));
        assertEq(set.length(), 2);
    }

    function test_remove_shrinks() public {
        set.add(bytes32(uint256(1)));
        set.add(bytes32(uint256(2)));
        assertTrue(set.remove(bytes32(uint256(1))));
        assertEq(set.length(), 1);
    }

    function test_remove_absent_is_false() public {
        assertFalse(set.remove(bytes32(uint256(3))));
    }

    function test_remove_keeps_other_members() public {
        set.add(bytes32(uint256(1)));
        set.add(bytes32(uint256(2)));
        set.remove(bytes32(uint256(1)));
        assertTrue(set.contains(bytes32(uint256(2))));
    }

    function test_remove_all_leaves_empty() public {
        set.add(bytes32(uint256(1)));
        set.remove(bytes32(uint256(1)));
        assertEq(set.length(), 0);
        assertFalse(set.contains(bytes32(uint256(1))));
    }

    function test_at_returns_members() public {
        set.add(bytes32(uint256(1)));
        set.add(bytes32(uint256(2)));
        assertEq(set.at(0), bytes32(uint256(1)));
        assertEq(set.at(1), bytes32(uint256(2)));
    }

    function testFuzz_add_then_contains(bytes32 v) public {
        set.add(v);
        assertTrue(set.contains(v));
    }

    function testFuzz_add_is_idempotent(bytes32 v) public {
        set.add(v);
        set.add(v);
        assertEq(set.length(), 1);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {EscrowLedger} from "../../src/libraries/EscrowLedger.sol";

contract EscrowLedgerTest is Test {
    using EscrowLedger for EscrowLedger.Queue;

    EscrowLedger.Queue internal q;

    function test_enqueue_then_head() public {
        q.enqueue(11);
        (bool has, uint256 id) = q.head();
        assertTrue(has);
        assertEq(id, 11);
    }

    function test_head_empty() public {
        (bool has, uint256 id) = q.head();
        assertFalse(has);
        assertEq(id, 0);
    }

    function test_fifo_order() public {
        q.enqueue(1);
        q.enqueue(2);
        assertEq(q.pop(), 1);
        assertEq(q.pop(), 2);
    }

    function test_pop_advances_head() public {
        q.enqueue(7);
        q.pop();
        (bool has, ) = q.head();
        assertFalse(has);
    }

    function test_outstanding_counts_entries() public {
        q.enqueue(1);
        q.enqueue(2);
        assertEq(q.outstanding(), 2);
    }

    function test_outstanding_decreases_after_pop() public {
        q.enqueue(1);
        q.enqueue(2);
        q.pop();
        assertEq(q.outstanding(), 1);
    }

    function test_outstanding_zero_when_empty() public {
        assertEq(q.outstanding(), 0);
    }

    function test_outstanding_zero_after_full_drain() public {
        q.enqueue(1);
        q.enqueue(2);
        q.pop();
        q.pop();
        assertEq(q.outstanding(), 0);
    }

    function testFuzz_fifo_preserved(uint256 a, uint256 b) public {
        vm.assume(a != 0 && b != 0);
        q.enqueue(a);
        q.enqueue(b);
        assertEq(q.pop(), a);
        assertEq(q.pop(), b);
    }

    function testFuzz_outstanding_matches_enqueues(uint8 n) public {
        for (uint256 i = 0; i < n; i++) q.enqueue(i + 1);
        assertEq(q.outstanding(), n);
    }

    function testFuzz_pops_never_return_zero_for_live_entries(uint8 n) public {
        vm.assume(n > 0);
        for (uint256 i = 0; i < n; i++) q.enqueue(i + 1);
        assertGt(q.pop(), 0);
    }

    function testFuzz_head_matches_first_enqueued(uint256 first, uint256 second) public {
        q.enqueue(first);
        q.enqueue(second);
        (bool has, uint256 id) = q.head();
        assertTrue(has);
        assertEq(id, first);
    }
}

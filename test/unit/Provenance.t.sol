// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Provenance} from "../../src/libraries/Provenance.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract ProvenanceTest is Test {
    function test_slot_conflict_same_round_different_value() public pure {
        assertTrue(Provenance.slotConflict(100, 200, 7, 7));
    }

    function test_slot_conflict_same_value_is_not_a_conflict() public pure {
        assertFalse(Provenance.slotConflict(100, 100, 7, 7));
    }

    function test_slot_conflict_different_rounds_is_not_a_conflict() public pure {
        assertFalse(Provenance.slotConflict(100, 200, 7, 8));
    }

    function test_non_monotone_same_round() public pure {
        assertTrue(Provenance.nonMonotone(7, 7));
    }

    function test_non_monotone_lower_round() public pure {
        assertTrue(Provenance.nonMonotone(6, 7));
    }

    function test_monotone_accepted() public pure {
        assertFalse(Provenance.nonMonotone(8, 7));
    }

    function test_stale_beyond_bound() public pure {
        assertTrue(Provenance.stale(1_000, 1_000 + Constants.STALENESS_BOUND + 1));
    }

    function test_not_stale_inside_bound() public pure {
        assertFalse(Provenance.stale(1_000, 1_000 + Constants.STALENESS_BOUND));
    }

    function test_not_stale_at_now() public pure {
        assertFalse(Provenance.stale(1_000, 1_000));
    }

    function test_future_dated_beyond_tolerance() public pure {
        assertTrue(Provenance.futureDated(1_000 + 61, 1_000));
    }

    function test_future_within_tolerance() public pure {
        assertFalse(Provenance.futureDated(1_000 + 30, 1_000));
    }

    function test_reused_true_when_seen() public pure {
        assertTrue(Provenance.reused(keccak256("p"), true));
    }

    function test_reused_true_for_zero_hash() public pure {
        assertTrue(Provenance.reused(bytes32(0), false));
    }

    function test_reused_false_for_fresh_head() public pure {
        assertFalse(Provenance.reused(keccak256("p"), false));
    }

    function testFuzz_stale_matches_boundary(uint64 ts, uint64 nowTs) public pure {
        bool stale = Provenance.stale(ts, uint256(nowTs));
        assertEq(stale, uint256(ts) + Constants.STALENESS_BOUND < uint256(nowTs));
    }

    function testFuzz_monotone_is_strict(uint64 a, uint64 b) public pure {
        assertEq(Provenance.nonMonotone(a, b), a <= b);
    }
}

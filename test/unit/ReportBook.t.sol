// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ReportBook} from "../../src/core/ReportBook.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";

contract ReportBookTest is Test {
    ReportBook internal b;
    bytes32 internal constant FEED = keccak256("F");
    bytes32 internal constant FEED_B = keccak256("G");

    function setUp() public {
        b = new ReportBook(address(this));
    }

    function test_first_slot_claim_returns_true() public {
        assertTrue(b.claimSlot(FEED, 1, 100));
    }

    function test_second_claim_same_value_returns_false_without_conflict() public {
        b.claimSlot(FEED, 1, 100);
        assertFalse(b.claimSlot(FEED, 1, 100));
        assertFalse(b.slotOf(FEED, 1).conflicted);
    }

    function test_second_claim_different_value_records_conflict() public {
        b.claimSlot(FEED, 1, 100);
        b.claimSlot(FEED, 1, 200);
        assertTrue(b.slotOf(FEED, 1).conflicted);
    }

    function test_conflict_keeps_the_first_value() public {
        b.claimSlot(FEED, 1, 100);
        b.claimSlot(FEED, 1, 200);
        assertEq(b.slotOf(FEED, 1).firstValue, 100);
    }

    function test_conflict_records_the_other_value() public {
        b.claimSlot(FEED, 1, 100);
        b.claimSlot(FEED, 1, 200);
        assertEq(b.slotOf(FEED, 1).otherValue, 200);
    }

    function test_distinct_rounds_are_distinct_slots() public {
        b.claimSlot(FEED, 1, 100);
        b.claimSlot(FEED, 2, 200);
        assertFalse(b.slotOf(FEED, 1).conflicted);
    }

    function test_priced_rounds_counter() public {
        b.claimSlot(FEED, 1, 100);
        b.claimSlot(FEED, 2, 100);
        assertEq(b.pricedRounds(FEED), 2);
    }

    function test_payload_first_time_true() public {
        assertTrue(b.claimPayload(FEED, 1, keccak256("p")));
    }

    function test_payload_second_time_false() public {
        b.claimPayload(FEED, 1, keccak256("p"));
        assertFalse(b.claimPayload(FEED, 2, keccak256("p")));
    }

    function test_payload_seen_after_claim() public {
        bytes32 p = keccak256("p");
        b.claimPayload(FEED, 1, p);
        assertTrue(b.payloadSeen(p));
    }

    function test_payload_feed_recorded() public {
        bytes32 p = keccak256("p");
        b.claimPayload(FEED, 1, p);
        assertEq(b.payloadFeed(p), FEED);
    }

    function test_payload_reuse_across_feeds_visible() public {
        bytes32 p = keccak256("p");
        b.claimPayload(FEED, 1, p);
        b.claimPayload(FEED_B, 5, p);
        assertEq(b.payloadFeed(p), FEED); // the first feed keeps the provenance
    }

    function test_payload_count() public {
        b.claimPayload(FEED, 1, keccak256("p1"));
        b.claimPayload(FEED, 2, keccak256("p2"));
        assertEq(b.payloadCount(), 2);
    }

    function test_only_controller_can_claim_slot() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, address(0xBAD)));
        b.claimSlot(FEED, 1, 1);
    }

    function test_only_controller_can_claim_payload() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, address(0xBAD)));
        b.claimPayload(FEED, 1, keccak256("p"));
    }

    function test_zero_controller_reverts() public {
        vm.expectRevert(ILanternErrors.ZeroAddress.selector);
        new ReportBook(address(0));
    }

    function testFuzz_conflict_detected_for_any_two_values(uint64 round, uint256 v1, uint256 v2) public {
        vm.assume(a != b);
        b.claimSlot(FEED, round, a);
        b.claimSlot(FEED, round, b);
        assertTrue(b.slotOf(FEED, round).conflicted);
    }
}

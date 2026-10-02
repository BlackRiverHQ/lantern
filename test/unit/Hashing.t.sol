// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Hashing} from "../../src/libraries/Hashing.sol";

contract HashingTest is Test {
    bytes32 constant FEED = keccak256("F");

    function test_payload_is_deterministic() public pure {
        assertEq(Hashing.payload(FEED, 1e18, 1, 2, address(1)), Hashing.payload(FEED, 1e18, 1, 2, address(1)));
    }

    function test_payload_changes_with_value() public pure {
        assertTrue(Hashing.payload(FEED, 1e18, 1, 2, address(1)) != Hashing.payload(FEED, 2e18, 1, 2, address(1)));
    }

    function test_payload_changes_with_round() public pure {
        assertTrue(Hashing.payload(FEED, 1e18, 1, 2, address(1)) != Hashing.payload(FEED, 1e18, 2, 2, address(1)));
    }

    function test_payload_changes_with_timestamp() public pure {
        assertTrue(Hashing.payload(FEED, 1e18, 1, 2, address(1)) != Hashing.payload(FEED, 1e18, 1, 3, address(1)));
    }

    function test_payload_changes_with_signer() public pure {
        assertTrue(Hashing.payload(FEED, 1e18, 1, 2, address(1)) != Hashing.payload(FEED, 1e18, 1, 2, address(2)));
    }

    function test_payload_changes_with_feed() public pure {
        assertTrue(Hashing.payload(FEED, 1e18, 1, 2, address(1)) != Hashing.payload(keccak256("G"), 1e18, 1, 2, address(1)));
    }

    function test_slot_is_deterministic() public pure {
        assertEq(Hashing.slot(FEED, 7), Hashing.slot(FEED, 7));
    }

    function test_slot_changes_with_round() public pure {
        assertTrue(Hashing.slot(FEED, 7) != Hashing.slot(FEED, 8));
    }

    function test_domains_do_not_collide() public pure {
        bytes32 a = Hashing.payload(FEED, 1e18, 1, 2, address(1));
        bytes32 b = Hashing.slot(FEED, 1);
        assertTrue(a != b);
    }

    function test_liquidation_digest_differs_from_challenge() public pure {
        assertTrue(Hashing.liquidation(1, FEED, 1e18) != Hashing.challenge(1, address(1), 0, bytes32(0)));
    }

    function test_verdict_digest_changes_with_numbers() public pure {
        assertTrue(Hashing.verdict(1, 0, 1, 2) != Hashing.verdict(1, 0, 1, 3));
    }

    function testFuzz_payload_binds_every_field(uint64 round, uint64 ts, uint256 value) public pure {
        vm.assume(round < type(uint64).max && value < type(uint256).max);
            bytes32 base = Hashing.payload(FEED, value, round, ts, address(1));
        assertTrue(base != Hashing.payload(FEED, value + 1, round, ts, address(1)));
        assertTrue(base != Hashing.payload(FEED, value, round + 1, ts, address(1)));
    }
}

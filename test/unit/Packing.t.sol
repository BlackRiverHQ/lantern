// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Packing} from "../../src/libraries/Packing.sol";

contract PackingTest is Test {
    function test_pack_unpack_roundtrip() public pure {
        (uint64 r, uint64 t, uint32 m) = Packing.unpack(Packing.pack(7, 1_000, 123));
        assertEq(r, 7);
        assertEq(t, 1_000);
        assertEq(m, 123);
    }

    function test_roundOf() public pure {
        assertEq(Packing.roundOf(Packing.pack(42, 7, 1)), 42);
    }

    function test_timestampOf() public pure {
        assertEq(Packing.timestampOf(Packing.pack(42, 7, 1)), 7);
    }

    function test_fields_do_not_bleed() public pure {
        uint256 w = Packing.pack(type(uint64).max, type(uint64).max, type(uint32).max);
        (uint64 r, uint64 t, uint32 m) = Packing.unpack(w);
        assertEq(r, type(uint64).max);
        assertEq(t, type(uint64).max);
        assertEq(m, type(uint32).max);
    }

    function test_zero_packs_to_zero() public pure {
        assertEq(Packing.pack(0, 0, 0), 0);
    }

    function testFuzz_roundtrip(uint64 r, uint64 t, uint32 m) public pure {
        (uint64 rr, uint64 tt, uint32 mm) = Packing.unpack(Packing.pack(r, t, m));
        assertEq(rr, r);
        assertEq(tt, t);
        assertEq(mm, m);
    }

    function testFuzz_distinct_rounds_differ(uint64 a, uint64 b) public pure {
        vm.assume(a != b);
        assertTrue(Packing.pack(a, 1, 1) != Packing.pack(b, 1, 1));
    }
}

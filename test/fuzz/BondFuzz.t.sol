// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BondMath} from "../../src/libraries/BondMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract BondFuzzTest is Test {
    function testFuzz_floor_is_at_least_the_minimum(uint96 exposure) public pure {
        assertGe(BondMath.exposureFloor(exposure), Constants.MIN_BOND);
    }

    function testFuzz_floor_monotone(uint96 a, uint96 b) public pure {
        if (a <= b) assertLe(BondMath.exposureFloor(a), BondMath.exposureFloor(b));
        else assertGe(BondMath.exposureFloor(a), BondMath.exposureFloor(b));
    }

    function testFuzz_floor_above_minimum_is_the_exposure(uint96 exposure) public pure {
        vm.assume(exposure >= Constants.MIN_BOND);
        assertEq(BondMath.exposureFloor(exposure), uint256(exposure));
    }

    function testFuzz_priceable_equivalence(uint96 bond, uint96 exposure) public pure {
        assertEq(BondMath.isPriceable(bond, exposure), uint256(bond) >= BondMath.exposureFloor(exposure));
    }

    function testFuzz_charge_conserves_value(uint96 bond, uint96 amount) public pure {
        (uint256 paid, uint256 shortfall) = BondMath.chargeable(bond, amount);
        assertEq(paid + shortfall, uint256(amount));
    }

    function testFuzz_charge_never_exceeds_the_bond(uint96 bond, uint96 amount) public pure {
        (uint256 paid, ) = BondMath.chargeable(bond, amount);
        assertLe(paid, uint256(bond));
    }

    function testFuzz_charge_is_full_when_covered(uint96 amount) public pure {
        vm.assume(amount > 0);
        (uint256 paid, uint256 shortfall) = BondMath.chargeable(uint256(amount) * 2, amount);
        assertEq(paid, uint256(amount));
        assertEq(shortfall, 0);
    }

    function testFuzz_withdrawable_is_bounded_by_the_bond(uint96 bond, uint96 exposure, uint96 request) public pure {
        assertLe(BondMath.withdrawable(bond, exposure, request), uint256(bond));
    }

    function testFuzz_withdrawable_honours_the_request(uint96 bond, uint96 exposure, uint96 request) public pure {
        uint256 allowed = BondMath.withdrawable(bond, exposure, request);
        uint256 spare = uint256(bond) > BondMath.exposureFloor(exposure)
            ? uint256(bond) - BondMath.exposureFloor(exposure)
            : 0;
        assertEq(allowed, uint256(request) < spare ? uint256(request) : spare);
    }

    function testFuzz_priceable_survives_a_withdrawal(uint96 bond, uint96 exposure, uint96 request) public {
        uint256 allowed = BondMath.withdrawable(bond, exposure, request);
        uint256 remaining = uint256(bond) - allowed;
        if (BondMath.isPriceable(bond, exposure)) assertGe(remaining, BondMath.exposureFloor(exposure));
    }
}

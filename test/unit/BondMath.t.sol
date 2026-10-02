// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BondMath} from "../../src/libraries/BondMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract BondMathTest is Test {
    function test_floor_at_least_minimum() public pure {
        assertEq(BondMath.exposureFloor(0, Constants.MIN_BOND), Constants.MIN_BOND);
    }

    function test_floor_tracks_exposure_one_to_one() public pure {
        assertEq(BondMath.exposureFloor(5e18, Constants.MIN_BOND), 5e18);
    }

    function test_floor_above_minimum_scales() public pure {
        assertEq(BondMath.exposureFloor(100e18, Constants.MIN_BOND), 100e18);
    }

    function test_priceable_exact_floor() public pure {
        assertTrue(BondMath.isPriceable(1e18, 1e18, Constants.MIN_BOND));
    }

    function test_not_priceable_below_floor() public pure {
        assertFalse(BondMath.isPriceable(0.5e18, 1e18, Constants.MIN_BOND));
    }

    function test_priceable_zero_exposure_needs_minimum() public pure {
        assertTrue(BondMath.isPriceable(Constants.MIN_BOND, 0, Constants.MIN_BOND));
        assertFalse(BondMath.isPriceable(Constants.MIN_BOND - 1, 0, Constants.MIN_BOND));
    }

    function test_charge_partial() public pure {
        (uint256 paid, uint256 shortfall) = BondMath.chargeable(1e18, 3e18);
        assertEq(paid, 1e18);
        assertEq(shortfall, 2e18);
    }

    function test_charge_full() public pure {
        (uint256 paid, uint256 shortfall) = BondMath.chargeable(10e18, 3e18);
        assertEq(paid, 3e18);
        assertEq(shortfall, 0);
    }

    function test_charge_exact() public pure {
        (uint256 paid, uint256 shortfall) = BondMath.chargeable(3e18, 3e18);
        assertEq(paid, 3e18);
        assertEq(shortfall, 0);
    }

    function test_charge_zero_bond() public pure {
        (uint256 paid, uint256 shortfall) = BondMath.chargeable(0, 3e18);
        assertEq(paid, 0);
        assertEq(shortfall, 3e18);
    }

    function test_withdraw_blocked_at_floor() public pure {
        assertEq(BondMath.withdrawable(1e18, 1e18, 1e18, Constants.MIN_BOND), 0);
    }

    function test_withdraw_only_spare() public pure {
        assertEq(BondMath.withdrawable(5e18, 1e18, 10e18, Constants.MIN_BOND), 4e18);
    }

    function test_withdraw_request_below_spare() public pure {
        assertEq(BondMath.withdrawable(5e18, 1e18, 2e18, Constants.MIN_BOND), 2e18);
    }

    function test_withdraw_below_minimum_exposure() public pure {
        assertEq(BondMath.withdrawable(Constants.MIN_BOND, 0, 1e18, Constants.MIN_BOND), 0);
    }

    function testFuzz_floor_monotone(uint96 exposureA, uint96 exposureB) public pure {
        uint256 a = uint256(exposureA);
        uint256 b = uint256(exposureB);
        if (a <= b) assertLe(BondMath.exposureFloor(a, Constants.MIN_BOND), BondMath.exposureFloor(b, Constants.MIN_BOND));
        else assertGe(BondMath.exposureFloor(a, Constants.MIN_BOND), BondMath.exposureFloor(b, Constants.MIN_BOND));
    }

    function testFuzz_charge_conserves(uint96 bond, uint96 amount) public pure {
        (uint256 paid, uint256 shortfall) = BondMath.chargeable(uint256(bond), uint256(amount));
        assertEq(paid + shortfall, uint256(amount));
        assertLe(paid, uint256(bond));
    }

    function testFuzz_priceable_iff_bond_ge_floor(uint96 bond, uint96 exposure) public pure {
        bool priceable = BondMath.isPriceable(uint256(bond), uint256(exposure), Constants.MIN_BOND);
        assertEq(priceable, uint256(bond) >= BondMath.exposureFloor(uint256(exposure), Constants.MIN_BOND));
    }

    function testFuzz_withdrawable_never_breaks_floor(uint96 bond, uint96 exposure, uint96 req) public pure {
        uint256 b = uint256(bond);
        uint256 e = uint256(exposure);
        uint256 allowed = BondMath.withdrawable(b, e, uint256(req));
        assertLe(allowed, b);
        assertTrue(b - allowed >= BondMath.exposureFloor(e, Constants.MIN_BOND) || allowed == 0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract WaterfallMathTest is Test {
    function test_split_full_claim_consumes_pot() public pure {
        WaterfallMath.Split memory s = WaterfallMath.split(100e18, 100e18, Constants.BOUNTY_BPS);
        assertEq(s.toBorrower, 100e18);
        assertEq(s.toProver, 0);
        assertEq(s.toBond, 0);
    }

    function test_split_partial_claim() public pure {
        WaterfallMath.Split memory s = WaterfallMath.split(100e18, 40e18, Constants.BOUNTY_BPS);
        assertEq(s.toBorrower, 40e18);
        assertEq(s.toProver, 12e18); // 20% of the remaining 60
        assertEq(s.toBond, 48e18);
    }

    function test_split_zero_claim() public pure {
        WaterfallMath.Split memory s = WaterfallMath.split(50e18, 0, Constants.BOUNTY_BPS);
        assertEq(s.toBorrower, 0);
        assertEq(s.toProver, 10e18);
        assertEq(s.toBond, 40e18);
    }

    function test_split_zero_bounty() public pure {
        WaterfallMath.Split memory s = WaterfallMath.split(50e18, 0, 0);
        assertEq(s.toProver, 0);
        assertEq(s.toBond, 50e18);
    }

    function test_split_full_bounty() public pure {
        WaterfallMath.Split memory s = WaterfallMath.split(50e18, 0, uint16(Constants.BPS));
        assertEq(s.toProver, 50e18);
        assertEq(s.toBond, 0);
    }

    function test_split_empty_pot() public pure {
        WaterfallMath.Split memory s = WaterfallMath.split(0, 10e18, Constants.BOUNTY_BPS);
        assertEq(s.toBorrower, 0);
        assertEq(s.toProver, 0);
        assertEq(s.toBond, 0);
    }

    function test_shortfall_when_pot_small() public pure {
        assertEq(WaterfallMath.shortfall(10e18, 25e18), 15e18);
    }

    function test_shortfall_zero_when_covered() public pure {
        assertEq(WaterfallMath.shortfall(30e18, 25e18), 0);
    }

    function test_stake_floor_uses_proportional() public pure {
        assertEq(WaterfallMath.stakeFloor(1_000e18, Constants.MIN_STAKE_ABSOLUTE_18), 10e18);
    }

    function test_stake_floor_uses_absolute_for_tiny_bonus() public pure {
        assertEq(WaterfallMath.stakeFloor(1, Constants.MIN_STAKE_ABSOLUTE_18), Constants.MIN_STAKE_ABSOLUTE_18);
    }

    function testFuzz_split_conserves(uint96 available, uint96 claim, uint16 bountyBps) public pure {
        bountyBps = uint16(bound(bountyBps, 0, uint16(Constants.BPS)));
        WaterfallMath.Split memory s = WaterfallMath.split(uint256(available), uint256(claim), bountyBps);
        assertEq(s.toBorrower + s.toProver + s.toBond + s.remainder, uint256(available));
    }

    function testFuzz_split_borrower_never_exceeds_claim(uint96 available, uint96 claim) public pure {
        WaterfallMath.Split memory s = WaterfallMath.split(uint256(available), uint256(claim), Constants.BOUNTY_BPS);
        assertLe(s.toBorrower, uint256(claim));
    }

    function testFuzz_stake_floor_minimum(uint96 bonus) public pure {
        assertGe(WaterfallMath.stakeFloor(uint256(bonus), Constants.MIN_STAKE_ABSOLUTE_18), Constants.MIN_STAKE_ABSOLUTE_18);
    }
}

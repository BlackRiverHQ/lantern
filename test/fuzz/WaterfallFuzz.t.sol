// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract WaterfallFuzzTest is Test {
    function _split(uint96 pot, uint96 claim, uint16 bps) internal pure returns (WaterfallMath.Split memory) {
        return WaterfallMath.split(pot, claim, uint16(bound(bps, 0, Constants.BPS)));
    }

    function testFuzz_order_is_borrower_then_prover_then_bond(uint96 pot, uint96 claim, uint16 bps) public pure {
        WaterfallMath.Split memory s = _split(pot, claim, bps);
        if (s.toProver > 0) assertEq(s.toBorrower, uint256(claim) < uint256(pot) ? uint256(claim) : uint256(pot));
    }

    function testFuzz_borrower_is_capped_by_the_claim(uint96 pot, uint96 claim, uint16 bps) public pure {
        assertLe(_split(pot, claim, bps).toBorrower, uint256(claim));
    }

    function testFuzz_nothing_exceeds_the_pot(uint96 pot, uint96 claim, uint16 bps) public pure {
        WaterfallMath.Split memory s = _split(pot, claim, bps);
        assertLe(s.toBorrower + s.toProver + s.toBond, uint256(pot));
    }

    function testFuzz_conservation(uint96 pot, uint96 claim, uint16 bps) public pure {
        WaterfallMath.Split memory s = _split(pot, claim, bps);
        assertEq(s.toBorrower + s.toProver + s.toBond + s.remainder, uint256(pot));
    }

    function testFuzz_prover_share_is_the_bounty(uint96 pot, uint96 claim, uint16 bps) public pure {
        uint16 b = uint16(bound(bps, 0, Constants.BPS));
        WaterfallMath.Split memory s = WaterfallMath.split(pot, claim, b);
        uint256 bountyBase = s.toBorrower >= uint256(pot) ? 0 : uint256(pot) - s.toBorrower;
        assertLe(s.toProver, (bountyBase * b) / Constants.BPS);
    }

    function testFuzz_zero_pot_pays_nothing(uint96 claim, uint16 bps) public pure {
        WaterfallMath.Split memory s = _split(0, claim, bps);
        assertEq(s.toBorrower + s.toProver + s.toBond, 0);
    }

    function testFuzz_stake_floor_has_an_absolute_minimum(uint96 bonus) public pure {
        assertGe(WaterfallMath.stakeFloor(bonus), Constants.MIN_STAKE_ABSOLUTE);
    }

    function testFuzz_stake_floor_is_one_percent_above_the_absolute(uint96 bonus) public pure {
        vm.assume(bonus > Constants.MIN_STAKE_ABSOLUTE * 100);
        assertEq(WaterfallMath.stakeFloor(bonus), (uint256(bonus) * Constants.MIN_STAKE_BPS) / Constants.BPS);
    }

    function testFuzz_shortfall_is_the_uncovered_part(uint96 available, uint96 owed) public pure {
        uint256 shortfall = WaterfallMath.shortfall(available, owed);
        assertEq(shortfall + (uint256(available) < uint256(owed) ? uint256(available) : uint256(owed)), uint256(owed));
    }

    function testFuzz_full_bounty_leaves_nothing_for_the_bond(uint96 pot) public pure {
        WaterfallMath.Split memory s = WaterfallMath.split(pot, 0, Constants.BPS);
        assertEq(s.toBond, 0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

contract LanternFuzzTest is LanternTest {
    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
    }

    function testFuzz_honest_release_pays_exactly_the_bonus(uint96 bonusSeed) public {
        uint64 round = _push(FEED, 100e18);
        uint256 bonus = bound(uint256(bonusSeed), 1e15, 100e18);
        _liquidate(1, round, bonus);
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 before = token.balanceOf(LIQUIDATOR);
        lantern.release(1);
        assertEq(token.balanceOf(LIQUIDATOR), before + bonus);
    }

    function testFuzz_held_total_equals_the_bonus(uint96 bonusSeed) public {
        uint64 round = _push(FEED, 100e18);
        uint256 bonus = bound(uint256(bonusSeed), 1e15, 100e18);
        _liquidate(1, round, bonus);
        assertEq(lantern.heldTotal(), bonus);
    }

    function testFuzz_exposure_tracks_the_bonus(uint96 bonusSeed) public {
        uint64 round = _push(FEED, 100e18);
        uint256 bonus = bound(uint256(bonusSeed), 1e15, 100e18);
        _liquidate(1, round, bonus);
        assertEq(lantern.exposureOf(FEED), bonus);
    }

    function testFuzz_a_liquidation_beyond_the_bond_always_reverts(uint96 overSeed) public {
        uint64 round = _push(FEED, 100e18);
        uint256 over = BOND + bound(uint256(overSeed), 1, 1e18);
        vm.prank(LIQUIDATOR);
        vm.expectRevert();
        market.liquidate(1, FEED, round, over, BORROWER);
    }

    function testFuzz_upheld_redirect_pays_the_borrower_the_bonus(uint96 bonusSeed) public {
        uint256 bonus = bound(uint256(bonusSeed), 1e15, 100e18);
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, bonus);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, WaterfallMath.stakeFloor(bonus, Constants.MIN_STAKE_ABSOLUTE_18));
        uint256 before = token.balanceOf(BORROWER);
        lantern.adjudicate(1);
        assertEq(token.balanceOf(BORROWER), before + bonus);
    }

    function testFuzz_bounty_is_always_the_configured_share(uint96 bonusSeed) public {
        uint256 bonus = bound(uint256(bonusSeed), 1e15, 100e18);
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, bonus);
        uint256 stake = WaterfallMath.stakeFloor(bonus, Constants.MIN_STAKE_ABSOLUTE_18);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        uint256 proverBefore = token.balanceOf(PROVER);
        uint256 bondBefore = lantern.bondOf(FEED);
        lantern.adjudicate(1);
        uint256 bounty = (bonus * BOUNTY) / Constants.BPS;
        assertEq(token.balanceOf(PROVER), proverBefore + stake + bounty);
        assertEq(bondBefore - lantern.bondOf(FEED), bounty);
    }

    function testFuzz_exposure_returns_to_zero_after_settlement(uint96 bonusSeed) public {
        uint64 round = _push(FEED, 100e18);
        uint256 bonus = bound(uint256(bonusSeed), 1e15, 100e18);
        _liquidate(1, round, bonus);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        assertEq(lantern.exposureOf(FEED), 0);
        assertEq(lantern.heldTotal(), 0);
    }

    function testFuzz_solvency_after_a_settlement(uint96 bonusSeed) public {
        uint64 round = _push(FEED, 100e18);
        uint256 bonus = bound(uint256(bonusSeed), 1e15, 100e18);
        _liquidate(1, round, bonus);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        assertEq(token.balanceOf(address(lantern)), lantern.bondOf(FEED) + lantern.heldTotal());
    }

    function testFuzz_priceability_is_exactly_the_floor(uint96 withdrawSeed) public {
        _push(FEED, 100e18);
        vm.prank(OPERATOR);
        lantern.withdrawBond(FEED, bound(uint256(withdrawSeed), 1, BOND));
        assertEq(lantern.isPriceable(FEED), lantern.bondOf(FEED) >= lantern.exposureFloor(FEED));
    }

    function testFuzz_refused_forfeits_exactly_the_stake(uint96 stakeSeed) public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, 10e18);
        uint256 stake = bound(uint256(stakeSeed), WaterfallMath.stakeFloor(10e18, Constants.MIN_STAKE_ABSOLUTE_18), 5e18);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        uint256 before = token.balanceOf(LIQUIDATOR);
        assertFalse(lantern.adjudicate(1));
        assertEq(token.balanceOf(LIQUIDATOR), before + stake);
    }
}

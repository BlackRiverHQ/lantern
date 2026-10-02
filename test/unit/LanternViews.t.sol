// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Lantern} from "../../src/core/Lantern.sol";
import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

contract LanternViewsTest is LanternTest {
    uint256 internal constant BONUS = 10e18;
    uint64 internal round;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
    }

    function test_asset_is_wired() public view {
        assertEq(address(lantern.asset()), address(token));
    }

    function test_market_is_wired() public view {
        assertEq(lantern.market(), address(market));
    }

    function test_window_is_wired() public view {
        assertEq(lantern.holdWindow(), WINDOW);
    }

    function test_bounty_is_wired() public view {
        assertEq(lantern.bountyBps(), BOUNTY);
    }

    function test_registry_is_a_real_contract() public view {
        assertTrue(address(lantern.reg()) != address(0));
    }

    function test_registry_is_built_by_lantern() public view {
        assertEq(lantern.reg().controller(), address(lantern));
    }

    function test_operator_view() public view {
        assertEq(lantern.operatorOf(FEED), OPERATOR);
    }

    function test_bond_view() public view {
        assertEq(lantern.bondOf(FEED), BOND);
    }

    function test_exposure_view() public view {
        assertEq(lantern.exposureOf(FEED), BONUS);
    }

    function test_exposure_floor_view() public view {
        assertEq(lantern.exposureFloor(FEED), BONUS);
    }

    function test_held_total_view() public view {
        assertEq(lantern.heldTotal(), BONUS);
    }

    function test_feed_errors_view() public view {
        assertEq(lantern.feedErrors(FEED), 0);
    }

    function test_recorded_counter_view() public view {
        assertEq(lantern.recorded(), 1);
    }

    function test_challenges_opened_view() public view {
        assertEq(lantern.challengesOpened(), 0);
    }

    function test_escrow_view_fields() public view {
        Lantern.Escrow memory e = lantern.escrowOf(1);
        assertTrue(e.exists);
        assertEq(e.feedId, FEED);
        assertEq(e.round, round);
        assertEq(e.bonus, BONUS);
        assertEq(e.liquidator, LIQUIDATOR);
        assertEq(e.borrower, BORROWER);
        assertEq(e.outcome, 0);
    }

    function test_unknown_escrow_view_is_empty() public view {
        assertFalse(lantern.escrowOf(999).exists);
    }

    function test_challenge_view_defaults() public view {
        assertEq(lantern.challengeOf(1).prover, address(0));
    }

    function test_challenge_view_after_opening() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18));
        Lantern.ChallengeRec memory c = lantern.challengeOf(1);
        assertEq(c.prover, PROVER);
        assertEq(c.rule, uint8(IChallenge.Rule.SELF_HISTORY));
        assertEq(c.stake, WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18));
    }

    function test_bonus_settled_is_false_while_held() public view {
        assertFalse(lantern.bonusSettled(1));
    }

    function test_bonus_outcome_is_open_while_held() public view {
        assertEq(lantern.bonusOutcome(1), 0);
    }

    function test_snapshot_view_is_readable() public view {
        assertEq(lantern.reg().history().snapshot(FEED).anchor, 100e18);
    }

    function test_band_view_matches_the_history() public view {
        (uint256 lo, uint256 hi) = lantern.reg().band(FEED);
        (uint256 lo2, uint256 hi2) = lantern.reg().history().bandOf(FEED);
        assertEq(lo, lo2);
        assertEq(hi, hi2);
    }

    function test_last_report_view() public view {
        assertEq(lantern.reg().lastReport(FEED).round, round);
    }

    function test_priceable_alias_agrees() public view {
        assertEq(lantern.priceable(FEED), lantern.isPriceable(FEED));
    }

    function test_feed_is_priceable_while_covered() public view {
        assertTrue(lantern.isPriceable(FEED));
    }
}

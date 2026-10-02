// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

contract LanternAdjudicateTest is LanternTest {
    uint256 internal constant BONUS = 10e18;
    uint256 internal stake;
    uint64 internal round;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
        stake = WaterfallMath.stakeFloor(BONUS);
    }

    function _bounty() internal pure returns (uint256) {
        return (BONUS * BOUNTY) / Constants.BPS;
    }

    /// @notice Warm feed, contestable print, liquidation, challenge. The standard caught case.
    function _caughtSelfHistory() internal {
        _warm(FEED, 40);
        round = _suspiciousPrint(FEED);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
    }

    // --- rule one: the value contradicts the feed's own history ------------------

    function test_selfHistory_upheld() public {
        _caughtSelfHistory();
        assertTrue(lantern.adjudicate(1));
    }

    function test_selfHistory_borrower_is_made_whole() public {
        _caughtSelfHistory();
        uint256 before = token.balanceOf(BORROWER);
        lantern.adjudicate(1);
        assertEq(token.balanceOf(BORROWER), before + BONUS);
    }

    function test_selfHistory_prover_paid_stake_and_bounty() public {
        _caughtSelfHistory();
        uint256 before = token.balanceOf(PROVER);
        lantern.adjudicate(1);
        assertEq(token.balanceOf(PROVER), before + stake + _bounty());
    }

    function test_selfHistory_bond_is_charged_the_bounty() public {
        _caughtSelfHistory();
        uint256 before = lantern.bondOf(FEED);
        lantern.adjudicate(1);
        assertEq(lantern.bondOf(FEED), before - _bounty());
    }

    function test_selfHistory_error_count_moves() public {
        _caughtSelfHistory();
        lantern.adjudicate(1);
        assertEq(lantern.feedErrors(FEED), 1);
    }

    function test_selfHistory_exposure_is_released() public {
        _caughtSelfHistory();
        lantern.adjudicate(1);
        assertEq(lantern.exposureOf(FEED), 0);
    }

    function test_selfHistory_held_total_drops() public {
        _caughtSelfHistory();
        lantern.adjudicate(1);
        assertEq(lantern.heldTotal(), 0);
    }

    function test_selfHistory_outcome_is_redirected() public {
        _caughtSelfHistory();
        lantern.adjudicate(1);
        assertEq(lantern.bonusOutcome(1), 2);
    }

    function test_selfHistory_marks_upheld() public {
        _caughtSelfHistory();
        lantern.adjudicate(1);
        assertTrue(lantern.challengeOf(1).upheld);
    }

    function test_selfHistory_resolved() public {
        _caughtSelfHistory();
        lantern.adjudicate(1);
        assertTrue(lantern.challengeOf(1).resolved);
    }

    function test_selfHistory_refused_on_an_honest_print() public {
        _warm(FEED, 40);
        vm.warp(block.timestamp + 60);
        round = _push(FEED, 103e18); // inside the warmed band
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        assertFalse(lantern.adjudicate(1));
    }

    function test_refused_keeps_the_bonus_held() public {
        _warm(FEED, 40);
        vm.warp(block.timestamp + 60);
        round = _push(FEED, 103e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        lantern.adjudicate(1);
        assertEq(lantern.heldTotal(), BONUS);
    }

    function test_refused_forfeits_the_stake_to_the_liquidator() public {
        _warm(FEED, 40);
        vm.warp(block.timestamp + 60);
        round = _push(FEED, 103e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        uint256 before = token.balanceOf(LIQUIDATOR);
        lantern.adjudicate(1);
        assertEq(token.balanceOf(LIQUIDATOR), before + stake);
    }

    function test_refused_marks_resolved_but_not_upheld() public {
        _warm(FEED, 40);
        vm.warp(block.timestamp + 60);
        round = _push(FEED, 103e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        lantern.adjudicate(1);
        assertTrue(lantern.challengeOf(1).resolved);
        assertFalse(lantern.challengeOf(1).upheld);
    }

    function test_refused_leaves_the_escrow_open() public {
        _warm(FEED, 40);
        vm.warp(block.timestamp + 60);
        round = _push(FEED, 103e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        lantern.adjudicate(1);
        assertEq(lantern.bonusOutcome(1), 0);
    }

    function test_refused_does_not_touch_the_bond() public {
        _warm(FEED, 40);
        vm.warp(block.timestamp + 60);
        round = _push(FEED, 103e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        uint256 before = lantern.bondOf(FEED);
        lantern.adjudicate(1);
        assertEq(lantern.bondOf(FEED), before);
    }

    // --- rule two: one round, two values ----------------------------------------

    function test_slotUniqueness_upheld_after_a_recorded_conflict() public {
        round = _push(FEED, 100e18);
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, 105e18, round, uint64(block.timestamp), keccak256("revised"), OPERATOR);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SLOT_UNIQUENESS, stake);
        assertTrue(lantern.adjudicate(1));
    }

    function test_slotUniqueness_refused_without_a_conflict() public {
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SLOT_UNIQUENESS, stake);
        assertFalse(lantern.adjudicate(1));
    }

    function test_slotUniqueness_returns_the_observed_other_value() public {
        round = _push(FEED, 100e18);
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, 105e18, round, uint64(block.timestamp), keccak256("revised"), OPERATOR);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SLOT_UNIQUENESS, stake);
        assertTrue(lantern.adjudicate(1));
        assertEq(lantern.reg().book().slotOf(FEED, round).otherValue, 105e18);
    }

    // --- rule three: the print was already old when it priced --------------------

    function test_roundOrdering_upheld_when_the_print_was_stale() public {
        round = _push(FEED, 100e18);
        vm.warp(block.timestamp + Constants.STALENESS_BOUND + 1);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.ROUND_ORDERING, stake);
        assertTrue(lantern.adjudicate(1));
    }

    function test_roundOrdering_refused_when_the_print_was_fresh() public {
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.ROUND_ORDERING, stake);
        assertFalse(lantern.adjudicate(1));
    }

    function test_roundOrdering_refused_exactly_at_the_bound() public {
        round = _push(FEED, 100e18);
        vm.warp(block.timestamp + Constants.STALENESS_BOUND);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.ROUND_ORDERING, stake);
        assertFalse(lantern.adjudicate(1));
    }

    // --- rule four: a payload signed for another asset --------------------------

    function test_payloadProvenance_upheld_on_cross_feed_reuse() public {
        _openFeed(FEED_B);
        bytes32 shared = keccak256("shared-payload");
        _pushWithPayload(FEED_B, 100e18, shared);
        uint64 rA = _pushWithPayload(FEED, 100e18, shared);
        _liquidateOn(FEED, 1, rA, BONUS);
        _challenge(1, IChallenge.Rule.PAYLOAD_PROVENANCE, stake);
        assertTrue(lantern.adjudicate(1));
    }

    function test_payloadProvenance_refused_when_the_payload_is_its_own() public {
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.PAYLOAD_PROVENANCE, stake);
        assertFalse(lantern.adjudicate(1));
    }

    function test_cross_feed_reuse_is_visible_on_the_book() public {
        _openFeed(FEED_B);
        bytes32 shared = keccak256("shared-payload");
        _pushWithPayload(FEED_B, 100e18, shared);
        _pushWithPayload(FEED, 100e18, shared);
        assertEq(lantern.reg().book().payloadFeed(shared), FEED_B);
    }

    // --- adjudication hygiene ---------------------------------------------------

    function test_upheld_returns_true() public {
        _caughtSelfHistory();
        assertTrue(lantern.adjudicate(1));
    }

    function test_refused_returns_false() public {
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        assertFalse(lantern.adjudicate(1));
    }

    function test_adjudicate_twice_reverts() public {
        _caughtSelfHistory();
        lantern.adjudicate(1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 1));
        lantern.adjudicate(1);
    }

    function test_adjudicate_without_a_challenge_reverts() public {
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownChallenge.selector, 1));
        lantern.adjudicate(1);
    }

    function test_adjudicate_unknown_liquidation_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownLiquidation.selector, 77));
        lantern.adjudicate(77);
    }

    function test_adjudicate_after_release_reverts() public {
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 1));
        lantern.adjudicate(1);
    }

    function test_anyone_may_adjudicate() public {
        _caughtSelfHistory();
        vm.prank(OTHER);
        assertTrue(lantern.adjudicate(1));
    }

    function test_two_liquidations_are_adjudicated_independently() public {
        _warm(FEED, 40);
        uint64 good = _push(FEED, 103e18);
        _liquidate(1, good, BONUS);
        uint64 bad = _suspiciousPrint(FEED);
        _liquidate(2, bad, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        _challenge(2, IChallenge.Rule.SELF_HISTORY, stake);
        assertFalse(lantern.adjudicate(1));
        assertTrue(lantern.adjudicate(2));
    }
}

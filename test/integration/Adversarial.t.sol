// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

/// @notice Races, boundaries and parties that go missing. Each test is one way a participant can
///         behave inside the allowed surface, and what the contract does about it.
contract AdversarialTest is LanternTest {
    uint256 internal constant BONUS = 10e18;
    address internal constant WATCHER_A = address(0xA1);
    address internal constant WATCHER_B = address(0xB1);

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
        _openFeed(FEED_B);
        vm.prank(OPERATOR);
        lantern.setPeerFeed(FEED, FEED_B);
    }

    function _stake() internal pure returns (uint256) {
        return WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
    }

    /// A liquidation priced on a print 15% away from the declared peer for the same round.
    function _contradicted(uint256 id) internal returns (uint64 round) {
        round = _pushWithPayload(FEED, 100e18, keccak256(abi.encode("subject", id)));
        vm.prank(OPERATOR);
        lantern.recordReport(FEED_B, 115e18, round, uint64(block.timestamp), keccak256(abi.encode("peer", id)), OPERATOR);
        _liquidate(id, round, BONUS);
    }

    function _deadline(uint256 id) internal view returns (uint64) {
        return lantern.escrowOf(id).deadline;
    }

    // --- the window boundary ----------------------------------------------------------------

    function test_a_challenge_one_second_before_the_deadline_is_accepted() public {
        _contradicted(1);
        vm.warp(_deadline(1) - 1);
        _challenge(1, IChallenge.Rule.CROSS_SOURCE, _stake());
        assertEq(lantern.challengeOf(1).prover, PROVER);
    }

    function test_a_challenge_exactly_at_the_deadline_is_refused() public {
        _contradicted(1);
        vm.warp(_deadline(1));
        token.mint(PROVER, _stake());
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.WindowClosed.selector, 1, _deadline(1)));
        lantern.openChallenge(1, IChallenge.Rule.CROSS_SOURCE, hex"01", _stake());
        vm.stopPrank();
    }

    function test_release_one_second_before_the_deadline_is_refused() public {
        _contradicted(1);
        vm.warp(_deadline(1) - 1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.WindowOpen.selector, 1, _deadline(1)));
        lantern.release(1);
    }

    /// At the deadline exactly, challenging has stopped and releasing has started: there is no
    /// second in which both or neither are possible.
    function test_the_deadline_is_one_instant_for_both_sides() public {
        _contradicted(1);
        vm.warp(_deadline(1));
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1);
    }

    // --- races --------------------------------------------------------------------------------

    /// Two challengers who both saw the same contradiction: the first wins, the second reverts
    /// before any of its money moves.
    function test_two_challengers_race_and_the_loser_keeps_its_stake() public {
        _contradicted(1);
        _challengeAs(1, IChallenge.Rule.CROSS_SOURCE, _stake(), WATCHER_A);

        token.mint(WATCHER_B, _stake());
        vm.startPrank(WATCHER_B);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.ChallengeAlreadyOpen.selector, 1));
        lantern.openChallenge(1, IChallenge.Rule.CROSS_SOURCE, hex"01", _stake());
        vm.stopPrank();
        assertEq(token.balanceOf(WATCHER_B), _stake(), "the loser of the race is not charged");
    }

    /// Two watchers both try to adjudicate the same challenge. One verdict, one payout.
    function test_two_adjudicators_race_and_the_verdict_happens_once() public {
        _contradicted(1);
        _challengeAs(1, IChallenge.Rule.CROSS_SOURCE, _stake(), WATCHER_A);
        uint256 bondBefore = lantern.bondOf(FEED);

        vm.prank(WATCHER_A);
        assertTrue(lantern.adjudicate(1));
        vm.prank(WATCHER_B);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 1));
        lantern.adjudicate(1);

        assertEq(token.balanceOf(BORROWER), BONUS, "the borrower is paid once");
        assertEq(bondBefore - lantern.bondOf(FEED), BONUS * BOUNTY / 10_000, "the bond is charged once");
        assertEq(lantern.feedErrors(FEED), 1, "the error is counted once");
    }

    /// Release and adjudicate cannot both settle one escrow, in either order.
    function test_an_upheld_escrow_cannot_also_be_released() public {
        _contradicted(1);
        _challenge(1, IChallenge.Rule.CROSS_SOURCE, _stake());
        lantern.adjudicate(1);
        vm.warp(_deadline(1) + 1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 1));
        lantern.release(1);
    }

    function test_a_released_escrow_cannot_then_be_challenged_or_adjudicated() public {
        _contradicted(1);
        vm.warp(_deadline(1));
        lantern.release(1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 1));
        lantern.adjudicate(1);
        assertEq(lantern.heldTotal(), 0);
    }

    // --- parties that disappear ---------------------------------------------------------------

    /// The operator walks away after the liquidation. Nothing a held case needs is the operator's
    /// to give: a stranger challenges, a stranger adjudicates, the bounty comes out of the bond.
    function test_an_operator_who_vanishes_cannot_stop_a_case_settling() public {
        _contradicted(1);
        // No call from OPERATOR from here on.
        _challengeAs(1, IChallenge.Rule.CROSS_SOURCE, _stake(), WATCHER_A);
        vm.prank(OTHER);
        assertTrue(lantern.adjudicate(1));
        assertEq(lantern.bonusOutcome(1), 2);
    }

    /// The liquidator and the borrower never come back. Payouts are pushes to recorded addresses, so
    /// neither has to sign anything for the case to finish.
    function test_settlement_needs_no_signature_from_liquidator_or_borrower() public {
        _contradicted(1);
        _contradicted(2);
        vm.warp(_deadline(2));
        vm.prank(OTHER);
        lantern.release(1);
        assertEq(token.balanceOf(LIQUIDATOR) >= BONUS, true, "released to the recorded liquidator");
    }

    /// The challenger stakes and disappears. Anyone can still adjudicate on the merits, at any time,
    /// and the bounty goes to the address that staked, not to whoever pressed the button.
    function test_an_absent_challenger_is_still_paid_when_a_stranger_adjudicates() public {
        _contradicted(1);
        _challenge(1, IChallenge.Rule.CROSS_SOURCE, _stake());
        vm.warp(_deadline(1) + Constants.CHALLENGE_GRACE + 1 days);
        vm.prank(OTHER);
        assertTrue(lantern.adjudicate(1));
        assertEq(token.balanceOf(PROVER), _stake() + BONUS * BOUNTY / 10_000);
        assertEq(token.balanceOf(OTHER), 0, "pressing the button earns nothing");
    }

    // --- the bond running out -----------------------------------------------------------------

    /// An operator that will not replenish: once caught, its requirement rises, and if its bond does
    /// not follow, it cannot price another liquidation. Held cases are unaffected.
    function test_a_feed_that_will_not_top_up_cannot_price_again() public {
        bytes32 thin = keccak256("FEED:THIN");
        token.mint(OPERATOR, 1e18);
        vm.startPrank(OPERATOR);
        lantern.registerFeed(thin, keccak256("SIGNERS"), 18);
        lantern.depositBond(thin, lantern.minBond());
        vm.stopPrank();
        assertEq(lantern.requiredBond(thin), lantern.minBond());

        // Withdrawal down to the floor is allowed and leaves it exactly priceable; below is not.
        vm.prank(OPERATOR);
        vm.expectRevert();
        lantern.withdrawBond(thin, 1);
        assertTrue(lantern.priceable(thin));
    }

    // --- what a hostile challenger can and cannot take ----------------------------------------

    /// A wrong challenge pays the liquidator and leaves the bonus held. The challenger cannot reach
    /// the bonus or the bond by being wrong.
    function test_a_wrong_challenge_cannot_reach_the_bonus_or_the_bond() public {
        uint64 round = _pushWithPayload(FEED, 100e18, keccak256("honest"));
        vm.prank(OPERATOR);
        lantern.recordReport(FEED_B, 101e18, round, uint64(block.timestamp), keccak256("peer-honest"), OPERATOR);
        _liquidate(1, round, BONUS);
        uint256 bondBefore = lantern.bondOf(FEED);

        _challengeAs(1, IChallenge.Rule.CROSS_SOURCE, _stake(), WATCHER_A);
        assertFalse(lantern.adjudicate(1));

        assertEq(token.balanceOf(WATCHER_A), 0, "the stake is gone");
        assertEq(lantern.bondOf(FEED), bondBefore, "the bond is untouched");
        assertEq(lantern.heldTotal(), BONUS, "the bonus is still held");
    }

    // --- the known gap ------------------------------------------------------------------------

    /// Known limitation, pinned so it cannot be forgotten: one challenge per liquidation. A
    /// liquidator can file a challenge under a rule that does not hold against its own liquidation,
    /// have it refused, and receive its own stake back as the forfeit. The rule that does hold can
    /// then no longer be filed. The cost to the liquidator is gas. Fix designed, not deployed: one
    /// challenge per (liquidation, rule), which a liquidator cannot exploit because filing the rule
    /// that holds would be upheld against it. See docs/LIMITS.md.
    function test_KNOWN_GAP_a_liquidator_can_spend_the_one_challenge_slot_on_itself() public {
        _contradicted(1);
        uint256 before = token.balanceOf(LIQUIDATOR);

        // The liquidator files SLOT_UNIQUENESS, which does not hold here, and adjudicates it.
        _challengeAs(1, IChallenge.Rule.SLOT_UNIQUENESS, _stake(), LIQUIDATOR);
        assertFalse(lantern.adjudicate(1));
        assertEq(token.balanceOf(LIQUIDATOR), before + _stake(), "the forfeit comes back to the liquidator");

        // The honest challenger, with a claim that would be upheld, is now locked out.
        token.mint(PROVER, _stake());
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.ChallengeAlreadyOpen.selector, 1));
        lantern.openChallenge(1, IChallenge.Rule.CROSS_SOURCE, hex"01", _stake());
        vm.stopPrank();
    }
}

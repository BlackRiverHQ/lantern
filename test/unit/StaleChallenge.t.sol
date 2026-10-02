// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

/// @notice An abandoned challenge must not freeze a liquidator's bonus forever. Adjudication is
///         permissionless, so a void means the claim was dropped rather than defended - and the
///         stake answers for the delay.
contract StaleChallengeTest is LanternTest {
    uint256 internal constant BONUS = 10e18;
    uint256 internal stake;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
        stake = WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
    }

    function _heldChallenge() internal returns (uint64 round) {
        round = _pushWithPayload(FEED, 100e18, keccak256("p"));
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
    }

    function test_a_fresh_challenge_cannot_be_voided() public {
        _heldChallenge();
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.ChallengeStillFresh.selector, 1));
        lantern.voidStaleChallenge(1);
    }

    function test_a_challenge_can_be_voided_after_the_grace() public {
        _heldChallenge();
        vm.warp(block.timestamp + WINDOW + Constants.CHALLENGE_GRACE + 1);
        lantern.voidStaleChallenge(1);
        assertTrue(lantern.challengeOf(1).resolved);
        assertFalse(lantern.challengeOf(1).upheld);
    }

    function test_voiding_pays_the_stake_to_the_liquidator() public {
        _heldChallenge();
        uint256 before = token.balanceOf(LIQUIDATOR);
        vm.warp(block.timestamp + WINDOW + Constants.CHALLENGE_GRACE + 1);
        lantern.voidStaleChallenge(1);
        assertEq(token.balanceOf(LIQUIDATOR) - before, stake, "the delay is answered for");
    }

    function test_a_voided_escrow_can_then_be_released() public {
        _heldChallenge();
        vm.warp(block.timestamp + WINDOW + Constants.CHALLENGE_GRACE + 1);
        lantern.voidStaleChallenge(1);
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1, "the bonus reaches the liquidator in the end");
    }

    function test_a_voided_challenge_cannot_be_adjudicated() public {
        _heldChallenge();
        vm.warp(block.timestamp + WINDOW + Constants.CHALLENGE_GRACE + 1);
        lantern.voidStaleChallenge(1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.ChallengeAlreadyResolved.selector, 1));
        lantern.adjudicate(1);
    }

    function test_voiding_needs_a_challenge() public {
        uint64 round = _pushWithPayload(FEED, 100e18, keccak256("p"));
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + WINDOW + Constants.CHALLENGE_GRACE + 1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownChallenge.selector, 1));
        lantern.voidStaleChallenge(1);
    }

    function test_voiding_an_unknown_escrow_reverts() public {
        vm.warp(block.timestamp + WINDOW + Constants.CHALLENGE_GRACE + 1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownLiquidation.selector, 99));
        lantern.voidStaleChallenge(99);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

contract LanternChallengeTest is LanternTest {
    uint256 internal constant BONUS = 10e18;
    uint64 internal round;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
    }

    function _floor() internal pure returns (uint256) {
        return WaterfallMath.stakeFloor(BONUS);
    }

    function test_challenge_accepted_inside_window() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertEq(lantern.challengeOf(1).prover, PROVER);
    }

    function test_prover_recorded() public {
        _challengeAs(1, IChallenge.Rule.SELF_HISTORY, _floor(), OTHER);
        assertEq(lantern.challengeOf(1).prover, OTHER);
    }

    function test_rule_recorded() public {
        _challenge(1, IChallenge.Rule.ROUND_ORDERING, _floor());
        assertEq(lantern.challengeOf(1).rule, uint8(IChallenge.Rule.ROUND_ORDERING));
    }

    function test_unresolved_at_open() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertFalse(lantern.challengeOf(1).resolved);
    }

    function test_not_upheld_at_open() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertFalse(lantern.challengeOf(1).upheld);
    }

    function test_stake_recorded() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertEq(lantern.challengeOf(1).stake, _floor());
    }

    function test_opened_at_is_now() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertEq(lantern.challengeOf(1).openedAt, uint64(block.timestamp));
    }

    function test_counter_moves() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertEq(lantern.challengesOpened(), 1);
    }

    function test_stake_is_pulled_in() public {
        uint256 before = token.balanceOf(address(lantern));
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertEq(token.balanceOf(address(lantern)), before + _floor());
    }

    function test_evidence_hash_stored() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertTrue(lantern.challengeOf(1).evidenceHash != bytes32(0));
    }

    function test_after_window_reverts() public {
        vm.warp(block.timestamp + WINDOW + 1);
        token.mint(PROVER, _floor());
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.WindowClosed.selector, 1, uint64(block.timestamp) - 1));
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), _floor());
        vm.stopPrank();
    }

    function test_unknown_liquidation_reverts() public {
        token.mint(PROVER, _floor());
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownLiquidation.selector, 99));
        lantern.openChallenge(99, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), _floor());
        vm.stopPrank();
    }

    function test_empty_evidence_reverts() public {
        token.mint(PROVER, _floor());
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(ILanternErrors.EmptyEvidence.selector);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, "", _floor());
        vm.stopPrank();
    }

    function test_stake_below_floor_reverts() public {
        uint256 floor = _floor();
        token.mint(PROVER, floor);
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.StakeBelowMinimum.selector, floor - 1, floor));
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), floor - 1);
        vm.stopPrank();
    }

    function test_stake_exactly_at_floor_is_accepted() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        assertEq(lantern.challengeOf(1).prover, PROVER);
    }

    function test_second_challenge_reverts() public {
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        token.mint(OTHER, _floor());
        vm.startPrank(OTHER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.ChallengeAlreadyOpen.selector, 1));
        lantern.openChallenge(1, IChallenge.Rule.ROUND_ORDERING, abi.encode(uint256(2)), _floor());
        vm.stopPrank();
    }

    function test_challenge_after_settlement_reverts() public {
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        token.mint(PROVER, _floor());
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 1));
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), _floor());
        vm.stopPrank();
    }

    function test_view_of_an_unknown_liquidation_is_empty() public view {
        assertEq(lantern.challengeOf(42).prover, address(0));
    }

    function test_floor_is_one_percent_of_the_bonus() public pure {
        assertEq(WaterfallMath.stakeFloor(1_000e18), 10e18);
    }

    function test_floor_has_an_absolute_minimum() public pure {
        assertEq(WaterfallMath.stakeFloor(1), Constants.MIN_STAKE_ABSOLUTE);
    }

    function test_anyone_may_challenge() public {
        address stranger = address(0xF00D);
        _challengeAs(1, IChallenge.Rule.SELF_HISTORY, _floor(), stranger);
        assertEq(lantern.challengeOf(1).prover, stranger);
    }

    function test_challenges_are_per_liquidation() public {
        uint64 r2 = _push(FEED, 101e18);
        _liquidate(2, r2, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _floor());
        _challenge(2, IChallenge.Rule.SELF_HISTORY, _floor());
        assertEq(lantern.challengesOpened(), 2);
    }
}

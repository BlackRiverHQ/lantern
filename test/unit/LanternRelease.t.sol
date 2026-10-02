// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

contract LanternReleaseTest is LanternTest {
    uint256 internal constant BONUS = 10e18;
    uint64 internal round;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
        round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
    }

    function _afterWindow() internal {
        vm.warp(block.timestamp + WINDOW + 1);
    }

    function test_before_the_window_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.WindowOpen.selector, 1, uint64(block.timestamp) + WINDOW));
        lantern.release(1);
    }

    function test_after_the_window_pays_the_liquidator() public {
        _afterWindow();
        uint256 before = token.balanceOf(LIQUIDATOR);
        lantern.release(1);
        assertEq(token.balanceOf(LIQUIDATOR), before + BONUS);
    }

    function test_outcome_is_released() public {
        _afterWindow();
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1);
    }

    function test_settled_flag_moves() public {
        _afterWindow();
        assertFalse(lantern.bonusSettled(1));
        lantern.release(1);
        assertTrue(lantern.bonusSettled(1));
    }

    function test_held_total_drops() public {
        _afterWindow();
        lantern.release(1);
        assertEq(lantern.heldTotal(), 0);
    }

    function test_exposure_is_released() public {
        _afterWindow();
        lantern.release(1);
        assertEq(lantern.exposureOf(FEED), 0);
    }

    function test_bond_is_untouched() public {
        _afterWindow();
        uint256 before = lantern.bondOf(FEED);
        lantern.release(1);
        assertEq(lantern.bondOf(FEED), before);
    }

    function test_double_release_reverts() public {
        _afterWindow();
        lantern.release(1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 1));
        lantern.release(1);
    }

    function test_unresolved_challenge_blocks_release() public {
        token.mint(PROVER, WaterfallMath.stakeFloor(BONUS));
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), WaterfallMath.stakeFloor(BONUS));
        vm.stopPrank();
        _afterWindow();
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.ChallengeAlreadyOpen.selector, 1));
        lantern.release(1);
    }

    function test_release_after_a_refused_challenge_works() public {
        token.mint(PROVER, WaterfallMath.stakeFloor(BONUS));
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), WaterfallMath.stakeFloor(BONUS));
        vm.stopPrank();
        lantern.adjudicate(1); // refused
        _afterWindow();
        uint256 before = token.balanceOf(LIQUIDATOR);
        lantern.release(1);
        assertEq(token.balanceOf(LIQUIDATOR), before + BONUS);
    }

    function test_release_after_an_upheld_challenge_reverts() public {
        _warm(FEED, 40);
        uint64 bad = _suspiciousPrint(FEED);
        _liquidate(2, bad, BONUS);
        _challenge(2, IChallenge.Rule.SELF_HISTORY, WaterfallMath.stakeFloor(BONUS));
        lantern.adjudicate(2);
        _afterWindow();
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 2));
        lantern.release(2);
    }

    function test_unknown_liquidation_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownLiquidation.selector, 55));
        lantern.release(55);
    }

    function test_anyone_may_release() public {
        _afterWindow();
        vm.prank(OTHER);
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1);
    }

    function test_release_does_not_touch_other_escrows() public {
        uint64 r2 = _push(FEED, 101e18);
        _liquidate(2, r2, BONUS);
        _afterWindow();
        lantern.release(1);
        assertEq(lantern.bonusOutcome(2), 0);
        assertEq(lantern.heldTotal(), BONUS);
    }

    function test_boundary_is_exclusive() public {
        vm.warp(block.timestamp + WINDOW);
        lantern.release(1); // the window closes exactly at the deadline
        assertEq(lantern.bonusOutcome(1), 1);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {IWindfall} from "../../src/interfaces/IWindfall.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice The interface is the contract: everything callable is callable through IWindfall.
contract ConformanceTest is LanternTest {
    uint256 internal constant BONUS = 10e18;
    uint64 internal round;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
        round = _push(FEED, 100e18);
    }

    function test_liquidation_is_reachable_through_the_interface() public {
        IWindfall w = IWindfall(address(lantern));
        token.mint(address(market), 1_000e18);
        vm.startPrank(address(market));
        token.approve(address(lantern), type(uint256).max);
        w.recordLiquidation(1, FEED, round, BONUS, LIQUIDATOR, BORROWER);
        vm.stopPrank();
        assertEq(w.bonusOutcome(1), 0);
    }

    function test_non_market_is_refused_through_the_interface() public {
        IWindfall w = IWindfall(address(lantern));
        vm.prank(OTHER);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, OTHER));
        w.recordLiquidation(1, FEED, round, BONUS, LIQUIDATOR, BORROWER);
    }

    function test_challenge_and_release_are_reachable() public {
        IWindfall w = IWindfall(address(lantern));
        _liquidate(1, round, BONUS);

        uint256 stake = WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
        token.mint(PROVER, stake);
        vm.startPrank(PROVER);
        token.approve(address(lantern), stake);
        w.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);
        vm.stopPrank();

        assertFalse(w.adjudicate(1));
        vm.warp(block.timestamp + WINDOW + 1);
        w.release(1);
        assertTrue(w.bonusSettled(1));
    }

    function test_the_read_surface_is_complete() public {
        IWindfall w = IWindfall(address(lantern));
        assertEq(w.market(), address(market));
        assertEq(w.priceable(FEED), w.priceable(FEED));
        assertEq(w.bonusOutcome(1), 0);
    }

    function test_registry_view_types_are_honoured() public {
        assertEq(lantern.reg().operatorOf(FEED), OPERATOR);
        assertEq(lantern.reg().decimalsOf(FEED), 18);
        assertTrue(lantern.reg().registered(FEED));
    }

    function test_history_view_honours_its_interface() public {
        assertTrue(lantern.reg().history().accepts(FEED, 100e18));
        assertGt(lantern.reg().history().widthBps(FEED), 0);
    }

    function test_escrow_and_challenge_types_are_readable() public {
        _liquidate(1, round, BONUS);
        Lantern.Escrow memory e = lantern.escrowOf(1);
        assertEq(e.feedId, FEED);
        Lantern.ChallengeRec memory c = lantern.challengeOf(1);
        assertEq(c.prover, address(0));
    }

    function test_bounty_share_is_the_deployed_constant() public {
        _warm(FEED, 40);
        uint64 bad = _suspiciousPrint(FEED);
        _liquidate(1, bad, BONUS);
        uint256 stake = WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);
        uint256 before = lantern.bondOf(FEED);
        lantern.adjudicate(1);
        assertEq(before - lantern.bondOf(FEED), (BONUS * BOUNTY) / 10_000);
    }

    function test_every_terminal_state_is_observable_from_outside() public {
        _liquidate(1, round, BONUS);
        assertEq(lantern.bonusOutcome(1), 0); // open
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1); // released

        _warm(FEED, 40);
        uint64 bad = _suspiciousPrint(FEED);
        _liquidate(2, bad, BONUS);
        _challenge(2, IChallenge.Rule.SELF_HISTORY, WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18));
        lantern.adjudicate(2);
        assertEq(lantern.bonusOutcome(2), 2); // redirected
    }
}

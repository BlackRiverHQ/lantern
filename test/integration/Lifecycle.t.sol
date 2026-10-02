// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

/// @notice Whole-lifecycle scenarios: print, liquidation, contest, settle.
contract LifecycleTest is LanternTest {
    uint256 internal constant BONUS = 10e18;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
    }

    function _stake() internal pure returns (uint256) {
        return WaterfallMath.stakeFloor(BONUS);
    }

    /// @dev The solvency identity that must hold whenever no challenge is live.
    function _assertSolvent() internal view {
        assertEq(
            token.balanceOf(address(lantern)),
            lantern.bondOf(FEED) + lantern.bondOf(FEED_B) + lantern.heldTotal(),
            "lantern holds exactly the bonds plus the un-settled bonuses"
        );
    }

    // --- act one: the honest liquidation ----------------------------------------

    function test_honest_path() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        assertEq(lantern.heldTotal(), BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 before = token.balanceOf(LIQUIDATOR);
        lantern.release(1);
        assertEq(token.balanceOf(LIQUIDATOR), before + BONUS);
    }

    function test_honest_path_stays_solvent() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        _assertSolvent();
    }

    function test_honest_path_leaves_no_exposure() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        assertEq(lantern.exposureOf(FEED), 0);
    }

    function test_honest_path_leaves_no_error() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        assertEq(lantern.feedErrors(FEED), 0);
    }

    // --- act two: the caught print ---------------------------------------------

    function test_caught_path() public {
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        uint256 borrowerBefore = token.balanceOf(BORROWER);
        assertTrue(lantern.adjudicate(1));
        assertEq(token.balanceOf(BORROWER), borrowerBefore + BONUS);
    }

    function test_caught_path_stays_solvent() public {
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        lantern.adjudicate(1);
        _assertSolvent();
    }

    function test_caught_path_records_the_error() public {
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        lantern.adjudicate(1);
        assertEq(lantern.feedErrors(FEED), 1);
    }

    function test_caught_path_costs_the_signer_money() public {
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        uint256 bondBefore = lantern.bondOf(FEED);
        lantern.adjudicate(1);
        assertLt(lantern.bondOf(FEED), bondBefore);
    }

    // --- act three: two values, one round ---------------------------------------

    function test_conflict_path() public {
        uint64 round = _push(FEED, 100e18);
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, 106e18, round, uint64(block.timestamp), keccak256("rev"), OPERATOR);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SLOT_UNIQUENESS, _stake());
        assertTrue(lantern.adjudicate(1));
        _assertSolvent();
    }

    // --- act four: a stale print -------------------------------------------------

    function test_stale_path() public {
        uint64 round = _push(FEED, 100e18);
        vm.warp(block.timestamp + Constants.STALENESS_BOUND + 1);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.ROUND_ORDERING, _stake());
        assertTrue(lantern.adjudicate(1));
        _assertSolvent();
    }

    // --- act five: a payload signed for another asset ---------------------------

    function test_cross_asset_path() public {
        _openFeed(FEED_B);
        bytes32 shared = keccak256("shared");
        _pushWithPayload(FEED_B, 100e18, shared);
        uint64 round = _pushWithPayload(FEED, 100e18, shared);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.PAYLOAD_PROVENANCE, _stake());
        assertTrue(lantern.adjudicate(1));
        _assertSolvent();
    }

    // --- act six: a challenge that loses -----------------------------------------

    function test_refused_then_released() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        assertFalse(lantern.adjudicate(1));
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 before = token.balanceOf(LIQUIDATOR);
        lantern.release(1);
        assertEq(token.balanceOf(LIQUIDATOR), before + BONUS + _stake());
    }

    function test_refused_then_released_is_solvent() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        lantern.adjudicate(1);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        _assertSolvent();
    }

    // --- scale -------------------------------------------------------------------

    function test_five_honest_liquidations() public {
        for (uint256 i = 1; i <= 5; i++) {
            vm.warp(block.timestamp + 60);
            uint64 round = _push(FEED, 100e18 + i * 1e15);
            _liquidate(i, round, BONUS);
            vm.warp(block.timestamp + WINDOW + 1);
            lantern.release(i);
        }
        assertEq(lantern.heldTotal(), 0);
        assertEq(lantern.exposureOf(FEED), 0);
        _assertSolvent();
    }

    function test_a_caught_print_sits_among_honest_ones() public {
        _warm(FEED, 40);
        uint64 good = _push(FEED, 103.9e18);
        _liquidate(1, good, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        uint64 bad = _suspiciousPrint(FEED);
        _liquidate(2, bad, BONUS);
        _challenge(2, IChallenge.Rule.SELF_HISTORY, _stake());
        assertFalse(lantern.adjudicate(1));
        assertTrue(lantern.adjudicate(2));
        assertEq(lantern.feedErrors(FEED), 1);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        _assertSolvent();
    }

    function test_two_feeds_stay_independent() public {
        _openFeed(FEED_B);
        uint64 roundA = _push(FEED, 100e18);
        uint64 roundB = _push(FEED_B, 50e18);
        _liquidateOn(FEED, 1, roundA, BONUS);
        _liquidateOn(FEED_B, 2, roundB, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1);
        assertEq(lantern.bonusOutcome(2), 0);
        _assertSolvent();
    }

    function test_top_up_after_exposure_restores_capacity() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BOND);
        assertEq(lantern.bondOf(FEED), lantern.exposureOf(FEED));
        vm.startPrank(OPERATOR);
        vm.expectRevert();
        market.liquidate(2, FEED, round, 1, BORROWER);
        vm.stopPrank();
        token.mint(OPERATOR, 100e18);
        vm.startPrank(OPERATOR);
        lantern.depositBond(FEED, 100e18);
        vm.stopPrank();
        vm.prank(LIQUIDATOR);
        market.liquidate(2, FEED, round, 1, BORROWER);
        assertEq(lantern.exposureOf(FEED), BOND + 1);
    }

    function test_errors_accumulate_across_caught_prints() public {
        _warm(FEED, 40);
        for (uint256 i = 1; i <= 3; i++) {
        uint64 round = _escalatingPrint(FEED);
            _liquidate(i, round, BONUS);
            _challenge(i, IChallenge.Rule.SELF_HISTORY, _stake());
            lantern.adjudicate(i);
        }
        assertEq(lantern.feedErrors(FEED), 3);
    }

    function test_a_repeat_offender_loses_bond_each_time() public {
        _warm(FEED, 40);
        uint256 start = lantern.bondOf(FEED);
        for (uint256 i = 1; i <= 3; i++) {
            uint64 round = _suspiciousPrint(FEED);
            _liquidate(i, round, BONUS);
            _challenge(i, IChallenge.Rule.SELF_HISTORY, _stake());
            lantern.adjudicate(i);
        }
        assertEq(start - lantern.bondOf(FEED), 3 * ((BONUS * BOUNTY) / Constants.BPS));
    }

    function test_release_is_permissionless_through_the_lifecycle() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(address(0xF00D));
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1);
    }

    function test_first_window_does_not_block_a_later_one() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + 10);
        uint64 round2 = _push(FEED, 100e18);
        _liquidate(2, round2, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1);
        assertEq(lantern.bonusOutcome(2), 0);
    }

    function test_held_total_never_exceeds_the_bond() public {
        uint64 round = _push(FEED, 100e18);
        for (uint256 i = 1; i <= 3; i++) {
            _liquidate(i, round, BONUS);
        }
        assertLe(lantern.heldTotal(), lantern.bondOf(FEED));
    }
}

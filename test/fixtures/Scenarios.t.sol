// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

/// @notice Named scenarios, each a small story with a classification at the end.
contract ScenariosTest is LanternTest {
    uint256 internal constant BONUS = 10e18;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
    }

    function _stake() internal pure returns (uint256) {
        return WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
    }

    /// @notice A print that contradicts the feed's own history is a caught forgery.
    function test_scenario_forged_print() public {
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        assertTrue(lantern.adjudicate(1));
    }

    /// @notice A print inside the feed's realized range is an honest loss: the bonus survives.
    function test_scenario_honest_loss() public {
        _warm(FEED, 40);
        vm.warp(block.timestamp + 60);
        uint64 round = _push(FEED, 103.9e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        assertFalse(lantern.adjudicate(1));
    }

    /// @notice A payload signed for another asset is a copy, and a copy is provable.
    function test_scenario_copy_pasted_payload() public {
        _openFeed(FEED_B);
        bytes32 shared = keccak256("copied");
        _pushWithPayload(FEED_B, 100e18, shared);
        uint64 round = _pushWithPayload(FEED, 100e18, shared);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.PAYLOAD_PROVENANCE, _stake());
        assertTrue(lantern.adjudicate(1));
    }

    /// @notice Rewriting a round after the fact leaves a conflict anyone can check.
    function test_scenario_same_round_revision() public {
        uint64 round = _push(FEED, 100e18);
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, 108e18, round, uint64(block.timestamp), keccak256("rev"), OPERATOR);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SLOT_UNIQUENESS, _stake());
        assertTrue(lantern.adjudicate(1));
    }

    /// @notice A print that was already old when it priced is a stale price.
    function test_scenario_stale_print() public {
        uint64 round = _push(FEED, 100e18);
        vm.warp(block.timestamp + Constants.STALENESS_BOUND + 1);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.ROUND_ORDERING, _stake());
        assertTrue(lantern.adjudicate(1));
    }

    /// @notice An accusation that cannot be proven costs the accuser, not the liquidator.
    function test_scenario_wrong_accusation() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        uint256 liquidatorBefore = token.balanceOf(LIQUIDATOR);
        assertFalse(lantern.adjudicate(1));
        assertEq(token.balanceOf(LIQUIDATOR), liquidatorBefore + _stake());
    }

    /// @notice Nobody contests: patience is all it costs, and the bonus is paid in full.
    function test_scenario_no_contest() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 before = token.balanceOf(LIQUIDATOR);
        lantern.release(1);
        assertEq(token.balanceOf(LIQUIDATOR), before + BONUS);
    }

    /// @notice Solvency holds in every one of the six stories above.
    function test_scenario_solvency_across_the_set() public {
        _warm(FEED, 40);
        uint64 a = _suspiciousPrint(FEED);
        _liquidate(1, a, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        lantern.adjudicate(1);

        vm.warp(block.timestamp + 120);
        uint64 b = _push(FEED, 130e18);
        _liquidate(2, b, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        lantern.release(2);

        assertEq(token.balanceOf(address(lantern)), lantern.bondOf(FEED) + lantern.heldTotal());
    }

    /// @notice A feed that keeps printing contradictions accumulates a public error count.
    function test_scenario_repeat_offender() public {
        _warm(FEED, 40);
        uint64 a = _escalatingPrint(FEED);
        _liquidate(1, a, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        lantern.adjudicate(1);

        uint64 b = _escalatingPrint(FEED);
        _liquidate(2, b, BONUS);
        _challenge(2, IChallenge.Rule.SELF_HISTORY, _stake());
        lantern.adjudicate(2);

        assertEq(lantern.feedErrors(FEED), 2);
    }

    /// @notice A good feed and a bad feed on the same contract are told apart by their counts.
    function test_scenario_good_and_bad_feeds_are_distinguishable() public {
        _openFeed(FEED_B);
        _warm(FEED, 40);
        _warm(FEED_B, 40);

        uint64 bad = _suspiciousPrint(FEED);
        _liquidate(1, bad, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, _stake());
        lantern.adjudicate(1);

        vm.warp(block.timestamp + 60);
        uint64 good = _push(FEED_B, 103.9e18);
        _liquidateOn(FEED_B, 2, good, BONUS);
        _challenge(2, IChallenge.Rule.SELF_HISTORY, _stake());
        lantern.adjudicate(2);

        assertEq(lantern.feedErrors(FEED), 1);
        assertEq(lantern.feedErrors(FEED_B), 0);
    }
}

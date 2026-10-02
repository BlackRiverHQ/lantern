// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

/// @notice Every state change announces itself, so an indexer never has to poll storage.
contract EventsTest is LanternTest {
    uint256 internal constant BONUS = 10e18;

    event FeedRegistered(bytes32 indexed feedId, address indexed operator);
    event BondDeposited(bytes32 indexed feedId, uint256 amount, uint256 bond);
    event ReportRecorded(bytes32 indexed feedId, uint64 round, uint256 value);
    event LiquidationRecorded(uint256 indexed liquidationId, bytes32 indexed feedId, uint256 bonus, uint64 deadline);
    event ChallengeOpened(uint256 indexed liquidationId, address indexed prover, uint8 rule, uint256 stake);
    event ChallengeUpheld(uint256 indexed liquidationId, uint8 rule, uint256 observed, uint256 bound);
    event ChallengeRefused(uint256 indexed liquidationId, uint256 stakeForfeited);
    event BonusReleased(uint256 indexed liquidationId, address indexed liquidator, uint256 amount);

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
    }

    function test_feed_registration_is_announced() public {
        token.mint(OPERATOR, BOND);
        vm.startPrank(OPERATOR);
        vm.expectEmit(true, true, false, true, address(lantern));
        emit FeedRegistered(FEED_B, OPERATOR);
        lantern.registerFeed(FEED_B, keccak256("S"), 18);
        vm.stopPrank();
    }

    function test_bond_deposit_is_announced_with_the_running_total() public {
        token.mint(OPERATOR, 3e18);
        vm.startPrank(OPERATOR);
        vm.expectEmit(true, false, false, true, address(lantern));
        emit BondDeposited(FEED, 3e18, BOND + 3e18);
        lantern.depositBond(FEED, 3e18);
        vm.stopPrank();
    }

    function test_report_is_announced_with_its_round_and_value() public {
        vm.expectEmit(true, false, false, true, address(lantern));
        emit ReportRecorded(FEED, roundCounter + 1, 100e18);
        _push(FEED, 100e18);
    }

    function test_liquidation_is_announced_with_its_deadline() public {
        uint64 round = _push(FEED, 100e18);
        uint64 expectedDeadline = uint64(block.timestamp) + WINDOW;
        vm.expectEmit(true, true, false, true, address(lantern));
        emit LiquidationRecorded(7, FEED, BONUS, expectedDeadline);
        _liquidate(7, round, BONUS);
    }

    function test_challenge_is_announced() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        uint256 stake = WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);

        token.mint(PROVER, stake);
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        vm.expectEmit(true, true, false, true, address(lantern));
        emit ChallengeOpened(1, PROVER, uint8(IChallenge.Rule.SELF_HISTORY), stake);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);
        vm.stopPrank();
    }

    function test_upheld_verdict_is_announced() public {
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18));

        vm.expectEmit(true, false, false, false, address(lantern));
        emit ChallengeUpheld(1, uint8(IChallenge.Rule.SELF_HISTORY), 0, 0);
        lantern.adjudicate(1);
    }

    function test_refused_verdict_is_announced_with_the_forfeited_stake() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        uint256 stake = WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, stake);

        vm.expectEmit(true, false, false, true, address(lantern));
        emit ChallengeRefused(1, stake);
        lantern.adjudicate(1);
    }

    function test_release_is_announced_with_the_amount() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);

        vm.expectEmit(true, true, false, true, address(lantern));
        emit BonusReleased(1, LIQUIDATOR, BONUS);
        lantern.release(1);
    }
}

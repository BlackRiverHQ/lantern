// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ReentrantToken} from "../../src/mocks/ReentrantToken.sol";
import {MockMarket} from "../../src/mocks/MockMarket.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice A token that calls back during transfers must not be able to duplicate state.
contract ReentrancyTest is Test {
    ReentrantToken internal token;
    Lantern internal lantern;
    MockMarket internal market;

    bytes32 internal constant FEED = keccak256("FEED:TSLA");
    address internal constant OPERATOR = address(0xA11CE);
    address internal constant LIQUIDATOR = address(0xB0B);
    address internal constant BORROWER = address(0xCAFE);
    address internal constant PROVER = address(0xD00D);
    uint256 internal constant BONUS = 10e18;

    function setUp() public {
        token = new ReentrantToken();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        lantern = new Lantern(IERC20(address(token)), predicted, 60, 2_000);
        market = new MockMarket(IERC20(address(token)), lantern);

        token.mint(address(market), 1_000e18);
        token.mint(OPERATOR, 1_000e18);

        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 18);
        lantern.depositBond(FEED, 1_000e18);
        for (uint64 r = 1; r <= 4; r++) {
            lantern.recordReport(FEED, 100e18, r, uint64(block.timestamp), keccak256(abi.encode("p", r)), OPERATOR);
        }
        lantern.recordReport(FEED, 100e18, 5, uint64(block.timestamp), keccak256("p1"), OPERATOR);
        vm.stopPrank();

        vm.prank(LIQUIDATOR);
        market.liquidate(1, FEED, 5, BONUS, BORROWER);
    }

    function _armReentryIntoOpenChallenge(uint256 stake) internal {
        bytes memory payload = abi.encodeWithSelector(
            Lantern.openChallenge.selector, 1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake
        );
        token.arm(address(lantern), payload);
    }

    function _armReentryIntoRecordLiquidation() internal {
        bytes memory payload = abi.encodeWithSelector(
            Lantern.recordLiquidation.selector, 1, FEED, uint64(1), BONUS, LIQUIDATOR, BORROWER
        );
        token.arm(address(lantern), payload);
    }

    function test_reentrancy_cannot_open_a_second_challenge() public {
        uint256 stake = WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
        token.mint(PROVER, stake);
        _armReentryIntoOpenChallenge(stake);

        vm.startPrank(PROVER);
        token.approve(address(lantern), stake);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);
        vm.stopPrank();

        assertEq(lantern.challengesOpened(), 1, "the re-entrant attempt must not add a challenge");
    }

    function test_reentrancy_cannot_double_take_the_stake() public {
        uint256 stake = WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
        token.mint(PROVER, stake * 2);
        _armReentryIntoOpenChallenge(stake);

        uint256 before = token.balanceOf(PROVER);
        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);
        vm.stopPrank();

        assertEq(before - token.balanceOf(PROVER), stake, "exactly one stake may be taken");
    }

    function test_reentrancy_cannot_duplicate_an_escrow() public {
        _armReentryIntoRecordLiquidation();
        vm.prank(LIQUIDATOR);
        market.liquidate(2, FEED, 5, BONUS, BORROWER);

        assertEq(lantern.recorded(), 2, "only the outer liquidation may be recorded");
        assertEq(lantern.heldTotal(), 2 * BONUS);
    }

    function test_reentrancy_leaves_the_books_balanced() public {
        uint256 stake = WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18);
        token.mint(PROVER, stake);
        _armReentryIntoOpenChallenge(stake);

        vm.startPrank(PROVER);
        token.approve(address(lantern), stake);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);
        vm.stopPrank();

        assertEq(
            token.balanceOf(address(lantern)),
            lantern.bondOf(FEED) + lantern.heldTotal() + stake,
            "the hostile token cannot create or destroy value"
        );
    }
}

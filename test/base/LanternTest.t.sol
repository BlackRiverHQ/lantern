// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {MockMarket} from "../../src/mocks/MockMarket.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @title LanternTest
/// @notice Shared harness. Lantern takes its market address at construction, so the market is
///         predicted and then deployed to exactly that address.
contract LanternTest is Test {
    MockToken internal token;
    Lantern internal lantern;
    MockMarket internal market;

    address internal constant OPERATOR = address(0xA11CE);
    address internal constant LIQUIDATOR = address(0xB0B);
    address internal constant BORROWER = address(0xCAFE);
    address internal constant PROVER = address(0xD00D);
    address internal constant OTHER = address(0xE1E1);

    bytes32 internal constant FEED = keccak256("FEED:TSLA");
    bytes32 internal constant FEED_B = keccak256("FEED:NVDA");

    uint64 internal constant WINDOW = 60;
    uint16 internal constant BOUNTY = 2_000;
    uint256 internal constant BOND = 1_000e18;

    uint64 internal roundCounter = 100;
    uint256 internal valueCounter = 100e18;

    function setUp() public virtual {
        token = new MockToken();

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        lantern = new Lantern(IERC20(address(token)), predicted, WINDOW, BOUNTY);
        market = new MockMarket(IERC20(address(token)), lantern);
        assertEq(address(market), predicted, "market address must be predicted correctly");

        token.mint(address(market), 1_000_000e18);
    }

    // --- setup helpers -------------------------------------------------

    function _openFeed(bytes32 feedId) internal {
        token.mint(OPERATOR, BOND);
        vm.startPrank(OPERATOR);
        lantern.registerFeed(feedId, keccak256("SIGNERS"), 18);
        token.approve(address(lantern), type(uint256).max);
        lantern.depositBond(feedId, BOND);
        vm.stopPrank();
    }

    /// @notice Push a report at a value inside the drift bounds, with a fresh payload.
    function _push(bytes32 feedId, uint256 value) internal returns (uint64 round) {
        round = ++roundCounter;
        vm.prank(OPERATOR);
        lantern.recordReport(feedId, value, round, uint64(block.timestamp), keccak256(abi.encode(feedId, round)), OPERATOR);
    }

    function _pushFresh(bytes32 feedId) internal returns (uint64 round, uint256 value) {
        valueCounter = valueCounter + (valueCounter / 100); // +1%, inside every drift bound
        value = valueCounter;
        round = _push(feedId, value);
    }

    function _liquidate(uint256 liquidationId, uint64 round, uint256 bonus) internal {
        vm.prank(LIQUIDATOR);
        market.liquidate(liquidationId, FEED, round, bonus, BORROWER);
    }

    function _challenge(uint256 liquidationId, IChallenge.Rule rule, uint256 stake) internal {
        _challengeAs(liquidationId, rule, stake, PROVER);
    }

    function _challengeAs(uint256 liquidationId, IChallenge.Rule rule, uint256 stake, address prover) internal {
        token.mint(prover, stake);
        vm.startPrank(prover);
        token.approve(address(lantern), type(uint256).max);
        lantern.openChallenge(liquidationId, rule, abi.encode(rule), stake);
        vm.stopPrank();
    }

    // --- smoke ---------------------------------------------------------

    function test_harness_wired() public view {
        assertEq(address(lantern.reg()) != address(0), true);
        assertEq(lantern.market(), address(market));
        assertEq(lantern.holdWindow(), WINDOW);
    }

    function test_harness_window_within_bounds() public view {
        assertGe(lantern.holdWindow(), Constants.MIN_HOLD_WINDOW);
        assertLe(lantern.holdWindow(), Constants.MAX_HOLD_WINDOW);
    }
}

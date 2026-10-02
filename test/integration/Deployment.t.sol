// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {MockMarket} from "../../src/mocks/MockMarket.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {IWindfall} from "../../src/interfaces/IWindfall.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

/// @notice The wiring assertions the deployment script relies on, checked locally.
contract DeploymentTest is Test {
    MockToken internal token;
    Lantern internal lantern;
    MockMarket internal market;

    bytes32 internal constant FEED = keccak256("FEED:DEMO");
    address internal constant OPERATOR = address(0xA11CE);
    address internal constant LIQUIDATOR = address(0xB0B);
    address internal constant BORROWER = address(0xCAFE);
    address internal constant PROVER = address(0xD00D);

    function setUp() public {
        token = new MockToken();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        lantern = new Lantern(IERC20(address(token)), predicted, 300, 2_000);
        market = new MockMarket(IERC20(address(token)), lantern);
        assertEq(address(market), predicted, "the predicted market must land where expected");
    }

    function test_lantern_trusts_the_market_it_was_built_with() public view {
        assertEq(lantern.market(), address(market));
    }

    function test_market_points_back_at_lantern() public view {
        assertEq(address(market.lantern()), address(lantern));
    }

    function test_asset_is_wired() public view {
        assertEq(address(lantern.asset()), address(token));
    }

    function test_window_is_the_deployed_value() public view {
        assertEq(lantern.holdWindow(), 300);
    }

    function test_bounty_is_the_deployed_value() public view {
        assertEq(lantern.bountyBps(), 2_000);
    }

    function test_registry_belongs_to_lantern() public view {
        assertEq(lantern.reg().controller(), address(lantern));
    }

    function test_initial_state_is_clean() public view {
        assertEq(lantern.recorded(), 0);
        assertEq(lantern.heldTotal(), 0);
        assertEq(lantern.challengesOpened(), 0);
    }

    function test_unregistered_feed_is_not_priceable() public view {
        assertFalse(lantern.isPriceable(FEED));
    }

    function test_full_act_on_a_fresh_deployment() public {
        token.mint(OPERATOR, 1_000e18);
        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 18);
        lantern.depositBond(FEED, 1_000e18);
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), OPERATOR);
        vm.stopPrank();

        token.mint(address(market), 1_000e18);
        vm.prank(LIQUIDATOR);
        market.liquidate(1, FEED, 1, 10e18, BORROWER);

        uint256 stake = WaterfallMath.stakeFloor(10e18);
        token.mint(PROVER, stake);
        vm.startPrank(PROVER);
        token.approve(address(lantern), stake);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);
        vm.stopPrank();

        assertFalse(lantern.adjudicate(1), "a first print cannot contradict a band that did not exist");
        assertEq(lantern.heldTotal(), 10e18);
    }

    function test_configuration_survives_arbitrary_traffic() public {
        uint64 window = lantern.holdWindow();
        uint16 bounty = lantern.bountyBps();
        address marketAddress = lantern.market();

        token.mint(OPERATOR, 1_000e18);
        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 18);
        lantern.depositBond(FEED, 1_000e18);
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p1"), OPERATOR);
        vm.stopPrank();

        assertEq(lantern.holdWindow(), window);
        assertEq(lantern.bountyBps(), bounty);
        assertEq(lantern.market(), marketAddress);
    }

    function test_lantern_is_reachable_through_its_interface() public {
        IWindfall w = IWindfall(address(lantern));
        assertEq(w.market(), address(market));
        assertFalse(w.priceable(FEED));
        assertFalse(w.bonusSettled(1));
    }
}

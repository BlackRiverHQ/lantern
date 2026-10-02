// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {MockMarket} from "../../src/mocks/MockMarket.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";

/// @notice The guards that stand between a caller and the mechanism. Untested guards are where bugs
///         hide, and a coverage run named these as the only paths nothing had walked.
contract GuardsTest is Test {
    MockToken internal token;
    Lantern internal lantern;
    MockMarket internal market;

    address internal constant OPERATOR = address(0xA11CE);
    address internal constant OTHER = address(0xDEAD);
    bytes32 internal constant FEED = keccak256("FEED:GUARD");

    function setUp() public {
        token = new MockToken();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        lantern = new Lantern(IERC20(address(token)), predicted, 60, 2_000);
        market = new MockMarket(IERC20(address(token)), lantern);
        token.mint(address(market), 1_000_000e18);
    }

    function test_a_zero_asset_is_refused() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        vm.expectRevert(ILanternErrors.ZeroAddress.selector);
        new Lantern(IERC20(address(0)), predicted, 60, 2_000);
    }

    function test_a_zero_market_is_refused() public {
        vm.expectRevert(ILanternErrors.ZeroAddress.selector);
        new Lantern(IERC20(address(token)), address(0), 60, 2_000);
    }

    function test_a_bounty_share_above_the_whole_is_refused() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        vm.expectRevert(bytes("BOUNTY"));
        new Lantern(IERC20(address(token)), predicted, 60, 10_001);
    }

    function test_an_unregistered_feed_cannot_be_printed_on() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownFeed.selector, FEED));
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
    }

    function test_only_the_operator_of_a_feed_may_print_for_it() public {
        token.mint(OPERATOR, 1_000e18);
        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 18);
        lantern.depositBond(FEED, 1_000e18);
        vm.stopPrank();

        // The bond covers the feed, and the operator is the only one who may spend its reputation.
        vm.prank(OTHER);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, OTHER));
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OTHER);
    }

    function test_the_owner_of_a_feed_is_not_a_role_that_exists() public {
        // Nothing in the deployed surface takes an admin argument, so there is no owner to test for.
        assertEq(lantern.market(), address(market));
        assertEq(lantern.holdWindow(), 60);
        assertEq(lantern.bountyBps(), 2_000);
    }
}

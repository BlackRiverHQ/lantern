// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract LanternFeedBondTest is LanternTest {
    function test_register_sets_operator() public {
        _openFeed(FEED);
        assertEq(lantern.operatorOf(FEED), OPERATOR);
    }

    function test_register_mirrors_into_the_registry() public {
        _openFeed(FEED);
        assertEq(lantern.reg().operatorOf(FEED), OPERATOR);
    }

    function test_register_emits() public {
        token.mint(OPERATOR, BOND);
        vm.startPrank(OPERATOR);
        vm.expectEmit(true, true, false, true, address(lantern));
        emit FeedRegistered(FEED, OPERATOR);
        lantern.registerFeed(FEED, keccak256("S"), 18);
        vm.stopPrank();
    }

    event FeedRegistered(bytes32 indexed feedId, address indexed operator);

    function test_register_twice_reverts() public {
        _openFeed(FEED);
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.FeedAlreadyRegistered.selector, FEED));
        lantern.registerFeed(FEED, keccak256("S"), 18);
    }

    function test_second_operator_becomes_its_own_operator() public {
        _openFeed(FEED);
        token.mint(OTHER, BOND);
        vm.startPrank(OTHER);
        lantern.registerFeed(FEED_B, keccak256("S"), 18);
        vm.stopPrank();
        assertEq(lantern.operatorOf(FEED_B), OTHER);
    }

    function test_bond_recorded() public {
        _openFeed(FEED);
        assertEq(lantern.bondOf(FEED), BOND);
    }

    function test_deposit_adds_up() public {
        _openFeed(FEED);
        token.mint(OPERATOR, 5e18);
        vm.startPrank(OPERATOR);
        lantern.depositBond(FEED, 5e18);
        vm.stopPrank();
        assertEq(lantern.bondOf(FEED), BOND + 5e18);
    }

    function test_deposit_moves_tokens() public {
        _openFeed(FEED);
        uint256 before = token.balanceOf(address(lantern));
        vm.startPrank(OPERATOR);
        lantern.depositBond(FEED, 5e18);
        vm.stopPrank();
        assertEq(token.balanceOf(address(lantern)), before + 5e18);
    }

    function test_deposit_zero_reverts() public {
        _openFeed(FEED);
        vm.prank(OPERATOR);
        vm.expectRevert(ILanternErrors.ZeroAmount.selector);
        lantern.depositBond(FEED, 0);
    }

    function test_deposit_on_unknown_feed_reverts() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownFeed.selector, FEED));
        lantern.depositBond(FEED, 1e18);
    }

    function test_deposit_by_stranger_reverts() public {
        _openFeed(FEED);
        vm.prank(OTHER);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, OTHER));
        lantern.depositBond(FEED, 1e18);
    }

    function test_withdraw_spare_works() public {
        _openFeed(FEED);
        vm.startPrank(OPERATOR);
        lantern.withdrawBond(FEED, 10e18);
        vm.stopPrank();
        assertEq(lantern.bondOf(FEED), BOND - 10e18);
    }

    function test_withdraw_beyond_spare_is_capped() public {
        _openFeed(FEED);
        vm.prank(OPERATOR);
        lantern.withdrawBond(FEED, BOND * 90); // request far more than exists
        assertEq(lantern.bondOf(FEED), Constants.MIN_BOND);
    }

    function test_withdraw_at_floor_reverts() public {
        _openFeed(FEED);
        vm.startPrank(OPERATOR);
        lantern.withdrawBond(FEED, BOND - Constants.MIN_BOND);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnderBonded.selector, FEED, Constants.MIN_BOND, Constants.MIN_BOND));
        lantern.withdrawBond(FEED, 1);
        vm.stopPrank();
    }

    function test_withdraw_by_stranger_reverts() public {
        _openFeed(FEED);
        vm.prank(OTHER);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, OTHER));
        lantern.withdrawBond(FEED, 1e18);
    }

    function test_not_priceable_before_bond() public {
        vm.prank(OPERATOR);
        lantern.registerFeed(FEED, keccak256("S"), 18);
        assertFalse(lantern.isPriceable(FEED));
    }

    function test_priceable_after_bond() public {
        _openFeed(FEED);
        assertTrue(lantern.isPriceable(FEED));
    }

    function test_priceable_view_matches_alias() public {
        _openFeed(FEED);
        assertEq(lantern.priceable(FEED), lantern.isPriceable(FEED));
    }

    function test_unregistered_feed_is_never_priceable() public {
        assertFalse(lantern.isPriceable(FEED_B));
    }

    function test_exposure_floor_view_follows_registry_math() public {
        _openFeed(FEED);
        assertEq(lantern.exposureFloor(FEED), Constants.MIN_BOND);
    }

    function test_feed_errors_start_at_zero() public {
        _openFeed(FEED);
        assertEq(lantern.feedErrors(FEED), 0);
    }

    function test_held_total_starts_at_zero() public {
        _openFeed(FEED);
        assertEq(lantern.heldTotal(), 0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract LanternLiquidationTest is LanternTest {
    uint256 internal bonus = 10e18;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
    }

    function test_liquidation_holds_the_bonus() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, bonus);
        assertEq(lantern.heldTotal(), bonus);
    }

    function test_liquidation_moves_tokens_into_lantern() public {
        uint64 round = _push(FEED, 100e18);
        uint256 before = token.balanceOf(address(lantern));
        _liquidate(1, round, bonus);
        assertEq(token.balanceOf(address(lantern)), before + bonus);
    }

    function test_liquidation_records_the_borrower() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, bonus);
        assertEq(lantern.escrowOf(1).borrower, BORROWER);
    }

    function test_liquidation_records_the_liquidator() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, bonus);
        assertEq(lantern.escrowOf(1).liquidator, LIQUIDATOR);
    }

    function test_deadline_is_now_plus_window() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, bonus);
        assertEq(lantern.escrowOf(1).deadline, uint64(block.timestamp) + WINDOW);
    }

    function test_bonus_starts_unsettled() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, bonus);
        assertFalse(lantern.bonusSettled(1));
    }

    function test_only_market_may_report_a_liquidation() public {
        uint64 round = _push(FEED, 100e18);
        vm.prank(OTHER);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.NotMarket.selector, OTHER));
        lantern.recordLiquidation(1, FEED, round, bonus, bonus * 10, LIQUIDATOR, BORROWER);
    }

    function test_unknown_round_reverts() public {
        _push(FEED, 100e18);
        vm.prank(address(market));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownFeed.selector, FEED));
        lantern.recordLiquidation(1, FEED, 999_999, bonus, bonus * 10, LIQUIDATOR, BORROWER);
    }

    function test_unknown_feed_reverts() public {
        uint64 round = _push(FEED, 100e18);
        vm.prank(address(market));
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.UnknownFeed.selector, FEED_B));
        lantern.recordLiquidation(1, FEED_B, round, bonus, bonus * 10, LIQUIDATOR, BORROWER);
    }

    function test_double_liquidation_id_reverts() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, bonus);
        vm.prank(LIQUIDATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.LiquidationAlreadySettled.selector, 1));
        market.liquidate(1, FEED, round, bonus, BORROWER);
    }

    function test_zero_bonus_reverts() public {
        uint64 round = _push(FEED, 100e18);
        vm.prank(LIQUIDATOR);
        vm.expectRevert(ILanternErrors.ZeroAmount.selector);
        market.liquidate(1, FEED, round, 0, BORROWER);
    }

    function test_exposure_grows_with_each_liquidation() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, bonus);
        _liquidate(2, round, bonus);
        assertEq(lantern.exposureOf(FEED), 2 * bonus);
    }

    function test_recorded_counter_moves() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, bonus);
        assertEq(lantern.recorded(), 1);
    }

    /// @dev Fail closed: a feed whose bond cannot cover the exposure it is creating cannot price.
    function test_liquidation_beyond_bond_reverts() public {
        uint64 round = _push(FEED, 100e18);
        vm.prank(LIQUIDATOR);
        vm.expectRevert();
        market.liquidate(1, FEED, round, BOND + 1, BORROWER);
    }

    function test_liquidation_up_to_bond_is_allowed() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BOND);
        assertEq(lantern.exposureOf(FEED), BOND);
    }

    function test_liquidation_after_the_bond_is_exactly_consumed_reverts() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BOND);
        vm.prank(LIQUIDATOR);
        vm.expectRevert();
        market.liquidate(2, FEED, round, 1, BORROWER);
    }

    /// @dev The 1:1 rule is enforced when a liquidation is recorded, so exposure can never
    ///      exceed the bond. What stops the next liquidation is that floor, not a silent pause.
    function test_exposure_never_exceeds_the_bond() public {
    uint64 round = _push(FEED, 100e18);
    _liquidate(1, round, BOND);
    assertEq(lantern.exposureOf(FEED), BOND);
    assertEq(lantern.exposureOf(FEED), lantern.bondOf(FEED));
    assertTrue(lantern.isPriceable(FEED));
    }
}

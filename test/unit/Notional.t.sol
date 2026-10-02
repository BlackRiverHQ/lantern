// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice Recovery used to be capped at the held bonus, so a bond sized against a profit could never
///         answer for the position that produced it. The bond now has to cover a share of the notional
///         the liquidation put at risk, and the market is the one who declares what that was.
contract NotionalTest is LanternTest {
    uint256 internal constant BONUS = 10e18;

    function test_a_bond_that_covers_the_bonus_but_not_the_notional_is_refused() public {
        _openFeed(FEED);
        uint64 round = _push(FEED, valueCounter);

        // A thousandth of this notional is twice the bond the feed is carrying.
        uint256 notional = 200_000e18;
        vm.prank(LIQUIDATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                ILanternErrors.UnderBonded.selector, FEED, BOND, notional * Constants.NOTIONAL_COVERAGE_BPS / 10_000
            )
        );
        market.liquidateWithNotional(1, FEED, round, BONUS, notional, BORROWER);
    }

    function test_a_bond_that_covers_the_notional_records() public {
        _openFeed(FEED);
        uint64 round = _push(FEED, valueCounter);

        uint256 notional = 50_000e18;
        vm.prank(LIQUIDATOR);
        market.liquidateWithNotional(1, FEED, round, BONUS, notional, BORROWER);

        assertEq(lantern.recorded(), 1);
        assertEq(lantern.heldTotal(), BONUS);
    }

    function test_the_requirement_scales_with_the_notional() public {
        _openFeed(FEED);
        uint64 round = _push(FEED, valueCounter);

        // Just inside the bond, then just outside it: the boundary is the notional, not the bonus.
        uint256 inside = 99_000e18;
        vm.prank(LIQUIDATOR);
        market.liquidateWithNotional(1, FEED, round, BONUS, inside, BORROWER);

        uint256 outside = 101_000e18;
        vm.prank(LIQUIDATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                ILanternErrors.UnderBonded.selector, FEED, BOND, outside * Constants.NOTIONAL_COVERAGE_BPS / 10_000
            )
        );
        market.liquidateWithNotional(2, FEED, round, BONUS, outside, BORROWER);
    }

    function test_a_small_notional_does_not_raise_the_requirement() public {
        _openFeed(FEED);
        uint64 round = _push(FEED, valueCounter);

        // A share of this notional sits below the escrow the feed already carries, so the escrow is
        // what the bond answers for. The larger of the two floors is the one that binds.
        vm.prank(LIQUIDATOR);
        market.liquidateWithNotional(1, FEED, round, BONUS, 100e18, BORROWER);
        assertEq(lantern.recorded(), 1);
    }

    function test_a_zero_notional_is_not_a_loophole_for_the_escrow_floor() public {
        _openFeed(FEED);
        uint64 round = _push(FEED, valueCounter);

        // Declaring nothing does not shrink what the feed already owes on its escrow.
        vm.prank(LIQUIDATOR);
        market.liquidateWithNotional(1, FEED, round, BOND, 0, BORROWER);
        assertEq(lantern.exposureOf(FEED), BOND);
    }
}

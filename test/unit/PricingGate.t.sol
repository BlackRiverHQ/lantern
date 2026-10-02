// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice A feed may print as freely as it likes, but a liquidation may only be priced on a print that
///         had something behind it. Below the floor every rule is vacuously true: a band from one
///         sample is wide enough to excuse anything, which is precisely the condition an attacker
///         would arrange before printing a number they invented.
contract PricingGateTest is LanternTest {
    uint256 internal constant BONUS = 10e18;

    function test_a_print_with_no_history_behind_it_cannot_price_a_liquidation() public {
        _openFeedCold(FEED);
        uint64 round = _push(FEED, valueCounter);

        vm.prank(LIQUIDATOR);
        vm.expectRevert(
            abi.encodeWithSelector(ILanternErrors.ReportTooThin.selector, FEED, 0, Constants.MIN_SAMPLES_FOR_PRICING)
        );
        market.liquidate(1, FEED, round, BONUS, BORROWER);
    }

    function test_one_sample_short_of_the_floor_is_still_refused() public {
        _openFeedCold(FEED);
        uint64 round = 0;
        // Three prints, then a fourth: the fourth is one sample short of the floor.
        for (uint256 i = 0; i < Constants.MIN_SAMPLES_FOR_PRICING - 1; i++) {
            round = _push(FEED, valueCounter);
        }
        round = _push(FEED, valueCounter);

        vm.prank(LIQUIDATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                ILanternErrors.ReportTooThin.selector, FEED, Constants.MIN_SAMPLES_FOR_PRICING - 1,
                Constants.MIN_SAMPLES_FOR_PRICING
            )
        );
        market.liquidate(1, FEED, round, BONUS, BORROWER);
    }

    function test_at_the_floor_it_prices() public {
        _openFeedCold(FEED);
        uint64 round = 0;
        for (uint256 i = 0; i < Constants.MIN_SAMPLES_FOR_PRICING; i++) {
            round = _push(FEED, valueCounter);
        }
        round = _push(FEED, valueCounter);

        // The priced print itself is the fifth, judged against four that came before it.
        vm.prank(LIQUIDATOR);
        market.liquidate(1, FEED, round, BONUS, BORROWER);
        assertEq(lantern.recorded(), 1);
    }

    function test_the_gate_is_on_pricing_and_not_on_printing() public {
        _openFeedCold(FEED);

        // The whole point: a feed builds its history by printing. If the floor blocked printing, no
        // feed could ever reach it.
        uint64 round = 0;
        for (uint256 i = 0; i < Constants.MIN_SAMPLES_FOR_PRICING + 2; i++) {
            round = _push(FEED, valueCounter);
        }
        assertEq(lantern.reg().samplesOf(FEED), Constants.MIN_SAMPLES_FOR_PRICING + 2);
        assertGt(round, 0);
    }

    function test_the_report_carries_the_depth_it_was_judged_against() public {
        _openFeedCold(FEED);
        uint64 first = _push(FEED, valueCounter);
        assertEq(lantern.reg().reportAt(FEED, first).prevSamples, 0, "the first print had nothing behind it");

        uint64 second = _push(FEED, valueCounter);
        assertEq(lantern.reg().reportAt(FEED, second).prevSamples, 1, "the second had one");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChainlinkSource} from "../../src/integrations/ChainlinkSource.sol";
import {IAggregatorV3} from "../../src/interfaces/IAggregatorV3.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice An aggregator is just another source. What matters is that its answer can be compared
///         with the feed's own, and that a stale aggregator counts as silence.
contract ChainlinkSourceTest is Test {
    MockAggregator internal agg;
    ChainlinkSource internal source;

    function setUp() public {
        agg = new MockAggregator(8, "ETH / USD");
        source = new ChainlinkSource(address(agg), 18);
    }

    function test_an_eight_decimal_answer_is_scaled_to_eighteen() public {
        agg.setAnswer(2_749_53000000); // $2749.53 at 8 decimals
        (uint256 value, , ) = source.latest();
        assertEq(value, 2_749_53e16, "scaled by 1e10");
    }

    function test_the_round_is_the_aggregators_own() public {
        agg.setAnswer(100e8);
        agg.setRound(42);
        (, uint64 round, ) = source.latest();
        assertEq(round, 42);
    }

    function test_the_timestamp_comes_from_the_aggregator() public {
        agg.setAnswer(100e8);
        agg.setUpdatedAt(1_790_932_964);
        (, , uint64 updatedAt) = source.latest();
        assertEq(updatedAt, 1_790_932_964);
    }

    function test_a_stale_answer_is_refused_when_freshness_is_asked_for() public {
        agg.setAnswer(100e8);
        agg.setUpdatedAt(1_000_000);
        vm.warp(1_000_000 + 3600 + 1);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkSource.Stale.selector, 100e8, 1_000_000));
        source.latestFresh(3600);
    }

    function test_a_zero_answer_is_refused() public {
        agg.setAnswer(0);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkSource.NoAnswer.selector, 0));
        source.latest();
    }

    function test_a_negative_answer_is_refused() public {
        agg.setAnswer(-1);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkSource.NoAnswer.selector, -1));
        source.latest();
    }

    function test_a_round_id_too_large_to_carry_is_reported_as_absent() public {
    agg.setAnswer(100e8);
    agg.setRound(type(uint80).max);
    (, uint64 round, ) = source.latest();
    assertEq(round, 0, "a phase-encoded id must not be truncated into a different number");
    }

    function test_a_higher_precision_aggregator_is_scaled_down() public {
        MockAggregator fine = new MockAggregator(20, "FINE / USD");
        fine.setAnswer(123e20);
        ChainlinkSource downscaled = new ChainlinkSource(address(fine), 18);
        (uint256 value, , ) = downscaled.latest();
        assertEq(value, 123e18);
    }

    function test_the_description_is_passed_through() public view {
        assertEq(source.description(), "ETH / USD");
    }

    function test_the_decimals_are_read_once_at_construction() public view {
        assertEq(source.aggregatorDecimals(), 8);
        assertEq(source.targetDecimals(), 18);
    }
}

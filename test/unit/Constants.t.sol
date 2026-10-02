// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice The numbers can be argued with, but they cannot contradict each other.
contract ConstantsTest is Test {
    function test_the_band_floor_is_below_its_ceiling() public pure {
        assertLt(Constants.MIN_WIDTH_BPS, Constants.MAX_WIDTH_BPS);
    }

    function test_the_band_ceiling_is_a_sane_share_of_price() public pure {
        assertLt(Constants.MAX_WIDTH_BPS, Constants.BPS, "a band of 100% is not a band");
    }

    function test_the_multiplier_is_positive() public pure {
        assertGt(Constants.MOVE_MULTIPLIER, 0);
    }

    function test_the_cold_start_needs_a_history() public pure {
        assertGt(Constants.PRIOR_SAMPLES, 0);
    }

    function test_the_ewma_shift_divides_by_more_than_one() public pure {
        assertGt(Constants.MOVE_EWMA_SHIFT, 0, "a shift of zero would make the newest print the estimate");
        assertLt(Constants.MOVE_EWMA_SHIFT, 16, "a shift this large would freeze the estimate");
    }

    function test_per_report_drift_is_below_cumulative_drift() public pure {
        assertLt(Constants.MAX_REPORT_DRIFT_BPS, Constants.MAX_CUMULATIVE_DRIFT_BPS);
    }

    function test_cumulative_drift_allows_a_real_move() public pure {
        assertGt(Constants.MAX_CUMULATIVE_DRIFT_BPS, Constants.MIN_WIDTH_BPS);
    }

    function test_the_window_bounds_are_ordered() public pure {
        assertLt(Constants.MIN_HOLD_WINDOW, Constants.MAX_HOLD_WINDOW);
    }

    function test_the_staleness_bound_fits_inside_the_drift_window() public pure {
        assertLe(Constants.STALENESS_BOUND, Constants.DRIFT_WINDOW);
    }

    function test_the_bounty_leaves_the_liquidator_most_of_the_bonus() public pure {
        assertLt(Constants.BOUNTY_BPS, Constants.BPS / 2, "a prover should not take most of the bonus");
    }

    function test_the_stake_share_is_a_small_fraction() public pure {
        assertLt(Constants.MIN_STAKE_BPS, Constants.BOUNTY_BPS, "staking to accuse must cost less than being right pays");
    }

    function test_the_absolute_stake_floor_fits_the_minimum_bond() public pure {
        assertLe(Constants.MIN_STAKE_ABSOLUTE, Constants.MIN_BOND);
    }

    function test_coverage_is_one_for_one() public pure {
        assertEq(Constants.COVERAGE_BPS, Constants.BPS, "the bond must cover exposure one for one");
    }

    function test_the_minimum_bond_is_not_zero() public pure {
        assertGt(Constants.MIN_BOND, 0);
    }
}

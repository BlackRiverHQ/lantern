// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";

/// @notice Gas ceilings, asserted rather than recorded: if a flow gets materially more expensive,
///         these tests fail instead of a table going stale.
contract GasTest is LanternTest {
    uint256 internal constant BONUS = 10e18;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
    }

    function _gasUsed() internal view returns (uint256) {
        return 8_000_000 - gasleft();
    }

    function test_report_is_cheap() public {
        uint256 g0 = gasleft();
        _push(FEED, 100e18);
        assertLt(g0 - gasleft(), 250_000, "a report should stay well under 250k gas");
    }

    function test_liquidation_recording_is_cheap() public {
        uint64 round = _push(FEED, 100e18);
        uint256 g0 = gasleft();
        _liquidate(1, round, BONUS);
        assertLt(g0 - gasleft(), 250_000, "recording a liquidation should stay under 250k gas");
    }

    function test_release_is_cheap() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 g0 = gasleft();
        lantern.release(1);
        assertLt(g0 - gasleft(), 120_000, "releasing should stay under 120k gas");
    }

    function test_challenge_is_bounded() public {
        uint64 round = _push(FEED, 100e18);
        _liquidate(1, round, BONUS);
        uint256 stake = WaterfallMath.stakeFloor(BONUS);
        token.mint(PROVER, stake);

        vm.startPrank(PROVER);
        token.approve(address(lantern), type(uint256).max);
        uint256 g0 = gasleft();
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);
        assertLt(g0 - gasleft(), 200_000, "opening a challenge should stay under 200k gas");
        vm.stopPrank();
    }

    function test_adjudication_is_bounded() public {
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, WaterfallMath.stakeFloor(BONUS));

        uint256 g0 = gasleft();
        lantern.adjudicate(1);
        assertLt(g0 - gasleft(), 250_000, "adjudication should stay under 250k gas");
    }

    function test_a_full_caught_case_costs_less_than_half_a_million() public {
        _warm(FEED, 40);
        uint64 round = _suspiciousPrint(FEED);
        uint256 g0 = gasleft();
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.SELF_HISTORY, WaterfallMath.stakeFloor(BONUS));
        lantern.adjudicate(1);
        assertLt(g0 - gasleft(), 500_000, "liquidation plus challenge plus verdict, under 500k gas");
    }

    function test_deposit_is_cheap() public {
        token.mint(OPERATOR, 5e18);
        vm.startPrank(OPERATOR);
        uint256 g0 = gasleft();
        lantern.depositBond(FEED, 5e18);
        assertLt(g0 - gasleft(), 120_000, "topping up a bond should stay under 120k gas");
        vm.stopPrank();
    }
}

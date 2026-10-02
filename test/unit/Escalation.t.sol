// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {BondMath} from "../../src/libraries/BondMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice A feed that has been caught must carry more collateral for the next print. The
///         penalty is in money, not in reputation, because money is what the mechanism can
///         actually observe.
contract EscalationTest is LanternTest {
    bytes32 internal constant THIN = keccak256("FEED:THIN");

    /// @notice A feed bonded at exactly the minimum, so one caught print puts it under.
    function _openThinFeed() internal {
        token.mint(OPERATOR, Constants.MIN_BOND);
        vm.startPrank(OPERATOR);
        lantern.registerFeed(THIN, keccak256("SIGNERS"), 18);
        token.approve(address(lantern), type(uint256).max);
        lantern.depositBond(THIN, Constants.MIN_BOND);
        vm.stopPrank();
        // Thin means lightly collateralised, not uninformed: a print with no past behind it could not
        // be priced at all, which is a different test than this one.
        for (uint256 i = 0; i < Constants.MIN_SAMPLES_FOR_PRICING; i++) {
            _push(THIN, 100e18);
        }
    }

    function test_a_clean_feed_is_asked_only_for_its_exposure() public {
        _openFeed(FEED);
        assertEq(lantern.requiredBond(FEED), Constants.MIN_BOND);
    }

    function test_a_feed_with_one_error_is_asked_for_a_fifth_more() public {
    _openFeed(FEED);
    uint64 round = _pushWithPayload(FEED, 100e18, keccak256("p"));
    _liquidate(1, round, Constants.MIN_BOND);
    // A second value for the same round is the conflict the rule reads.
    vm.prank(OPERATOR);
    lantern.recordReport(FEED, 105e18, round, uint64(block.timestamp), keccak256("q"), OPERATOR);
    _challengeAs(1, IChallenge.Rule.SLOT_UNIQUENESS, Constants.MIN_BOND, PROVER);
    assertTrue(lantern.adjudicate(1));

    assertEq(lantern.feedErrors(FEED), 1);
    assertEq(lantern.requiredBond(FEED), Constants.MIN_BOND * 12 / 10, "20% more collateral");
    }

    function test_a_refused_challenge_leaves_no_mark() public {
    _openFeed(FEED);
    uint64 round = _pushWithPayload(FEED, 100e18, keccak256("p"));
    _liquidate(1, round, Constants.MIN_BOND);
    _challenge(1, IChallenge.Rule.SELF_HISTORY, Constants.MIN_BOND);
    assertFalse(lantern.adjudicate(1));
    assertEq(lantern.feedErrors(FEED), 0, "a refused challenge is not an error");
    assertEq(lantern.requiredBond(FEED), Constants.MIN_BOND);
    }

    function test_the_escalator_stops_at_its_cap() public pure {
        uint256 floor = Constants.MIN_BOND;
        assertEq(
            BondMath.penalisedFloor(floor, Constants.MAX_ERROR_STEPS, Constants.ERROR_BOND_PENALTY_BPS),
            BondMath.penalisedFloor(floor, Constants.MAX_ERROR_STEPS + 40, Constants.ERROR_BOND_PENALTY_BPS)
        );
    }

    function test_a_caught_thin_feed_cannot_price_until_it_tops_up() public {
        _openThinFeed();
        uint64 round = _pushWithPayload(THIN, 100e18, keccak256("p"));
        _liquidateOn(THIN, 1, round, Constants.MIN_BOND);

        // Catch it: a second print for the same round with a different value is a conflict.
        vm.prank(OPERATOR);
        lantern.recordReport(THIN, 105e18, round, uint64(block.timestamp), keccak256("q"), OPERATOR);
        _challengeAs(1, IChallenge.Rule.SLOT_UNIQUENESS, Constants.MIN_BOND, PROVER);
        assertTrue(lantern.adjudicate(1));

        assertEq(lantern.feedErrors(THIN), 1);
        assertGt(lantern.requiredBond(THIN), Constants.MIN_BOND, "the requirement escalates");
        assertFalse(lantern.isPriceable(THIN), "and a feed that cannot meet it cannot price");

        vm.prank(OPERATOR);
        vm.expectRevert();
        lantern.recordReport(THIN, 100e18, round + 1, uint64(block.timestamp), keccak256("z"), OPERATOR);
    }

    function test_topping_up_restores_priceability() public {
        _openThinFeed();
        uint64 round = _pushWithPayload(THIN, 100e18, keccak256("p"));
        _liquidateOn(THIN, 1, round, Constants.MIN_BOND);
        vm.prank(OPERATOR);
        lantern.recordReport(THIN, 105e18, round, uint64(block.timestamp), keccak256("q"), OPERATOR);
        _challengeAs(1, IChallenge.Rule.SLOT_UNIQUENESS, Constants.MIN_BOND, PROVER);
        lantern.adjudicate(1);

        uint256 needed = lantern.requiredBond(THIN);
        uint256 gap = needed - lantern.bondOf(THIN);
        token.mint(OPERATOR, gap);
        vm.startPrank(OPERATOR);
        token.approve(address(lantern), gap);
        lantern.depositBond(THIN, gap);
        vm.stopPrank();

        assertTrue(lantern.isPriceable(THIN), "money answers the question");
    }
}

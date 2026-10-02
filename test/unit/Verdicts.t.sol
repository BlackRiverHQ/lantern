// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Verdicts} from "../../src/libraries/Verdicts.sol";
import {Provenance} from "../../src/libraries/Provenance.sol";
import {IFeedRegistry} from "../../src/interfaces/IFeedRegistry.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract VerdictsTest is Test {
    bytes32 internal constant FEED = keccak256("F");
    bytes32 internal constant OTHER_FEED = keccak256("G");

    function _report(uint256 value, uint256 lo, uint256 hi, uint64 ts) internal pure returns (IFeedRegistry.Report memory) {
        return IFeedRegistry.Report({
            value: value,
            prevValue: 0,
            prevBandLo: lo,
            prevBandHi: hi,
            round: 1,
            timestamp: ts,
            payloadHash: keccak256("p"),
            signer: address(1),
            prevSamples: 8,
            exists: true
        });
    }

    function _inputs(IFeedRegistry.Report memory r) internal pure returns (Verdicts.Inputs memory) {
        return Verdicts.Inputs({
            report: r,
            slotConflicted: false,
            otherValueForRound: 0,
            payloadFeed: FEED,
            thisFeed: FEED,
            liquidationTime: r.timestamp,
            peerValue: 0,
            peerExists: false
            });
    }

    function test_slotUniqueness_upheld_when_conflicted() public pure {
        Verdicts.Inputs memory in_ = _inputs(_report(100e18, 0, 0, 1_000));
        in_.slotConflicted = true;
        in_.otherValueForRound = 105e18;
        (bool upheld, uint256 observed, uint256 bound) = Verdicts.evaluate(Provenance.Rule.SLOT_UNIQUENESS, in_);
        assertTrue(upheld);
        assertEq(observed, 105e18);
        assertEq(bound, 100e18);
    }

    function test_slotUniqueness_refused_when_clean() public pure {
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.SLOT_UNIQUENESS, _inputs(_report(100e18, 0, 0, 1_000)));
        assertFalse(upheld);
    }

    function test_roundOrdering_upheld_when_older_than_the_bound() public pure {
        Verdicts.Inputs memory in_ = _inputs(_report(100e18, 0, 0, 1_000));
        in_.liquidationTime = 1_000 + Constants.STALENESS_BOUND + 1;
        (bool upheld, uint256 age, uint256 bound) = Verdicts.evaluate(Provenance.Rule.ROUND_ORDERING, in_);
        assertTrue(upheld);
        assertEq(age, Constants.STALENESS_BOUND + 1);
        assertEq(bound, Constants.STALENESS_BOUND);
    }

    function test_roundOrdering_refused_at_the_bound() public pure {
        Verdicts.Inputs memory in_ = _inputs(_report(100e18, 0, 0, 1_000));
        in_.liquidationTime = 1_000 + Constants.STALENESS_BOUND;
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.ROUND_ORDERING, in_);
        assertFalse(upheld);
    }

    function test_roundOrdering_clamps_a_future_report_to_zero_age() public pure {
        Verdicts.Inputs memory in_ = _inputs(_report(100e18, 0, 0, 2_000));
        in_.liquidationTime = 1_000;
        (bool upheld, uint256 age, ) = Verdicts.evaluate(Provenance.Rule.ROUND_ORDERING, in_);
        assertFalse(upheld);
        assertEq(age, 0);
    }

    function test_selfHistory_upheld_below_the_band() public pure {
        (bool upheld, uint256 observed, uint256 bound) =
            Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, _inputs(_report(90e18, 95e18, 105e18, 1_000)));
        assertTrue(upheld);
        assertEq(observed, 90e18);
        assertEq(bound, 95e18);
    }

    function test_selfHistory_upheld_above_the_band() public pure {
        (bool upheld, uint256 observed, uint256 bound) =
            Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, _inputs(_report(115e18, 95e18, 105e18, 1_000)));
        assertTrue(upheld);
        assertEq(observed, 115e18);
        assertEq(bound, 105e18);
    }

    function test_selfHistory_refused_inside() public pure {
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, _inputs(_report(100e18, 95e18, 105e18, 1_000)));
        assertFalse(upheld);
    }

    function test_selfHistory_refused_when_no_band_was_snapshotted() public pure {
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, _inputs(_report(100e18, 0, 0, 1_000)));
        assertFalse(upheld);
    }

    function test_selfHistory_on_the_low_edge_is_not_upheld() public pure {
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, _inputs(_report(95e18, 95e18, 105e18, 1_000)));
        assertFalse(upheld);
    }

    function test_selfHistory_on_the_high_edge_is_not_upheld() public pure {
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, _inputs(_report(105e18, 95e18, 105e18, 1_000)));
        assertFalse(upheld);
    }

    function test_payloadProvenance_upheld_across_feeds() public pure {
        Verdicts.Inputs memory in_ = _inputs(_report(100e18, 0, 0, 1_000));
        in_.payloadFeed = OTHER_FEED;
        (bool upheld, uint256 observed, uint256 bound) = Verdicts.evaluate(Provenance.Rule.PAYLOAD_PROVENANCE, in_);
        assertTrue(upheld);
        assertEq(observed, 1);
        assertEq(bound, 1);
    }

    function test_payloadProvenance_refused_for_its_own_feed() public pure {
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.PAYLOAD_PROVENANCE, _inputs(_report(100e18, 0, 0, 1_000)));
        assertFalse(upheld);
    }

    function test_payloadProvenance_refused_when_unclaimed() public pure {
        Verdicts.Inputs memory in_ = _inputs(_report(100e18, 0, 0, 1_000));
        in_.payloadFeed = bytes32(0);
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.PAYLOAD_PROVENANCE, in_);
        assertFalse(upheld);
    }

    function test_verdict_is_a_pure_function_of_its_inputs() public pure {
        Verdicts.Inputs memory a = _inputs(_report(90e18, 95e18, 105e18, 1_000));
        Verdicts.Inputs memory b = _inputs(_report(90e18, 95e18, 105e18, 1_000));
        (bool ua, uint256 oa, uint256 ba) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, a);
        (bool ub, uint256 ob, uint256 bb) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, b);
        assertEq(ua, ub);
        assertEq(oa, ob);
        assertEq(ba, bb);
    }

    function testFuzz_selfHistory_matches_its_bounds(uint96 value, uint96 lo, uint96 hi) public pure {
        vm.assume(lo != 0 && hi >= lo);
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, _inputs(_report(value, lo, hi, 1_000)));
        assertEq(upheld, value < lo || value > hi);
    }

    function testFuzz_roundOrdering_matches_the_bound(uint64 ts, uint32 extra) public pure {
        vm.assume(ts < type(uint64).max - 1_000);
        Verdicts.Inputs memory in_ = _inputs(_report(100e18, 0, 0, ts));
        in_.liquidationTime = uint256(ts) + extra;
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.ROUND_ORDERING, in_);
        assertEq(upheld, uint256(extra) > Constants.STALENESS_BOUND);
    }
}

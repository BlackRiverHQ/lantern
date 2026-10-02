// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Verdicts} from "../../src/libraries/Verdicts.sol";
import {Provenance} from "../../src/libraries/Provenance.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {IFeedRegistry} from "../../src/interfaces/IFeedRegistry.sol";

/// @notice Adjudication must be total: for any state a prover can point at, the answer is a
///         verdict, never a revert. A mechanism that can be made to revert by choosing the wrong
///         rule is a denial-of-service surface.
contract VerdictsFuzzTest is Test {
    function _inputs(uint256 value, uint64 timestamp, uint256 lo, uint256 hi, uint64 liqTime)
        internal pure returns (Verdicts.Inputs memory in_)
    {
        in_.report.value = value;
        in_.report.timestamp = timestamp;
        in_.report.prevBandLo = lo;
        in_.report.prevBandHi = hi;
        in_.liquidationTime = liqTime;
    }

    function testFuzz_every_rule_returns_without_reverting(
        uint256 value, uint64 timestamp, uint256 lo, uint256 hi, uint64 liqTime,
        uint256 otherValue, bool conflicted, bytes32 payloadFeed, bytes32 thisFeed
    ) public pure {
        Verdicts.Inputs memory in_ = _inputs(value, timestamp, lo, hi, liqTime);
        in_.otherValueForRound = otherValue;
        in_.slotConflicted = conflicted;
        in_.payloadFeed = payloadFeed;
        in_.thisFeed = thisFeed;

        for (uint8 r = 0; r < 4; ++r) {
            (bool upheld, uint256 observed, uint256 bound) = Verdicts.evaluate(Provenance.Rule(r), in_);
            upheld; observed; bound;
        }
    }

    function testFuzz_slot_uniqueness_agrees_with_the_recorded_conflict(bool conflicted) public pure {
        Verdicts.Inputs memory in_ = _inputs(100, 0, 0, 0, 0);
        in_.slotConflicted = conflicted;
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.SLOT_UNIQUENESS, in_);
        assertEq(upheld, conflicted);
    }

    function testFuzz_ordering_agrees_with_the_age(uint64 timestamp, uint64 liqTime) public pure {
        Verdicts.Inputs memory in_ = _inputs(100, timestamp, 0, 0, liqTime);
        (bool upheld, uint256 observed, uint256 bound) =
            Verdicts.evaluate(Provenance.Rule.ROUND_ORDERING, in_);
        uint256 age = liqTime > timestamp ? uint256(liqTime) - timestamp : 0;
        assertEq(upheld, age > Constants.STALENESS_BOUND);
        assertEq(observed, age);
        assertEq(bound, Constants.STALENESS_BOUND);
    }

    function testFuzz_a_future_report_has_zero_age(uint64 timestamp, uint64 before) public pure {
        // The report is dated at or after the liquidation: there is no positive age to compute,
        // and the library must clamp rather than wrap into a huge number that upholds a claim.
        uint64 liqTime = uint64(bound(uint256(before), 0, uint256(timestamp)));
        Verdicts.Inputs memory in_ = _inputs(100, timestamp, 0, 0, liqTime);
        (bool upheld, uint256 observed, ) = Verdicts.evaluate(Provenance.Rule.ROUND_ORDERING, in_);
        assertEq(observed, 0, "a report newer than its liquidation has zero age");
        assertFalse(upheld, "a fresh report is not stale");
    }

    function testFuzz_self_history_agrees_with_the_band(
        uint256 value, uint256 lo, uint256 hi, bool loSet, bool hiSet
    ) public pure {
        vm.assume(loSet || hiSet);
        Verdicts.Inputs memory in_ = _inputs(value, 0, loSet ? lo : 0, hiSet ? hi : 0, 0);
        (bool upheld, uint256 observed, ) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, in_);

        bool expected = (loSet && value < lo) || (hiSet && value > hi);
        assertEq(upheld, expected);
        assertEq(observed, value);
    }

    function testFuzz_self_history_without_a_band_never_fires(uint256 value) public pure {
        Verdicts.Inputs memory in_ = _inputs(value, 0, 0, 0, 0);
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.SELF_HISTORY, in_);
        assertFalse(upheld, "with no prior band there is nothing to contradict");
    }

    function testFuzz_provenance_fires_only_on_a_different_feed(bytes32 payloadFeed, bytes32 thisFeed) public pure {
        Verdicts.Inputs memory in_ = _inputs(100, 0, 0, 0, 0);
        in_.payloadFeed = payloadFeed;
        in_.thisFeed = thisFeed;
        (bool upheld, , ) = Verdicts.evaluate(Provenance.Rule.PAYLOAD_PROVENANCE, in_);
        assertEq(upheld, payloadFeed != bytes32(0) && payloadFeed != thisFeed);
    }
}

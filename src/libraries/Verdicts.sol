// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IFeedRegistry} from "../interfaces/IFeedRegistry.sol";
import {Provenance} from "./Provenance.sol";
import {Constants} from "./Constants.sol";

/// @title Verdicts
/// @notice The recomputation. A challenge supplies a claim; these functions derive the answer
///         from state, so an adjudication never trusts the prover's arithmetic.
library Verdicts {
    struct Inputs {
        IFeedRegistry.Report report;
        bool     slotConflicted;
        uint256  otherValueForRound;
        bytes32  payloadFeed;
        bytes32  thisFeed;
        uint256  liquidationTime;
        uint256  peerValue;
        bool     peerExists;
        }

    /// @return upheld whether the claim holds, observed and bound the numbers it used
    function evaluate(Provenance.Rule rule, Inputs memory in_)
        internal pure returns (bool upheld, uint256 observed, uint256 bound)
    {
        if (rule == Provenance.Rule.SLOT_UNIQUENESS) {
            return (in_.slotConflicted, in_.otherValueForRound, in_.report.value);
        }
        if (rule == Provenance.Rule.ROUND_ORDERING) {
            uint256 age = in_.liquidationTime > in_.report.timestamp
                ? in_.liquidationTime - in_.report.timestamp
                : 0;
            return (age > Constants.STALENESS_BOUND, age, Constants.STALENESS_BOUND);
        }
        if (rule == Provenance.Rule.SELF_HISTORY) {
            bool below = in_.report.prevBandLo != 0 && in_.report.value < in_.report.prevBandLo;
            bool above = in_.report.prevBandHi != 0 && in_.report.value > in_.report.prevBandHi;
            if (below) return (true, in_.report.value, in_.report.prevBandLo);
            if (above) return (true, in_.report.value, in_.report.prevBandHi);
            return (false, in_.report.value, in_.report.prevBandHi);
        }
        // PAYLOAD_PROVENANCE
        bool crossFeed = in_.payloadFeed != bytes32(0) && in_.payloadFeed != in_.thisFeed;
        return (crossFeed, crossFeed ? 1 : 0, 1);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IChallenge} from "./IChallenge.sol";

/// @title Verdict output.
/// @notice A verdict is derived, never supplied: the adjudicator recomputes the claim from
///         on-chain state and returns both the decision and the numbers it used.
interface IVerdict {
    struct Verdict {
        bool          upheld;
        IChallenge.Rule rule;
        uint256       observed;   // what the state actually says
        uint256       bound;      // the bound it was compared against
        bytes32       digest;     // hash of the recomputation, for replay
    }
}

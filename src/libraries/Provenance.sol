// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Constants} from "./Constants.sol";

/// @title Provenance
/// @notice The four evidence rules, expressed as pure predicates over on-chain facts.
library Provenance {
    enum Rule { SLOT_UNIQUENESS, ROUND_ORDERING, SELF_HISTORY, PAYLOAD_PROVENANCE }

    /// @notice A round may not be re-priced with a different value.
    function slotConflict(uint256 firstValue, uint256 secondValue, uint64 firstRound, uint64 secondRound)
        internal pure returns (bool)
    {
        return firstRound == secondRound && firstValue != secondValue;
    }

    /// @notice Rounds advance; timestamps advance.
    function nonMonotone(uint64 candidate, uint64 previous) internal pure returns (bool) {
        return candidate <= previous;
    }

    function stale(uint64 timestamp, uint256 nowTs) internal pure returns (bool) {
        return timestamp + Constants.STALENESS_BOUND < nowTs;
    }

    function futureDated(uint64 timestamp, uint256 nowTs) internal pure returns (bool) {
        return timestamp > nowTs + 1 minutes;
    }

    function reused(bytes32 payloadHash, bool alreadySeen) internal pure returns (bool) {
        return alreadySeen || payloadHash == bytes32(0);
    }
}

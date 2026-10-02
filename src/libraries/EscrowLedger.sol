// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title EscrowLedger
/// @notice Held-bonus accounting, including the FIFO shortfall queue. Nothing is ever trimmed:
///         a payout that exceeds the bond is deferred, not forgotten.
library EscrowLedger {
    struct Entry {
        uint256 liquidationId;
        bytes32 feedId;
        uint256 held;
        uint256 queued;
        uint64  deadline;
        address liquidator;
        address borrower;
        uint8   outcome; // 0 open, 1 released, 2 redirected
    }

    struct Queue {
        uint256[] ids;   // FIFO of entries with a non-zero remainder
        uint256 head;
    }

    function enqueue(Queue storage q, uint256 liquidationId) internal {
        q.ids.push(liquidationId);
    }

    function peek(Queue storage q) internal view returns (bool has, uint256 liquidationId) {
    if (q.head >= q.ids.length) return (false, 0);
    return (true, q.ids[q.head]);
    }

    /// @notice Entries still owed, including any already drained to zero.
    function size(Queue storage q) internal view returns (uint256) {
    return q.ids.length - q.head;
    }

    function pop(Queue storage q) internal returns (uint256 liquidationId) {
        liquidationId = q.ids[q.head];
        delete q.ids[q.head];
        q.head += 1;
    }

    function outstanding(Queue storage q) internal view returns (uint256 pending) {
        for (uint256 i = q.head; i < q.ids.length; i++) {
            if (q.ids[i] != 0) pending += 1;
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IFeedRegistry} from "../interfaces/IFeedRegistry.sol";
import {IHistory} from "../interfaces/IHistory.sol";
import {ILanternErrors} from "../interfaces/ILanternErrors.sol";
import {History} from "./History.sol";
import {ReportBook} from "./ReportBook.sol";
import {Provenance} from "../libraries/Provenance.sol";

/// @title FeedRegistry
/// @notice Registers feeds and records the reports that priced liquidations.
/// @dev The write path enforces only structural facts. A value that passes them but cannot be
///      true is the job of a challenge, not of a gate — so the pre-report band is snapshotted
///      and left contestable.
contract FeedRegistry is IFeedRegistry, ILanternErrors {
    event SlotConflictRecorded(bytes32 indexed feedId, uint64 round, uint256 firstValue, uint256 secondValue);

    address public immutable controller;
    History private immutable _history;
    ReportBook public immutable book;

    struct Feed {
        address operator;
        bytes32 signerSet;
        uint8   decimals;
        bool    registered;
    }

    mapping(bytes32 => Feed) private _feeds;
    mapping(bytes32 => Report) private _last;
    mapping(bytes32 => mapping(uint64 => Report)) private _byRound;

    constructor(address controller_) {
        if (controller_ == address(0)) revert ZeroAddress();
        controller = controller_;
        _history = new History(address(this));
        book = new ReportBook(address(this));
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotMarket(msg.sender);
        _;
    }

    function registerFeed(bytes32 feedId, address operator, bytes32 signerSet, uint8 decimals) external onlyController {
        Feed storage f = _feeds[feedId];
        if (f.registered) revert FeedAlreadyRegistered(feedId);
        if (operator == address(0)) revert ZeroAddress();
        f.operator = operator;
        f.signerSet = signerSet;
        f.decimals = decimals;
        f.registered = true;
    }

    function operatorOf(bytes32 feedId) external view returns (address) {
        return _feeds[feedId].operator;
    }

    function isRegistered(bytes32 feedId) external view returns (bool) {
        return _feeds[feedId].registered;
    }

    function decimalsOf(bytes32 feedId) external view returns (uint8) {
        return _feeds[feedId].decimals;
    }

    function recordReport(
        bytes32 feedId,
        uint256 value,
        uint64  round,
        uint64  timestamp,
        bytes32 payloadHash,
        address signer
    ) external onlyController {
        Feed storage f = _feeds[feedId];
        if (!f.registered) revert UnknownFeed(feedId);
        if (value == 0) revert ZeroAmount();
        if (timestamp > block.timestamp + 1 minutes) revert ReportTooOld(feedId, timestamp, uint64(block.timestamp));
        if (Provenance.stale(timestamp, block.timestamp)) revert ReportTooOld(feedId, timestamp, uint64(block.timestamp));

        Report storage last = _last[feedId];

        // Claim the slot before anything else: a second print for one round with a different value
        // must leave a mark, otherwise the rule that proves it can never fire. The first print
        // stands as the report; the disagreement is the evidence.
        bool fresh = book.claimSlot(feedId, round, value);
        if (!fresh) {
        ReportBook.Slot memory slot = book.slotOf(feedId, round);
        if (slot.conflicted) {
        emit SlotConflictRecorded(feedId, round, slot.firstValue, value);
        return;
        }
        revert SlotConflict(feedId, round);
        }
        if (last.exists && Provenance.nonMonotone(round, last.round)) {
        revert RoundNotMonotone(feedId, round, last.round);
        }
        // A payload signed for one asset and presented for another is evidence, not a spelling
        // mistake: it is recorded so a challenge can reach it. A true replay for the same feed is
        // still refused outright.
        bytes32 priorOwner = book.payloadFeed(payloadHash);
        if (!book.claimPayload(feedId, round, payloadHash)) {
        if (priorOwner != bytes32(0) && priorOwner != feedId) {
        emit PayloadReuseRecorded(feedId, payloadHash, priorOwner);
        } else {
        revert PayloadReused(payloadHash);
        }
        }

        // Snapshot the band as it stood *before* this value was folded in.
        (uint256 lo, uint256 hi) = _history.bandOf(feedId);

        _history.checkDrift(feedId, value, block.timestamp);
        _history.observe(feedId, value, round, timestamp);

        Report memory rec = Report({
            value: value,
            prevValue: last.exists ? last.value : 0,
            prevBandLo: lo,
            prevBandHi: hi,
            round: round,
            timestamp: timestamp,
            payloadHash: payloadHash,
            signer: signer,
            exists: true
        });
        _byRound[feedId][round] = rec;
        _last[feedId] = rec;
    }

    function reportAt(bytes32 feedId, uint64 round) external view returns (Report memory) {
        return _byRound[feedId][round];
    }

    function lastReport(bytes32 feedId) external view returns (Report memory) {
        return _last[feedId];
    }

    function band(bytes32 feedId) external view returns (uint256 lo, uint256 hi) {
    return _history.bandOf(feedId);
    }

    function history() external view returns (IHistory) {
    return IHistory(address(_history));
    }
}

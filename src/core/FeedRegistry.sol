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
        history = new History(address(this));
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
        if (last.exists && Provenance.nonMonotone(round, last.round)) {
            revert RoundNotMonotone(feedId, round, last.round);
        }
        if (!book.claimSlot(feedId, round, value)) {
            if (book.slotOf(feedId, round).conflicted) revert SlotConflict(feedId, round);
        }
        if (!book.claimPayload(feedId, round, payloadHash)) revert PayloadReused(payloadHash);

        // Snapshot the band as it stood *before* this value was folded in.
        (uint256 lo, uint256 hi) = history.bandOf(feedId);

        history.checkDrift(feedId, value, block.timestamp);
        history.observe(feedId, value, round, timestamp);

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
        return history.bandOf(feedId);
    }
}

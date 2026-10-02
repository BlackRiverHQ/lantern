// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ILanternErrors} from "../interfaces/ILanternErrors.sol";
import {Bytes32Set} from "../libraries/Bytes32Set.sol";
import {Hashing} from "../libraries/Hashing.sol";

/// @title ReportBook
/// @notice What a feed said, keyed by round, plus the provenance of every payload ever seen.
/// @dev Two facts live only here: whether a round was priced twice with different values, and
///      whether one payload was used for two different feeds.
contract ReportBook is ILanternErrors {
    struct Slot {
        uint256 firstValue;
        uint256 otherValue;
        uint64  round;
        bool    seen;
        bool    conflicted;
    }

    address public immutable controller;

    mapping(bytes32 => Slot) private _slots;
    mapping(bytes32 => bytes32) private _payloadFeed;
    mapping(bytes32 => uint64) private _payloadRound;
    Bytes32Set.Set private _payloads;
    mapping(bytes32 => uint256) private _pricedRounds;

    constructor(address controller_) {
        if (controller_ == address(0)) revert ZeroAddress();
        controller = controller_;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotMarket(msg.sender);
        _;
    }

    function claimSlot(bytes32 feedId, uint64 round, uint256 value) external onlyController returns (bool firstTime) {
        Slot storage s = _slots[Hashing.slot(feedId, round)];
        if (!s.seen) {
            s.firstValue = value;
            s.round = round;
            s.seen = true;
            _pricedRounds[feedId] += 1;
            return true;
        }
        if (s.firstValue != value) {
            s.conflicted = true;
            s.otherValue = value;
        }
        return false;
    }

    function claimPayload(bytes32 feedId, uint64 round, bytes32 payloadHash) external onlyController returns (bool firstTime) {
        if (_payloads.contains(payloadHash)) {
            _payloadRound[payloadHash] = round;
            return false;
        }
        _payloads.add(payloadHash);
        _payloadFeed[payloadHash] = feedId;
        _payloadRound[payloadHash] = round;
        return true;
    }

    function slotOf(bytes32 feedId, uint64 round) external view returns (Slot memory) {
        return _slots[Hashing.slot(feedId, round)];
    }

    function payloadFeed(bytes32 payloadHash) external view returns (bytes32) {
        return _payloadFeed[payloadHash];
    }

    function payloadRound(bytes32 payloadHash) external view returns (uint64) {
        return _payloadRound[payloadHash];
    }

    function payloadSeen(bytes32 payloadHash) external view returns (bool) {
        return _payloads.contains(payloadHash);
    }

    function payloadCount() external view returns (uint256) {
        return _payloads.length();
    }

    function pricedRounds(bytes32 feedId) external view returns (uint256) {
        return _pricedRounds[feedId];
    }
}

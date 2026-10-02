// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHistory} from "./IHistory.sol";

/// @title Registry of consumed feeds and the reports that priced liquidations.
interface IFeedRegistry {
    struct Report {
        uint256 value;       // feed-scaled price
        uint64  round;
        uint64  timestamp;
        bytes32 payloadHash; // provenance of the exact payload
        address signer;
        bool    exists;
    }

    function registerFeed(bytes32 feedId, bytes32 signerSet, uint8 decimals) external;
    function recordReport(bytes32 feedId, uint256 value, uint64 round, uint64 timestamp,
                          bytes32 payloadHash, address signer) external;
    function reportAt(bytes32 feedId, uint64 round) external view returns (Report memory);
    function lastReport(bytes32 feedId) external view returns (Report memory);
    function band(bytes32 feedId) external view returns (uint256 lo, uint256 hi);
    function history() external view returns (IHistory);
    function silence(bytes32 feedId) external;
    function silenced(bytes32 feedId) external view returns (bool);
}

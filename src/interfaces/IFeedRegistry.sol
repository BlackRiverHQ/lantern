// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHistory} from "./IHistory.sol";

/// @title Registry of consumed feeds and the reports that priced liquidations.
interface IFeedRegistry {
    /// @notice A recorded report, plus the band that surrounded the value before it landed.
    /// @dev The pre-band is snapshotted so a challenge can recompute what the rule would have
    ///      said at the time, without trusting anyone's recollection.
    struct Report {
        uint256 value;
        uint256 prevValue;
        uint256 prevBandLo;
        uint256 prevBandHi;
        uint64  round;
        uint64  timestamp;
        bytes32 payloadHash;
        address signer;
        bool    exists;
    }

    function registerFeed(bytes32 feedId, address operator, bytes32 signerSet, uint8 decimals) external;
    function recordReport(bytes32 feedId, uint256 value, uint64 round, uint64 timestamp,
                          bytes32 payloadHash, address signer) external;
    function operatorOf(bytes32 feedId) external view returns (address);
    function decimalsOf(bytes32 feedId) external view returns (uint8);
    function registered(bytes32 feedId) external view returns (bool);
    function reportAt(bytes32 feedId, uint64 round) external view returns (Report memory);
    function lastReport(bytes32 feedId) external view returns (Report memory);
    function band(bytes32 feedId) external view returns (uint256 lo, uint256 hi);
    function history() external view returns (IHistory);
}

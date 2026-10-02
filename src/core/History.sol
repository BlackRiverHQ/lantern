// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHistory} from "../interfaces/IHistory.sol";
import {ILanternErrors} from "../interfaces/ILanternErrors.sol";
import {Band} from "../libraries/Band.sol";
import {Constants} from "../libraries/Constants.sol";
import {FixedPoint} from "../libraries/FixedPoint.sol";
import {Packing} from "../libraries/Packing.sol";

/// @title History
/// @notice A feed's own past, and the only thing a band is ever derived from.
/// @dev Built by the registry, which is its only writer. No setters, no owner.
contract History is IHistory, ILanternErrors {
    address public immutable controller;

    mapping(bytes32 => Snapshot) private _snapshot;
    mapping(bytes32 => uint256) private _packed;
    mapping(bytes32 => uint256) private _windowStart;
    mapping(bytes32 => uint256) private _windowAnchor;

    constructor(address controller_) {
        if (controller_ == address(0)) revert ZeroAddress();
        controller = controller_;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotMarket(msg.sender);
        _;
    }

    function snapshot(bytes32 feedId) external view returns (Snapshot memory) {
        return _snapshot[feedId];
    }

    function packed(bytes32 feedId) external view returns (uint256) {
        return _packed[feedId];
    }

    function observe(bytes32 feedId, uint256 value, uint64 round, uint64 timestamp) external onlyController {
        Snapshot storage s = _snapshot[feedId];
        uint32 move = Band.observeMove(
            Band.State({anchor: s.anchor, moveBps: s.moveBps, samples: s.samples}), value
        );
        s.anchor = value;
        s.round = round;
        s.updatedAt = timestamp;
        s.moveBps = move;
        s.samples += 1;
        _packed[feedId] = Packing.pack(round, timestamp, move);
    }

    /// @notice Fail-closed guards: a print that jumps is refused, not absorbed.
    function checkDrift(bytes32 feedId, uint256 value, uint256 nowTs) external onlyController {
        Snapshot storage s = _snapshot[feedId];
        if (s.samples == 0) return;

        if (!Band.withinReportDrift(s.anchor, value)) {
            revert DriftExceeded(s.anchor, value, Constants.MAX_REPORT_DRIFT_BPS);
        }
        if (_windowStart[feedId] == 0 || nowTs - _windowStart[feedId] > Constants.DRIFT_WINDOW) {
            _windowStart[feedId] = nowTs;
            _windowAnchor[feedId] = s.anchor;
        }
        if (FixedPoint.absDiffBps(value, _windowAnchor[feedId]) > Constants.MAX_CUMULATIVE_DRIFT_BPS) {
            revert DriftExceeded(_windowAnchor[feedId], value, Constants.MAX_CUMULATIVE_DRIFT_BPS);
        }
    }

    function bandOf(bytes32 feedId) external view returns (uint256 lo, uint256 hi) {
        Snapshot memory s = _snapshot[feedId];
        (lo, hi) = Band.range(Band.State({anchor: s.anchor, moveBps: s.moveBps, samples: s.samples}));
    }

    function accepts(bytes32 feedId, uint256 value) external view returns (bool) {
        Snapshot memory s = _snapshot[feedId];
        return Band.accepts(Band.State({anchor: s.anchor, moveBps: s.moveBps, samples: s.samples}), value);
    }

    /// @notice How many prints this feed has accepted. It is the only thing standing between a
    ///         freshly registered feed and a liquidation priced on it with no basis for a claim.
    function samplesOf(bytes32 feedId) external view returns (uint256) {
    return _snapshot[feedId].samples;
    }

    function widthBps(bytes32 feedId) external view returns (uint32) {
        Snapshot memory s = _snapshot[feedId];
        return Band.widthBps(Band.State({anchor: s.anchor, moveBps: s.moveBps, samples: s.samples}));
    }
}

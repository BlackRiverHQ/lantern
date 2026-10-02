// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IWindfall} from "../interfaces/IWindfall.sol";
import {IChallenge} from "../interfaces/IChallenge.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {ILanternErrors} from "../interfaces/ILanternErrors.sol";
import {IFeedRegistry} from "../interfaces/IFeedRegistry.sol";
import {FeedRegistry} from "./FeedRegistry.sol";
import {ReportBook} from "./ReportBook.sol";
import {Provenance} from "../libraries/Provenance.sol";
import {BondMath} from "../libraries/BondMath.sol";
import {Verdicts} from "../libraries/Verdicts.sol";
import {WaterfallMath} from "../libraries/WaterfallMath.sol";
import {SafeTransfer} from "../libraries/SafeTransfer.sol";
import {TimeLib} from "../libraries/TimeLib.sol";
import {Constants} from "../libraries/Constants.sol";
import {FixedPoint} from "../libraries/FixedPoint.sol";

/// @title Lantern
/// @notice Holds a liquidation's profit, not its debt. The bonus is escrowed for a window; inside
///         that window anyone may prove, from on-chain evidence alone, that the price report the
///         liquidation consumed could not be true. Upheld: the borrower is restored, the prover is
///         paid from the signer's bond, and the feed's error count moves. Refused: the stake is
///         forfeited. Nothing here can be paused, re-parameterised or upgraded.
/// @dev Lantern builds its own registry, so no contract needs a setter and no address is trusted
///      after construction.
contract Lantern is IWindfall, ILanternErrors {
    event FeedRegistered(bytes32 indexed feedId, address indexed operator);
    event BondDeposited(bytes32 indexed feedId, uint256 amount, uint256 bond);
    event ReportRecorded(bytes32 indexed feedId, uint64 round, uint256 value);
    event LiquidationRecorded(uint256 indexed liquidationId, bytes32 indexed feedId, uint256 bonus, uint64 deadline);
    event ChallengeOpened(uint256 indexed liquidationId, address indexed prover, uint8 rule, uint256 stake);
    event ChallengeUpheld(uint256 indexed liquidationId, uint8 rule, uint256 observed, uint256 bound);
    event ChallengeRefused(uint256 indexed liquidationId, uint256 stakeForfeited);
    event BonusReleased(uint256 indexed liquidationId, address indexed liquidator, uint256 amount);
    event ShortfallQueued(uint256 indexed liquidationId, uint256 remainder);
    event ShortfallPaid(uint256 indexed liquidationId, uint256 amount);

    struct FeedState {
        address operator;
        uint256 bond;
        uint256 exposure;
        uint256 errors;
        bool    registered;
    }

    struct Escrow {
        bytes32 feedId;
        uint64  round;
        uint64  recordedAt;
        uint64  deadline;
        uint256 bonus;
        address liquidator;
        address borrower;
        uint8   outcome;
        bool    exists;
    }

    struct ChallengeRec {
        address prover;
        uint256 stake;
        uint8   rule;
        bytes32 evidenceHash;
        bool    resolved;
        bool    upheld;
        uint64  openedAt;
    }

    IERC20 public immutable asset;
    FeedRegistry public immutable reg;
    address public immutable market;
    uint64 public immutable holdWindow;
    uint16 public immutable bountyBps;

    mapping(bytes32 => FeedState) private _feeds;
    mapping(uint256 => Escrow) private _escrows;
    mapping(uint256 => ChallengeRec) private _challenges;
    mapping(bytes32 => uint256[]) private _queue;
    mapping(bytes32 => uint256) private _queueHead;
    mapping(uint256 => uint256) private _queued;
    uint256 private _heldTotal;

    uint256 public recorded;
    uint256 public challengesOpened;

    modifier onlyMarket() {
        if (msg.sender != market) revert NotMarket(msg.sender);
        _;
    }

    modifier onlyOperator(bytes32 feedId) {
        if (_feeds[feedId].operator != msg.sender) revert NotMarket(msg.sender);
        _;
    }

    modifier knownFeed(bytes32 feedId) {
        if (!_feeds[feedId].registered) revert UnknownFeed(feedId);
        _;
    }

    constructor(IERC20 asset_, address market_, uint64 holdWindow_, uint16 bountyBps_) {
        if (address(asset_) == address(0) || market_ == address(0)) revert ZeroAddress();
        require(bountyBps_ <= Constants.BPS, "BOUNTY");
        asset = asset_;
        market = market_;
        holdWindow = TimeLib.validateWindow(holdWindow_);
        bountyBps = bountyBps_;
        reg = new FeedRegistry(address(this));
    }

    // --- views -------------------------------------------------------------

    function operatorOf(bytes32 feedId) external view returns (address) { return _feeds[feedId].operator; }
    function bondOf(bytes32 feedId) external view returns (uint256) { return _feeds[feedId].bond; }
    function exposureOf(bytes32 feedId) external view returns (uint256) { return _feeds[feedId].exposure; }
    function feedErrors(bytes32 feedId) external view returns (uint256) { return _feeds[feedId].errors; }
    function heldTotal() external view returns (uint256) { return _heldTotal; }
    function queuedOf(uint256 liquidationId) external view returns (uint256) { return _queued[liquidationId]; }

    function exposureFloor(bytes32 feedId) external view returns (uint256) {
        return BondMath.exposureFloor(_feeds[feedId].exposure);
    }

    function isPriceable(bytes32 feedId) public view returns (bool) {
        FeedState storage f = _feeds[feedId];
        return f.registered && BondMath.isPriceable(f.bond, f.exposure);
    }

    function priceable(bytes32 feedId) external view returns (bool) { return isPriceable(feedId); }
    function escrowOf(uint256 liquidationId) external view returns (Escrow memory) { return _escrows[liquidationId]; }
    function challengeOf(uint256 liquidationId) external view returns (ChallengeRec memory) { return _challenges[liquidationId]; }
    function bonusSettled(uint256 liquidationId) external view returns (bool) { return _escrows[liquidationId].outcome != 0; }
    function bonusOutcome(uint256 liquidationId) external view returns (uint8) { return _escrows[liquidationId].outcome; }
    function queueRemaining(bytes32 feedId) external view returns (uint256) { return _queue[feedId].length - _queueHead[feedId]; }

    // --- feeds and bonds ---------------------------------------------------

    function registerFeed(bytes32 feedId, bytes32 signerSet, uint8 decimals) external {
        if (_feeds[feedId].registered) revert FeedAlreadyRegistered(feedId);
        _feeds[feedId] = FeedState({operator: msg.sender, bond: 0, exposure: 0, errors: 0, registered: true});
        reg.registerFeed(feedId, msg.sender, signerSet, decimals);
        emit FeedRegistered(feedId, msg.sender);
    }

    function depositBond(bytes32 feedId, uint256 amount) external onlyOperator(feedId) knownFeed(feedId) {
        if (amount == 0) revert ZeroAmount();
        SafeTransfer.pull(asset, msg.sender, amount);
        _feeds[feedId].bond += amount;
        emit BondDeposited(feedId, amount, _feeds[feedId].bond);
        _settleQueue(feedId);
    }

    function withdrawBond(bytes32 feedId, uint256 amount) external onlyOperator(feedId) knownFeed(feedId) {
        FeedState storage f = _feeds[feedId];
        uint256 allowed = BondMath.withdrawable(f.bond, f.exposure, amount);
        if (allowed == 0) revert UnderBonded(feedId, f.bond, BondMath.exposureFloor(f.exposure));
        f.bond -= allowed;
        SafeTransfer.push(asset, msg.sender, allowed);
    }

    // --- reports and liquidations ------------------------------------------

    function recordReport(
        bytes32 feedId,
        uint256 value,
        uint64  round,
        uint64  timestamp,
        bytes32 payloadHash,
        address signer
    ) external onlyOperator(feedId) knownFeed(feedId) {
        if (!isPriceable(feedId)) {
            revert UnderBonded(feedId, _feeds[feedId].bond, BondMath.exposureFloor(_feeds[feedId].exposure));
        }
        reg.recordReport(feedId, value, round, timestamp, payloadHash, signer);
        emit ReportRecorded(feedId, round, value);
    }

    function recordLiquidation(
        uint256 liquidationId,
        bytes32 feedId,
        uint64  round,
        uint256 bonus,
        address liquidator,
        address borrower
    ) external onlyMarket {
        if (_escrows[liquidationId].exists) revert LiquidationAlreadySettled(liquidationId);
        if (bonus == 0) revert ZeroAmount();

        FeedState storage f = _feeds[feedId];
        if (!f.registered) revert UnknownFeed(feedId);
        IFeedRegistry.Report memory r = reg.reportAt(feedId, round);
        if (!r.exists) revert UnknownFeed(feedId);

        uint256 nextExposure = f.exposure + bonus;
        uint256 required = BondMath.exposureFloor(nextExposure);
        if (f.bond < required) revert UnderBonded(feedId, f.bond, required);

        SafeTransfer.pull(asset, market, bonus);
        f.exposure = nextExposure;
        _heldTotal += bonus;

        _escrows[liquidationId] = Escrow({
            feedId: feedId,
            round: round,
            recordedAt: uint64(block.timestamp),
            deadline: TimeLib.deadline(block.timestamp, holdWindow),
            bonus: bonus,
            liquidator: liquidator,
            borrower: borrower,
            outcome: 0,
            exists: true
        });
        recorded += 1;
        emit LiquidationRecorded(liquidationId, feedId, bonus, _escrows[liquidationId].deadline);
    }

    // (continued)
}

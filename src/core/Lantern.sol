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
    event PeerDeclared(bytes32 indexed feedId, bytes32 indexed peer);
    event ChallengeVoided(uint256 indexed liquidationId, uint256 stakeForfeited);

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
    /// @notice The asset's own decimals, read once. The minimum bond and the minimum stake are
    ///         derived from it, so a 6-decimal asset is not asked for an 18-decimal floor.
    uint8 public immutable assetDecimals;

    mapping(bytes32 => FeedState) private _feeds;
    mapping(uint256 => Escrow) private _escrows;
    mapping(uint256 => ChallengeRec) private _challenges;
    mapping(bytes32 => bytes32) private _peer;
    uint256 private _heldTotal;
    bool private _locked;

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

    /// @dev Cheap insurance on top of the effects-before-interactions ordering: a hostile token
    ///      cannot re-enter any state-changing entry point.
    modifier nonReentrant() {
    if (_locked) revert Reentrancy();
    _locked = true;
    _;
    _locked = false;
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
        assetDecimals = _readDecimals(address(asset_));
        reg = new FeedRegistry(address(this));
    }

    /// @dev A token that will not answer decimals() is treated as 18-decimal, which is the common
    ///      case for the assets this was written against. Above 18 is refused rather than rounded.
    function _readDecimals(address token) private view returns (uint8) {
    (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
    if (!ok || data.length < 32) return 18;
    uint256 d = abi.decode(data, (uint256));
    if (d > 18) revert BadDecimals(d);
    return uint8(d);
    }

    /// @notice The smallest bond this deployment accepts: 0.1 of the asset.
    function minBond() public view returns (uint256) { return 10 ** assetDecimals / 10; }

    /// @notice The smallest stake this deployment accepts: 0.001 of the asset.
    function minStake() public view returns (uint256) { return 10 ** assetDecimals / 1000; }

    // --- views -------------------------------------------------------------

    function operatorOf(bytes32 feedId) external view returns (address) { return _feeds[feedId].operator; }
    function bondOf(bytes32 feedId) external view returns (uint256) { return _feeds[feedId].bond; }
    function exposureOf(bytes32 feedId) external view returns (uint256) { return _feeds[feedId].exposure; }
    function feedErrors(bytes32 feedId) external view returns (uint256) { return _feeds[feedId].errors; }
    function peerOf(bytes32 feedId) external view returns (bytes32) { return _peer[feedId]; }

    /// @notice What this feed's bond must currently be: its own exposure, escalated by how many
    ///         times it has been caught.
    function requiredBond(bytes32 feedId) public view returns (uint256) {
    FeedState storage f = _feeds[feedId];
    return BondMath.penalisedFloor(
    BondMath.exposureFloor(f.exposure, minBond()), f.errors, Constants.ERROR_BOND_PENALTY_BPS
    );
    }
    function heldTotal() external view returns (uint256) { return _heldTotal; }

    function exposureFloor(bytes32 feedId) external view returns (uint256) {
        return BondMath.exposureFloor(_feeds[feedId].exposure, minBond());
    }

    function isPriceable(bytes32 feedId) public view returns (bool) {
        FeedState storage f = _feeds[feedId];
        return f.registered && BondMath.isPriceable(f.bond, f.exposure, minBond());
    }

    function priceable(bytes32 feedId) external view returns (bool) { return isPriceable(feedId); }
    function escrowOf(uint256 liquidationId) external view returns (Escrow memory) { return _escrows[liquidationId]; }
    function challengeOf(uint256 liquidationId) external view returns (ChallengeRec memory) { return _challenges[liquidationId]; }
    function bonusSettled(uint256 liquidationId) external view returns (bool) { return _escrows[liquidationId].outcome != 0; }
    function bonusOutcome(uint256 liquidationId) external view returns (uint8) { return _escrows[liquidationId].outcome; }

    // --- feeds and bonds ---------------------------------------------------

    function registerFeed(bytes32 feedId, bytes32 signerSet, uint8 decimals) external nonReentrant {
    if (_feeds[feedId].registered) revert FeedAlreadyRegistered(feedId);
    // The floors are derived from the asset, so a feed declaring different decimals would be
    // priced against the wrong unit.
    if (decimals != assetDecimals) revert DecimalsMismatch(decimals, assetDecimals);
        _feeds[feedId] = FeedState({operator: msg.sender, bond: 0, exposure: 0, errors: 0, registered: true});
        reg.registerFeed(feedId, msg.sender, signerSet, decimals);
        emit FeedRegistered(feedId, msg.sender);
    }

    function depositBond(bytes32 feedId, uint256 amount) external knownFeed(feedId) onlyOperator(feedId) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        SafeTransfer.pull(asset, msg.sender, amount);
        _feeds[feedId].bond += amount;
        emit BondDeposited(feedId, amount, _feeds[feedId].bond);
    }

    function withdrawBond(bytes32 feedId, uint256 amount) external knownFeed(feedId) onlyOperator(feedId) nonReentrant {
        FeedState storage f = _feeds[feedId];
        uint256 allowed = BondMath.withdrawable(f.bond, f.exposure, amount, minBond());
        if (allowed == 0) revert UnderBonded(feedId, f.bond, BondMath.exposureFloor(f.exposure, minBond()));
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
    ) external knownFeed(feedId) onlyOperator(feedId) nonReentrant {
        if (!isPriceable(feedId)) {
            revert UnderBonded(feedId, _feeds[feedId].bond, BondMath.exposureFloor(_feeds[feedId].exposure, minBond()));
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
    ) external onlyMarket nonReentrant {
        if (_escrows[liquidationId].exists) revert LiquidationAlreadySettled(liquidationId);
        if (bonus == 0) revert ZeroAmount();

        FeedState storage f = _feeds[feedId];
        if (!f.registered) revert UnknownFeed(feedId);
        IFeedRegistry.Report memory r = reg.reportAt(feedId, round);
        if (!r.exists) revert UnknownFeed(feedId);

        uint256 nextExposure = f.exposure + bonus;
        uint256 required = BondMath.exposureFloor(nextExposure, minBond());
        if (f.bond < required) revert UnderBonded(feedId, f.bond, required);

        // Effects before interactions, for the same reason: the escrow must exist before any
        // token code runs.
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
        SafeTransfer.pull(asset, market, bonus);
        emit LiquidationRecorded(liquidationId, feedId, bonus, _escrows[liquidationId].deadline);
    }

    // --- challenges --------------------------------------------------------

    /// @notice One challenge per liquidation; the liquidation id is the challenge id. Stakes are
    ///         denominated in the same asset as the held bonus.
    function openChallenge(
        uint256 liquidationId,
        IChallenge.Rule rule,
        bytes calldata evidence,
        uint256 stake
    ) external nonReentrant returns (uint256) {
        Escrow storage e = _escrows[liquidationId];
        if (!e.exists) revert UnknownLiquidation(liquidationId);
        if (e.outcome != 0) revert LiquidationAlreadySettled(liquidationId);
        if (TimeLib.isClosed(block.timestamp, e.deadline)) revert WindowClosed(liquidationId, e.deadline);
        if (_challenges[liquidationId].prover != address(0)) revert ChallengeAlreadyOpen(liquidationId);
        if (evidence.length == 0) revert EmptyEvidence();
        if (uint8(rule) > uint8(IChallenge.Rule.PAYLOAD_PROVENANCE)) revert BadRuleKind(uint8(rule));

        uint256 floor = WaterfallMath.stakeFloor(e.bonus, minStake());
        if (stake < floor) revert StakeBelowMinimum(stake, floor);
        // Effects before interactions: a hostile token must not be able to re-enter and open a
        // second challenge against the same escrow.
        _challenges[liquidationId] = ChallengeRec({
            prover: msg.sender,
            stake: stake,
            rule: uint8(rule),
            evidenceHash: keccak256(evidence),
            resolved: false,
            upheld: false,
            openedAt: uint64(block.timestamp)
        });
        challengesOpened += 1;
        SafeTransfer.pull(asset, msg.sender, stake);
        emit ChallengeOpened(liquidationId, msg.sender, uint8(rule), stake);
        return liquidationId;
    }

    // --- adjudication ------------------------------------------------------

    /// @notice Recompute the claim from state. The prover supplies nothing but the rule; every
    ///         number used is read here.
    function adjudicate(uint256 liquidationId) external nonReentrant returns (bool upheld) {
        Escrow storage e = _escrows[liquidationId];
        if (!e.exists) revert UnknownLiquidation(liquidationId);
        if (e.outcome != 0) revert LiquidationAlreadySettled(liquidationId);

        ChallengeRec storage c = _challenges[liquidationId];
        if (c.prover == address(0)) revert UnknownChallenge(liquidationId);
        if (c.resolved) revert ChallengeAlreadyResolved(liquidationId);

        IFeedRegistry.Report memory r = reg.reportAt(e.feedId, e.round);
        ReportBook.Slot memory slot = reg.book().slotOf(e.feedId, e.round);
        bytes32 payloadFeed = reg.book().payloadFeed(r.payloadHash);

        uint256 observed;
        uint256 bound;
        (upheld, observed, bound) = Verdicts.evaluate(
            Provenance.Rule(c.rule),
            Verdicts.Inputs({
                report: r,
                slotConflicted: slot.conflicted,
                otherValueForRound: slot.otherValue,
                payloadFeed: payloadFeed,
                thisFeed: e.feedId,
                liquidationTime: e.recordedAt
            })
        );
        c.resolved = true;
        c.upheld = upheld;

        if (!upheld) {
            SafeTransfer.push(asset, e.liquidator, c.stake);
            emit ChallengeRefused(liquidationId, c.stake);
            return false;
        }

        FeedState storage f = _feeds[e.feedId];
        _heldTotal -= e.bonus;
        f.exposure = f.exposure > e.bonus ? f.exposure - e.bonus : 0;
        f.errors += 1;
        e.outcome = 2;

        // Borrower first, then the prover out of the at-fault party's bond.
        SafeTransfer.push(asset, e.borrower, e.bonus);
        // The bond must cover exposure 1:1, so the bounty is always payable here.
        // No deferral path exists, and none is pretended.
        uint256 bounty = FixedPoint.bpsOf(e.bonus, bountyBps);
        (uint256 paid, ) = BondMath.chargeable(f.bond, bounty);
        f.bond -= paid;
        SafeTransfer.push(asset, c.prover, c.stake + paid);
        emit ChallengeUpheld(liquidationId, c.rule, observed, bound);
        return true;
    }

    // --- release and the shortfall queue -----------------------------------

    function release(uint256 liquidationId) external nonReentrant {
        Escrow storage e = _escrows[liquidationId];
        if (!e.exists) revert UnknownLiquidation(liquidationId);
        if (e.outcome != 0) revert LiquidationAlreadySettled(liquidationId);
        if (TimeLib.isOpen(block.timestamp, e.deadline)) revert WindowOpen(liquidationId, e.deadline);

        ChallengeRec storage c = _challenges[liquidationId];
        if (c.prover != address(0) && !c.resolved) revert ChallengeAlreadyOpen(liquidationId);

        FeedState storage f = _feeds[e.feedId];
        _heldTotal -= e.bonus;
        f.exposure = f.exposure > e.bonus ? f.exposure - e.bonus : 0;
        e.outcome = 1;
        SafeTransfer.push(asset, e.liquidator, e.bonus);
        emit BonusReleased(liquidationId, e.liquidator, e.bonus);
    }
}

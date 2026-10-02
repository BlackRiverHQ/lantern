// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";
import {IWindfall} from "../interfaces/IWindfall.sol";
import {IFeedRegistry} from "../interfaces/IFeedRegistry.sol";
import {IWindfallMarket} from "../interfaces/IWindfallMarket.sol";
import {SafeTransfer} from "../libraries/SafeTransfer.sol";
import {FixedPoint} from "../libraries/FixedPoint.sol";
import {Constants} from "../libraries/Constants.sol";

/// @title LendingMarket
/// @notice An isolated lending market that prices its collateral from a feed Lantern underwrites, and
///         reports every liquidation back to Lantern with the notional it actually consumed.
///
///         This is the counterparty Lantern is built for. A market that guessed its notional would make
///         the notional-sized bond meaningless, and a market that paid the liquidator's profit outright
///         would have nothing to redirect when the print that priced the liquidation turned out to be
///         false. So the profit is not paid outright: it is escrowed with Lantern, and the collateral
///         the liquidation seized is held here until Lantern says who it belongs to.
///
/// @dev Money, for one liquidation, with `repay` of debt and a bonus `b`:
///
///        the liquidator pays  repay + b        (the debt, plus their own contingent profit)
///        and receives collateral worth  repay * (1 + b)
///
///        on release (outcome 1)   the collateral goes to the liquidator, Lantern pays them `b`,
///                                 so their profit is exactly `b` - and the market keeps `repay`,
///                                 which is the loan coming back
///        on redirect (outcome 2)  the collateral goes back to the borrower, the market refunds
///                                 `repay` to the liquidator, and Lantern pays `b` to the borrower,
///                                 so the liquidator is down exactly `b` - their profit - and not
///                                 their principal
///
///      The liquidator funds the escrow themselves rather than the market funding it from a fee pool.
///      That is the point: the money at risk when a liquidation is unjustified is the money that was
///      made by liquidating.
///
///      Interest is not modelled. A position owes exactly what was borrowed, so nothing here depends
///      on an index that could drift from what a borrower was told.
contract LendingMarket {
    using SafeTransfer for IERC20;

    /// @notice Collateral, priced by the feed.
    IERC20 public immutable collateral;
    /// @notice What is lent, what the bonus is denominated in, and what Lantern holds.
    IERC20 public immutable asset;
    IWindfall public immutable lantern;
    IFeedRegistry public immutable registry;
    /// @notice The feed that prices the collateral. The market will not price a liquidation with any
    ///         other value, and will not price one at all while the feed cannot cover its exposure.
    bytes32 public immutable feedId;

    /// @notice The most that may be borrowed against collateral value, in basis points.
    uint16 public immutable collateralFactorBps;
    /// @notice The liquidator's profit, as a share of the debt they repay.
    uint16 public immutable liquidationBonusBps;
    /// @notice The most of one position's debt a single liquidation may repay.
    uint16 public immutable closeFactorBps;

    uint8 public immutable collateralDecimals;
    uint8 public immutable assetDecimals;

    /// @dev outcome values, as Lantern publishes them
    uint8 internal constant RELEASED = 1;
    uint8 internal constant REDIRECTED = 2;
    /// @dev a seizure that has not been claimed yet
    uint8 internal constant HELD = 1;
    uint8 internal constant CLAIMED = 2;

    struct Account {
        uint256 posted;    // collateral in the market's custody
        uint256 debt;      // asset owed
        uint256 supplied;  // asset lent, withdrawable while idle
    }

    /// @notice What a liquidation took, held until Lantern decides where it goes.
    struct Seizure {
        address borrower;
        address liquidator;
        uint256 collateralAmount;
        uint256 repayAmount;
        uint8 state;
    }

    mapping(address => Account) internal _accounts;
    mapping(uint256 => Seizure) internal _seizures;

    uint256 public suppliedTotal;
    uint256 public borrowedTotal;
    uint256 public liquidationsSeen;
    bool internal _locked;

    error Reentrancy();
    error ZeroAmount();
    error InsufficientCollateral(uint256 requested, uint256 posted);
    error InsufficientSupplied(uint256 requested, uint256 available);
    error InsufficientLiquidity(uint256 requested, uint256 idle);
    error InsufficientBalance(uint256 requested, uint256 held);
    error WouldBeUnhealthy(uint256 debtAfter, uint256 limit);
    error PositionIsHealthy(address borrower, uint256 debt, uint256 limit);
    error NothingToLiquidate(address borrower);
    error RepayOutOfRange(uint256 requested, uint256 cap);
    error SeizeExceedsCollateral(uint256 needed, uint256 posted);
    error FeedCannotPrice(bytes32 feedId);
    error UnknownRound(uint64 round);
    error UnknownLiquidation(uint256 liquidationId);
    error AlreadyClaimed(uint256 liquidationId);
    error NotSettled(uint256 liquidationId);
    error BadOutcome(uint8 outcome);

    event Supplied(address indexed lender, uint256 amount);
    event Withdrawn(address indexed lender, uint256 amount);
    event CollateralPosted(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount);
    event Repaid(address indexed borrower, uint256 amount);
    event Liquidated(
        uint256 indexed liquidationId,
        address indexed borrower,
        address indexed liquidator,
        uint256 repaid,
        uint256 seized,
        uint256 bonus,
        uint256 notional,
        uint64 round
    );
    event SeizureClaimed(uint256 indexed liquidationId, uint8 outcome, address to, uint256 amount);

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        IERC20 collateral_,
        IERC20 asset_,
        IWindfall lantern_,
        IFeedRegistry registry_,
        bytes32 feedId_,
        uint16 collateralFactorBps_,
        uint16 liquidationBonusBps_,
        uint16 closeFactorBps_,
        uint8 collateralDecimals_,
        uint8 assetDecimals_
    ) {
        if (collateralFactorBps_ == 0 || collateralFactorBps_ > Constants.BPS) revert RepayOutOfRange(collateralFactorBps_, Constants.BPS);
        if (liquidationBonusBps_ > Constants.BPS) revert RepayOutOfRange(liquidationBonusBps_, Constants.BPS);
        if (closeFactorBps_ == 0 || closeFactorBps_ > Constants.BPS) revert RepayOutOfRange(closeFactorBps_, Constants.BPS);

        collateral = collateral_;
        asset = asset_;
        lantern = lantern_;
        registry = registry_;
        feedId = feedId_;
        collateralFactorBps = collateralFactorBps_;
        liquidationBonusBps = liquidationBonusBps_;
        closeFactorBps = closeFactorBps_;
        collateralDecimals = collateralDecimals_;
        assetDecimals = assetDecimals_;
    }

    // --- lenders -----------------------------------------------------------

    /// @notice Lend the settlement asset. Shares are one-to-one and there is no interest, so what is
    ///         owed back is exactly what was put in.
    function supply(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accounts[msg.sender].supplied += amount;
        suppliedTotal += amount;
        asset.pull(msg.sender, amount);
        emit Supplied(msg.sender, amount);
    }

    /// @notice Take back what has not been lent out. A withdrawal cannot reach into a live loan,
    ///         because the asset for that loan is not in the market's hands.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Account storage a = _accounts[msg.sender];
        if (amount > a.supplied) revert InsufficientSupplied(amount, a.supplied);
        uint256 idle = asset.balanceOf(address(this));
        if (amount > idle) revert InsufficientLiquidity(amount, idle);
        a.supplied -= amount;
        suppliedTotal -= amount;
        asset.push(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // --- borrowers ---------------------------------------------------------

    function depositCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accounts[msg.sender].posted += amount;
        collateral.pull(msg.sender, amount);
        emit CollateralPosted(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Account storage a = _accounts[msg.sender];
        if (amount > a.posted) revert InsufficientCollateral(amount, a.posted);
        a.posted -= amount;
        if (a.debt != 0) {
            uint256 limit = _borrowLimit(_collateralValue(a.posted, _priceAt(registry.lastReport(feedId).round)));
            if (a.debt > limit) revert WouldBeUnhealthy(a.debt, limit);
        }
        collateral.push(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /// @notice Borrow against posted collateral, at the feed's current price.
    function borrow(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Account storage a = _accounts[msg.sender];
        uint256 idle = asset.balanceOf(address(this));
        if (amount > idle) revert InsufficientLiquidity(amount, idle);

        uint256 debtAfter = a.debt + amount;
        uint256 limit = _borrowLimit(_collateralValue(a.posted, _lastPrice()));
        if (debtAfter > limit) revert WouldBeUnhealthy(debtAfter, limit);

        a.debt = debtAfter;
        borrowedTotal += amount;
        asset.push(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /// @notice Pay debt back. There is no interest to settle first.
    function repay(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Account storage a = _accounts[msg.sender];
        if (amount > a.debt) revert InsufficientBalance(amount, a.debt);
        a.debt -= amount;
        borrowedTotal -= amount;
        asset.pull(msg.sender, amount);
        emit Repaid(msg.sender, amount);
    }

    // --- liquidation -------------------------------------------------------

    /// @notice Liquidate an unhealthy position, priced by the feed's report for `round`.
    /// @dev The price is the feed's, not the caller's, and the round has to be named so the value that
    ///      priced this liquidation is the value Lantern will judge. A feed that cannot cover its
    ///      exposure cannot price at all: that refusal is Lantern's, read here, not re-derived.
    /// @param liquidationId the id Lantern will hold the escrow under
    /// @param round the feed round whose print priced this liquidation
    /// @param repayAmount how much of the borrower's debt the liquidator is closing
    function liquidate(address borrower, uint256 liquidationId, uint64 round, uint256 repayAmount)
    external
    nonReentrant
    {
        if (repayAmount == 0) revert ZeroAmount();
        if (!lantern.priceable(feedId)) revert FeedCannotPrice(feedId);

        Account storage a = _accounts[borrower];
        if (a.debt == 0) revert NothingToLiquidate(borrower);

        uint256 price = _priceAt(round);
        {
            uint256 limit = _borrowLimit(_collateralValue(a.posted, price));
            if (a.debt <= limit) revert PositionIsHealthy(borrower, a.debt, limit);
        }
        {
            uint256 cap = FixedPoint.bpsOf(a.debt, closeFactorBps);
            if (repayAmount > cap) revert RepayOutOfRange(repayAmount, cap);
        }

        // The value the liquidation consumed, in the asset's own units: the debt repaid plus the
        // discount the borrower lost. This is what the bond is sized against, and the escrow is the
        // profit inside it.
        uint256 notional = repayAmount + FixedPoint.bpsOf(repayAmount, liquidationBonusBps);
        uint256 seize = _collateralFor(notional, price);
        if (seize > a.posted) revert SeizeExceedsCollateral(seize, a.posted);

        // Effects before interactions, the same order Lantern keeps.
        a.debt -= repayAmount;
        a.posted -= seize;
        borrowedTotal -= repayAmount;
        liquidationsSeen += 1;
        _seizures[liquidationId] = Seizure({
            borrower: borrower,
            liquidator: msg.sender,
            collateralAmount: seize,
            repayAmount: repayAmount,
            state: HELD
        });

        // The liquidator's own money, including the profit they stand to make.
        asset.pull(msg.sender, notional);
        // Lantern pulls the escrow from here while recording. The allowance is cleared immediately
        // afterwards so a stale approval cannot be spent later.
        asset.approve(address(lantern), notional - repayAmount);
        lantern.recordLiquidation(
            liquidationId, feedId, round, notional - repayAmount, notional, msg.sender, borrower
        );
        asset.approve(address(lantern), 0);

        emit Liquidated(
            liquidationId, borrower, msg.sender, repayAmount, seize, notional - repayAmount, notional, round
        );
    }

    /// @notice Settle a seizure once Lantern has decided the liquidation's fate. Permissionless: the
    ///         addresses that receive are recorded, not the caller.
    /// @return released true when the liquidation stood and the collateral went to the liquidator
    function claim(uint256 liquidationId) external nonReentrant returns (bool released) {
        Seizure storage s = _seizures[liquidationId];
        if (s.state == 0) revert UnknownLiquidation(liquidationId);
        if (s.state == CLAIMED) revert AlreadyClaimed(liquidationId);
        if (!lantern.bonusSettled(liquidationId)) revert NotSettled(liquidationId);

        uint8 outcome = lantern.bonusOutcome(liquidationId);
        s.state = CLAIMED;

        if (outcome == RELEASED) {
            collateral.push(s.liquidator, s.collateralAmount);
            emit SeizureClaimed(liquidationId, outcome, s.liquidator, s.collateralAmount);
            return true;
        }
        if (outcome != REDIRECTED) revert BadOutcome(outcome);

        // The liquidation should not have happened. The borrower gets the collateral back, and the
        // liquidator gets their principal back - what they do not get is the profit, which Lantern
        // has already sent to the borrower.
        collateral.push(s.borrower, s.collateralAmount);
        asset.push(s.liquidator, s.repayAmount);
        emit SeizureClaimed(liquidationId, outcome, s.borrower, s.collateralAmount);
        return false;
    }

    // --- views -------------------------------------------------------------

    function accountOf(address who) external view returns (Account memory) {
        return _accounts[who];
    }

    function seizureOf(uint256 liquidationId) external view returns (Seizure memory) {
        return _seizures[liquidationId];
    }

    /// @notice The feed's value for a round, refused when there is no report at that round.
    function priceAt(uint64 round) external view returns (uint256) {
        return _priceAt(round);
    }

    /// @notice Collateral value in the asset's units at a given feed value.
    function collateralValueOf(address who, uint256 price) external view returns (uint256) {
        return _collateralValue(_accounts[who].posted, price);
    }

    /// @notice What may be borrowed against a collateral value.
    function borrowLimitFor(uint256 collateralValue) external view returns (uint256) {
        return _borrowLimit(collateralValue);
    }

    /// @notice Debt against limit at a given feed value, both in the asset's units. Debt greater than
    ///         the limit is what makes a position liquidatable.
    function healthOf(address who, uint256 price) external view returns (uint256 debt, uint256 limit) {
        debt = _accounts[who].debt;
        limit = _borrowLimit(_collateralValue(_accounts[who].posted, price));
    }

    /// @notice Collateral a liquidation would seize for a repayment at a given price.
    function seizeFor(uint256 repayAmount, uint256 price) external view returns (uint256) {
        return _collateralFor(repayAmount + FixedPoint.bpsOf(repayAmount, liquidationBonusBps), price);
    }

    // --- internals ---------------------------------------------------------

    function _lastPrice() internal view returns (uint256) {
        return _priceAt(registry.lastReport(feedId).round);
    }

    function _priceAt(uint64 round) internal view returns (uint256) {
        IFeedRegistry.Report memory r = registry.reportAt(feedId, round);
        if (!r.exists) revert UnknownRound(round);
        return r.value;
    }

    /// @notice A feed value is in the feed's own decimals and is the asset value of one whole
    ///         collateral token. Token decimals differ, so the conversion is explicit rather than
    ///         assumed: 18-decimal collateral priced by an 18-decimal feed against a 6-decimal asset
    ///         divides by 1e30, and the other direction multiplies.
    function _collateralValue(uint256 amount, uint256 price) internal view returns (uint256) {
        if (amount == 0) return 0;
        uint16 coll = collateralDecimals;
        uint16 feed = registry.decimalsOf(feedId);
        uint16 assetD = assetDecimals;
        if (assetD >= coll + feed) {
            return FixedPoint.mulDiv(amount * (10 ** (assetD - coll - feed)), price, 1);
        }
        return FixedPoint.mulDiv(amount, price, 10 ** (coll + feed - assetD));
    }

    /// @notice The inverse: the collateral that carries a given asset value.
    function _collateralFor(uint256 value, uint256 price) internal view returns (uint256) {
        if (value == 0) return 0;
        if (price == 0) revert UnknownRound(0);
        uint16 coll = collateralDecimals;
        uint16 feed = registry.decimalsOf(feedId);
        uint16 assetD = assetDecimals;
        if (assetD >= coll + feed) {
            return FixedPoint.mulDiv(value, 1, price * (10 ** (assetD - coll - feed)));
        }
        return FixedPoint.mulDiv(value, 10 ** (coll + feed - assetD), price);
    }

    function _borrowLimit(uint256 collateralValue) internal view returns (uint256) {
        return FixedPoint.bpsOf(collateralValue, collateralFactorBps);
    }
}

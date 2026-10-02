// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {MockToken6} from "../../src/mocks/MockToken6.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {LendingMarket} from "../../src/market/LendingMarket.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {IFeedRegistry} from "../../src/interfaces/IFeedRegistry.sol";
import {IWindfall} from "../../src/interfaces/IWindfall.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";

/// @title LendingMarketTest
/// @notice A market with real collateral, real debt, and a price it takes from a feed. The point of
///         these tests is the thing a stand-in cannot show: a liquidation this market performs is
///         priced by a print Lantern can then falsify, and the verdict moves real collateral.
///
///         Collateral is 18 decimals, the settlement asset is 6, and the feed quotes the asset value
///         of one whole collateral token in 18-decimal fixed point - 2,690e18 means one WETH is worth
///         2,690 USDC. The conversion between the three is the market's own, and it is asserted.
contract LendingMarketTest is Test {
    MockToken internal collateralToken;
    MockToken6 internal assetToken;
    Lantern internal lantern;
    LendingMarket internal market;

    address internal constant OPERATOR = address(0xA11CE);
    address internal constant LIQUIDATOR = address(0xB0B);
    address internal constant BORROWER = address(0xCAFE);
    address internal constant LENDER = address(0xF00D);
    address internal constant PROVER = address(0xD00D);

    bytes32 internal constant FEED = keccak256("FEED:WETH-USD");
    bytes32 internal constant PEER = keccak256("FEED:WETH-USD-PEER");

    uint64 internal constant WINDOW = 60;
    uint16 internal constant BOUNTY = 2_000;

    /// @dev Both sources agree on this, which is what makes a print away from it falsifiable. A feed
    ///      declares the asset's own decimals - Lantern refuses any other - so a price is quoted in
    ///      the settlement asset: 2,690e6 is 2,690 USDC.
    uint256 internal constant TRUE_PRICE = 2_690e6;
    /// @dev 18.2% below the true price: inside the 20% per-report drift cap, outside the 5% tolerance.
    uint256 internal constant LYING_PRICE = 2_200e6;

    /// @dev 2 WETH posted against a 3,658 USDC debt is 68% of the 70% borrow limit - healthy at the
    ///      true price, and underwater at the lying one.
    uint256 internal constant POSTED = 2e18;
    uint256 internal constant DEBT = 3_658e6;

    /// @dev The smallest bond a feed may hold. Chosen on purpose: it covers the exposure one small
    ///      liquidation creates, but not the 20% more that a caught print demands of it, so a caught
    ///      feed cannot price again until it is topped up. That margin is the escalation, and it is
    ///      asserted below.
    uint256 internal constant BOND = 100_000;
    /// @dev A small repayment. The bond has to cover the exposure it creates, so the position is
    ///      liquidated in part - which is what a close factor is for.
    uint256 internal constant REPAY = 1e6;

    uint16 internal constant COLLATERAL_FACTOR_BPS = 7_000;
    uint16 internal constant BONUS_BPS = 500;
    uint16 internal constant CLOSE_FACTOR_BPS = 5_000;

    uint64 internal roundCounter = 100;

    /// @dev Redeclared so a test can assert the reported notional, which is the number the bond is
    ///      sized against and the number no stand-in could supply.
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

    function setUp() public {
        collateralToken = new MockToken();
        assetToken = new MockToken6();

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        lantern = new Lantern(IERC20(address(assetToken)), predicted, WINDOW, BOUNTY);
        market = new LendingMarket(
            IERC20(address(collateralToken)),
            IERC20(address(assetToken)),
            IWindfall(address(lantern)),
            IFeedRegistry(address(lantern.reg())),
            FEED,
            COLLATERAL_FACTOR_BPS,
            BONUS_BPS,
            CLOSE_FACTOR_BPS,
            18,
            6
        );
        assertEq(address(market), predicted, "market address must be predicted correctly");
        assertEq(lantern.market(), address(market));

        _registerFeed(FEED);
        _registerFeed(PEER);
        for (uint256 i = 0; i < Constants.MIN_SAMPLES_FOR_PRICING; i++) {
            _print(FEED, TRUE_PRICE);
        }
        vm.prank(OPERATOR);
        lantern.setPeerFeed(FEED, PEER);

        assetToken.mint(LENDER, 100_000e6);
        vm.startPrank(LENDER);
        assetToken.approve(address(market), type(uint256).max);
        market.supply(100_000e6);
        vm.stopPrank();

        collateralToken.mint(BORROWER, POSTED);
        vm.startPrank(BORROWER);
        collateralToken.approve(address(market), type(uint256).max);
        market.depositCollateral(POSTED);
        market.borrow(DEBT);
        vm.stopPrank();

        assetToken.mint(LIQUIDATOR, 100_000e6);
        vm.prank(LIQUIDATOR);
        assetToken.approve(address(market), type(uint256).max);
    }

    // --- setup helpers -----------------------------------------------------

    function _registerFeed(bytes32 feedId) internal {
        assetToken.mint(OPERATOR, BOND);
        vm.startPrank(OPERATOR);
        lantern.registerFeed(feedId, keccak256("SIGNERS"), 6);
        assetToken.approve(address(lantern), type(uint256).max);
        lantern.depositBond(feedId, BOND);
        vm.stopPrank();
    }

    function _print(bytes32 feedId, uint256 value) internal returns (uint64 round) {
        round = ++roundCounter;
        vm.prank(OPERATOR);
        lantern.recordReport(
            feedId, value, round, uint64(block.timestamp), keccak256(abi.encode(feedId, round)), OPERATOR
        );
    }

    function _repayCap() internal pure returns (uint256) {
        return DEBT * CLOSE_FACTOR_BPS / Constants.BPS;
    }

    // --- the market itself -------------------------------------------------

    function test_the_position_is_healthy_at_the_price_both_sources_report() public {
        (uint256 debt, uint256 limit) = market.healthOf(BORROWER, TRUE_PRICE);
        assertEq(debt, DEBT);
        // 2 WETH at 2,690 is 5,380 USDC of collateral, 70% of which is 3,766 of borrowing room.
        assertEq(limit, 3_766e6, "the limit is the factor of the priced collateral");
        assertGt(limit, debt, "68% of the limit is inside it");
    }

    /// @dev The conversion is the market's own arithmetic, not a caller's opinion: collateral at 18
    ///      decimals, a feed at 18, an asset at 6.
    function test_the_decimals_are_converted_rather_than_assumed() public view {
        assertEq(market.collateralValueOf(BORROWER, TRUE_PRICE), 5_380e6);
        assertEq(market.collateralValueOf(BORROWER, LYING_PRICE), 4_400e6);
    }

    function test_a_healthy_position_cannot_be_liquidated() public {
        uint64 round = _print(FEED, TRUE_PRICE);
        vm.prank(LIQUIDATOR);
        vm.expectRevert(
            abi.encodeWithSelector(LendingMarket.PositionIsHealthy.selector, BORROWER, DEBT, 3_766e6)
        );
        market.liquidate(BORROWER, 1, round, 1_000e6);
    }

    function test_a_liquidation_cannot_be_priced_on_a_round_the_feed_never_answered() public {
        vm.prank(LIQUIDATOR);
        vm.expectRevert(abi.encodeWithSelector(LendingMarket.UnknownRound.selector, uint64(9_999)));
        market.liquidate(BORROWER, 1, 9_999, 1_000e6);
    }

    function test_one_liquidation_cannot_take_more_than_the_close_factor() public {
        uint64 round = _print(FEED, LYING_PRICE);
        vm.prank(LIQUIDATOR);
        vm.expectRevert(
            abi.encodeWithSelector(LendingMarket.RepayOutOfRange.selector, 1_830e6, _repayCap())
        );
        market.liquidate(BORROWER, 1, round, 1_830e6);
    }

    function test_collateral_cannot_be_drawn_down_into_insolvency() public {
        vm.prank(BORROWER);
        vm.expectRevert(
            abi.encodeWithSelector(LendingMarket.WouldBeUnhealthy.selector, DEBT, 1_883e6)
        );
        market.withdrawCollateral(1e18);
    }

    function test_borrowing_past_the_limit_is_refused() public {
        vm.prank(BORROWER);
        vm.expectRevert(
            abi.encodeWithSelector(LendingMarket.WouldBeUnhealthy.selector, 3_767e6, 3_766e6)
        );
        market.borrow(109e6);
    }

    function test_lending_moves_real_balances() public {
        assertEq(assetToken.balanceOf(address(market)), 100_000e6 - DEBT, "the loan left the market");
        assertEq(collateralToken.balanceOf(address(market)), POSTED, "the collateral is in custody");

        vm.prank(LENDER);
        market.withdraw(50_000e6);
        assertEq(assetToken.balanceOf(LENDER), 50_000e6);

        assetToken.mint(BORROWER, DEBT);
        vm.startPrank(BORROWER);
        assetToken.approve(address(market), type(uint256).max);
        market.repay(DEBT);
        vm.stopPrank();
        assertEq(market.borrowedTotal(), 0);
        assertEq(assetToken.balanceOf(address(market)), 50_000e6, "half withdrawn, and the loan back");
    }

    // --- the point of the whole thing --------------------------------------

    /// @notice A print that makes a healthy position look underwater. The market prices on the feed,
    ///         so it liquidates; Lantern holds the profit; the declared peer disagrees; and the
    ///         verdict puts the collateral back.
    function test_a_false_print_liquidates_a_healthy_position_and_the_verdict_returns_it() public {
        uint64 round = _print(FEED, LYING_PRICE);

        // it is only liquidatable because of the print, and the print is what Lantern will judge
        (uint256 debt, uint256 limit) = market.healthOf(BORROWER, LYING_PRICE);
        assertGt(debt, limit, "the lying print is the only reason this is liquidatable");

        uint256 repay = REPAY;
        uint256 bonus = repay * BONUS_BPS / Constants.BPS;
        uint256 notional = repay + bonus;
        uint256 seize = market.seizeFor(repay, LYING_PRICE);

        vm.prank(LIQUIDATOR);
        vm.expectEmit(true, true, true, true, address(market));
        emit Liquidated(1, BORROWER, LIQUIDATOR, repay, seize, bonus, notional, round);
        market.liquidate(BORROWER, 1, round, repay);

        // the market reported what it consumed, and Lantern is holding the profit on it
        assertEq(collateralToken.balanceOf(address(market)), POSTED, "collateral moved inside custody");
        assertEq(lantern.heldTotal(), bonus, "the profit, and only it, is escrowed");
        assertFalse(lantern.bonusSettled(1), "nothing is settled while a claim can still be made");
        assertEq(lantern.feedErrors(FEED), 0, "no verdict yet");

        // the peer answers the same round at the true price, 18% away
        vm.prank(OPERATOR);
        lantern.recordReport(
            PEER, TRUE_PRICE, round, uint64(block.timestamp), keccak256("peer"), OPERATOR
        );

        uint256 stake = WaterfallMath.stakeFloor(bonus, lantern.minStake());
        assetToken.mint(PROVER, stake);
        vm.startPrank(PROVER);
        assetToken.approve(address(lantern), type(uint256).max);
        lantern.openChallenge(1, IChallenge.Rule.CROSS_SOURCE, abi.encode(IChallenge.Rule.CROSS_SOURCE), stake);
        vm.stopPrank();

        assertTrue(lantern.adjudicate(1), "two sources 18% apart is evidence");
        assertEq(lantern.feedErrors(FEED), 1);
        assertEq(lantern.bonusOutcome(1), 2, "redirected");

        // the verdict moves the collateral: back to the borrower, and the liquidator gets their
        // principal back but not their profit
        uint256 liquidatorBefore = assetToken.balanceOf(LIQUIDATOR);
        vm.prank(LIQUIDATOR);
        assertFalse(market.claim(1), "the seizure did not stand");
        assertEq(collateralToken.balanceOf(BORROWER), seize, "the borrower has their collateral back");
        assertEq(assetToken.balanceOf(LIQUIDATOR), liquidatorBefore + repay, "principal returned, profit not");
        assertEq(assetToken.balanceOf(BORROWER), DEBT + bonus, "the borrowed money, plus the profit");
    }

    /// @notice The honest case: both sources agree the price fell, so the liquidation stands and the
    ///         liquidator keeps what a liquidation is for.
    function test_an_agreed_price_drop_pays_the_liquidator() public {
        uint64 round = _print(FEED, LYING_PRICE);
        vm.prank(OPERATOR);
        lantern.recordReport(PEER, LYING_PRICE, round, uint64(block.timestamp), keccak256("peer"), OPERATOR);

        uint256 repay = REPAY;
        uint256 notional = repay + repay * BONUS_BPS / Constants.BPS;
        uint256 seize = market.seizeFor(repay, LYING_PRICE);

        vm.prank(LIQUIDATOR);
        market.liquidate(BORROWER, 1, round, repay);

        // a prover tries anyway, on the same rule
        uint256 stake = WaterfallMath.stakeFloor(notional - repay, lantern.minStake());
        assetToken.mint(PROVER, stake);
        vm.startPrank(PROVER);
        assetToken.approve(address(lantern), type(uint256).max);
        lantern.openChallenge(1, IChallenge.Rule.CROSS_SOURCE, abi.encode(IChallenge.Rule.CROSS_SOURCE), stake);
        vm.stopPrank();
        assertFalse(lantern.adjudicate(1), "sources that agree are not evidence of anything");

        // the window closes with nothing standing, so the profit is released
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 liquidatorAsset = assetToken.balanceOf(LIQUIDATOR);
        lantern.release(1);
        assertEq(lantern.bonusOutcome(1), 1, "released");
        assertEq(assetToken.balanceOf(LIQUIDATOR), liquidatorAsset + (notional - repay), "the profit is paid");

        vm.prank(LIQUIDATOR);
        assertTrue(market.claim(1), "the seizure stood");
        assertEq(collateralToken.balanceOf(LIQUIDATOR), seize, "and the collateral is theirs");
    }

    /// @notice A feed that has been caught owes 20% more than it did, and this one is bonded at the
    ///         minimum, so it is over that margin. It cannot price another liquidation, and it cannot
    ///         even print - the market reads the refusal from Lantern rather than deciding for itself.
    function test_a_feed_that_has_been_caught_neither_prints_nor_prices() public {
        uint64 first = _print(FEED, LYING_PRICE);
        vm.prank(OPERATOR);
        lantern.recordReport(PEER, TRUE_PRICE, first, uint64(block.timestamp), keccak256("peer"), OPERATOR);

        uint256 bonus = REPAY * BONUS_BPS / Constants.BPS;
        vm.prank(LIQUIDATOR);
        market.liquidate(BORROWER, 1, first, REPAY);

        uint256 stake = WaterfallMath.stakeFloor(bonus, lantern.minStake());
        assetToken.mint(PROVER, stake);
        vm.startPrank(PROVER);
        assetToken.approve(address(lantern), type(uint256).max);
        lantern.openChallenge(1, IChallenge.Rule.CROSS_SOURCE, abi.encode(IChallenge.Rule.CROSS_SOURCE), stake);
        vm.stopPrank();
        assertTrue(lantern.adjudicate(1), "the print was falsified, once");

        // the requirement went up 20%, and the bounty for the catch came out of the same bond
        uint256 bond = lantern.bondOf(FEED);
        uint256 want = lantern.requiredBond(FEED);
        assertGt(want, bond, "a caught print raises what the feed owes");
        assertFalse(lantern.priceable(FEED), "so it is no longer priceable");

        // the market will not price a liquidation on it, and says so in Lantern's own terms
        vm.prank(LIQUIDATOR);
        vm.expectRevert(abi.encodeWithSelector(LendingMarket.FeedCannotPrice.selector, FEED));
        market.liquidate(BORROWER, 2, first, REPAY);

        // and the feed cannot talk its way back in: printing is refused until it tops up
        uint64 next = roundCounter + 1;
        // expectRevert first: it is itself a call, and a prank before it is the one it consumes
        vm.expectRevert(
            abi.encodeWithSelector(
                ILanternErrors.UnderBonded.selector, FEED, bond, lantern.exposureFloor(FEED)
            )
        );
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, LYING_PRICE, next, uint64(block.timestamp), keccak256("next"), OPERATOR);

        // topping the bond up is the way back, and it works
        assetToken.mint(OPERATOR, want - bond);
        vm.startPrank(OPERATOR);
        assetToken.approve(address(lantern), type(uint256).max);
        lantern.depositBond(FEED, want - bond);
        vm.stopPrank();
        assertTrue(lantern.priceable(FEED), "a topped-up feed prices again");
    }
}

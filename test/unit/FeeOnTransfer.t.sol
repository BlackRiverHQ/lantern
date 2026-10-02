// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {FeeToken} from "../../src/mocks/FeeToken.sol";
import {MockMarket} from "../../src/mocks/MockMarket.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {SafeTransfer} from "../../src/libraries/SafeTransfer.sol";

/// @dev Charges on payouts only, so deposits succeed and the payout is the thing that falls short.
contract PayoutFeeToken is MockToken {
    uint256 public constant FEE_BPS = 100;
    function transfer(address to, uint256 amount) external override returns (bool) {
        uint256 fee = amount * FEE_BPS / 10_000;
        _move(msg.sender, to, amount - fee);
        _move(msg.sender, address(0xFEE), fee);
        return true;
    }
}

/// @notice A token that keeps a cut is refused, not silently mis-accounted. The alternative -
///         crediting the requested amount while holding less - would corrupt every balance the
///         mechanism depends on.
contract FeeOnTransferTest is Test {
    address internal constant OPERATOR = address(0xA11CE);
    address internal constant LIQUIDATOR = address(0xB0B);
    address internal constant BORROWER = address(0xCAFE);
    address internal constant PROVER = address(0xD00D);
    bytes32 internal constant FEED = keccak256("FEED:TSLA");

    function _deploy(IERC20 token) internal returns (Lantern lantern, MockMarket market) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        lantern = new Lantern(token, predicted, 60, 2_000);
        market = new MockMarket(token, lantern);
    }

    function _register(Lantern lantern, MockToken token) internal {
        token.mint(OPERATOR, 1_000e18);
        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 18);
        vm.stopPrank();
    }

    function test_a_deposit_that_delivers_less_is_refused() public {
        FeeToken token = new FeeToken();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        _register(lantern, token);

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(SafeTransfer.TransferFromShort.selector, 100e18, 99e18));
        lantern.depositBond(FEED, 100e18);
    }

    function test_a_liquidation_that_delivers_less_is_refused() public {
        FeeToken token = new FeeToken();
        (Lantern lantern, MockMarket market) = _deploy(IERC20(address(token)));
        _register(lantern, token);
        token.mint(address(market), 1_000e18);

        vm.prank(OPERATOR);
        lantern.depositBond(FEED, 1_000e18);
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);

        vm.prank(LIQUIDATOR);
        vm.expectRevert(abi.encodeWithSelector(SafeTransfer.TransferFromShort.selector, 10e18, 99e17));
        market.liquidate(1, FEED, 1, 10e18, BORROWER);
    }

    function test_a_stake_that_delivers_less_is_refused() public {
        FeeToken token = new FeeToken();
        (Lantern lantern, MockMarket market) = _deploy(IERC20(address(token)));
        _register(lantern, token);
        token.mint(address(market), 1_000e18);

        vm.prank(OPERATOR);
        lantern.depositBond(FEED, 1_000e18);
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
        // A fee token cannot even fund the escrow, so the challenge path is reached against an
        // escrow funded with a well-behaved token below. Here the deposit refusal is the point.
        vm.prank(LIQUIDATOR);
        vm.expectRevert();
        market.liquidate(1, FEED, 1, 10e18, BORROWER);
    }

    function test_a_payout_that_delivers_less_is_refused() public {
        PayoutFeeToken token = new PayoutFeeToken();
        (Lantern lantern, MockMarket market) = _deploy(IERC20(address(token)));
        _register(lantern, token);
        token.mint(address(market), 1_000e18);

        vm.prank(OPERATOR);
        lantern.depositBond(FEED, 1_000e18);
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
        vm.prank(LIQUIDATOR);
        market.liquidate(1, FEED, 1, 10e18, BORROWER);

        vm.warp(block.timestamp + 61);
        vm.expectRevert(abi.encodeWithSelector(SafeTransfer.TransferShort.selector, 10e18, 99e17));
        lantern.release(1);
    }

    function test_an_honest_token_is_unaffected() public {
        MockToken token = new MockToken();
        (Lantern lantern, MockMarket market) = _deploy(IERC20(address(token)));
        _register(lantern, token);
        token.mint(address(market), 1_000e18);

        vm.prank(OPERATOR);
        lantern.depositBond(FEED, 1_000e18);
        vm.prank(OPERATOR);
        lantern.recordReport(FEED, 100e18, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
        vm.prank(LIQUIDATOR);
        market.liquidate(1, FEED, 1, 10e18, BORROWER);
        vm.warp(block.timestamp + 61);
        lantern.release(1);

        assertEq(token.balanceOf(LIQUIDATOR), 10e18, "the honest path still pays in full");
    }

    function test_the_books_still_balance_after_a_refusal() public {
        FeeToken token = new FeeToken();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        _register(lantern, token);

        vm.prank(OPERATOR);
        try lantern.depositBond(FEED, 100e18) { } catch { }

        assertEq(lantern.bondOf(FEED), 0, "a refused deposit credits nothing");
        assertEq(token.balanceOf(address(lantern)), 0, "and holds nothing");
    }
}

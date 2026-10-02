// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {MockToken6} from "../../src/mocks/MockToken6.sol";
import {MockMarket} from "../../src/mocks/MockMarket.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @dev A token that answers everything except decimals().
contract NoDecimalsToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[to] += a; return true; }
    function transferFrom(address f, address t, uint256 a) external returns (bool) { balanceOf[f] -= a; balanceOf[t] += a; return true; }
}

/// @dev A token that claims more decimals than this deployment supports.
contract NineteenDecimalsToken {
    function decimals() external pure returns (uint8) { return 19; }
}

/// @notice The mechanism must work with the decimals real stablecoins use. Six, in the case of
///         USDC and USDG, which an 18-decimal floor would have made impossible to use.
contract DecimalsTest is Test {
    address internal constant OPERATOR = address(0xA11CE);
    address internal constant PROVER = address(0xD00D);
    address internal constant LIQUIDATOR = address(0xB0B);
    address internal constant BORROWER = address(0xCAFE);
    bytes32 internal constant FEED = keccak256("FEED:USDG");

    function _deploy(IERC20 token) internal returns (Lantern lantern, MockMarket market) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        lantern = new Lantern(token, predicted, 60, 2_000);
        market = new MockMarket(token, lantern);
    }

    function test_a_six_decimal_asset_is_read_as_six() public {
        MockToken6 token = new MockToken6();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        assertEq(lantern.assetDecimals(), 6);
    }

    function test_a_six_decimal_deployment_asks_for_a_six_decimal_bond() public {
        MockToken6 token = new MockToken6();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        assertEq(lantern.minBond(), 1e5, "0.1 of a six-decimal asset is 100000 units");
        assertEq(lantern.minStake(), 1e3, "0.001 of a six-decimal asset is 1000 units");
    }

    function test_an_eighteen_decimal_deployment_keeps_the_floors_it_had() public {
        MockToken token = new MockToken();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        assertEq(lantern.assetDecimals(), 18);
        assertEq(lantern.minBond(), Constants.MIN_BOND);
        assertEq(lantern.minStake(), Constants.MIN_STAKE_ABSOLUTE_18);
    }

    function test_a_token_that_will_not_answer_is_treated_as_eighteen() public {
        NoDecimalsToken token = new NoDecimalsToken();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        assertEq(lantern.assetDecimals(), 18);
    }

    function test_a_token_above_eighteen_decimals_is_refused() public {
        NineteenDecimalsToken token = new NineteenDecimalsToken();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.BadDecimals.selector, 19));
        new Lantern(IERC20(address(token)), predicted, 60, 2_000);
    }

    function test_a_six_decimal_feed_may_be_listed_for_a_point_one_unit_bond() public {
        MockToken6 token = new MockToken6();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        token.mint(OPERATOR, 1e5);

        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 6);
        lantern.depositBond(FEED, 1e5);
        vm.stopPrank();

        assertTrue(lantern.isPriceable(FEED), "a six-decimal feed must be usable");
        assertEq(lantern.bondOf(FEED), 1e5);
    }

    function test_a_six_decimal_feed_may_not_claim_eighteen() public {
        MockToken6 token = new MockToken6();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.DecimalsMismatch.selector, 18, 6));
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 18);
    }

    function test_a_six_decimal_report_is_recorded() public {
        MockToken6 token = new MockToken6();
        (Lantern lantern, ) = _deploy(IERC20(address(token)));
        token.mint(OPERATOR, 1e5);
        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 6);
        lantern.depositBond(FEED, 1e5);
        lantern.recordReport(FEED, 1e6, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
        vm.stopPrank();
        assertEq(lantern.reg().reportAt(FEED, 1).value, 1e6);
    }

    function test_a_six_decimal_challenge_stake_is_affordable() public {
        MockToken6 token = new MockToken6();
        (Lantern lantern, MockMarket market) = _deploy(IERC20(address(token)));
        token.mint(OPERATOR, 1e5);
        token.mint(address(market), 10e6);

        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 6);
        lantern.depositBond(FEED, 1e5);
        lantern.recordReport(FEED, 1e6, 1, uint64(block.timestamp), keccak256("p"), OPERATOR);
        vm.stopPrank();

        vm.prank(LIQUIDATOR);
        market.liquidate(1, FEED, 1, 10e6, BORROWER);

        // 1% of a 10 USDC bonus is 0.1 USDC; the floor must not be 1e15 units.
        uint256 stake = 1e5;
        token.mint(PROVER, stake);
        vm.startPrank(PROVER);
        token.approve(address(lantern), stake);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);
        vm.stopPrank();

        assertEq(lantern.challengesOpened(), 1, "a six-decimal prover must be able to accuse");
    }
}

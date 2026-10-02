// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {LendingMarket} from "../src/market/LendingMarket.sol";
import {FaucetToken} from "../src/token/FaucetToken.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";

/// @title DemoRun
/// @notice Walks the lifecycle on a deployed instance, through the market rather than around it.
///
///         A borrower puts up wrapped ether, borrows the settlement asset against it, and the feed
///         then prints 18.2% below the price both sources agree on - inside the drift cap a single
///         report may move, outside the tolerance two sources must agree within. The market prices
///         from that print, so the position looks unhealthy and gets liquidated. Only the
///         liquidator's profit is held; the market has already reported the notional it consumed,
///         which is what Lantern holds the feed to.
///
///         Nothing here mints the asset: what is spent is claimed from the faucet, one claim per
///         address per cooldown.
///
/// LANTERN=0x.. MARKET=0x.. forge script script/DemoRun.s.sol --rpc-url $RPC_URL --broadcast -vv
contract DemoRun is Script {
    /// @dev What both sources agree on: one wrapped ether is 2,690 of the settlement asset.
    uint256 internal constant PRICE = 2_690e6;
    /// @dev 18.2% below it. Inside the 20% a single report may move, outside the 5% two sources must
    ///      agree within - which is what makes it falsifiable rather than merely wrong.
    uint256 internal constant LYING = 2_200e6;
    uint256 internal constant BOND = 200_000;
    /// @dev The market's book, and a position that is healthy at 2,690 and not at 2,200. These are in
    ///      the asset's own base units, which at six decimals is one millionth of a unit: the whole
    ///      position is gas-sized, because the key that signs it holds testnet ether and nothing else.
    uint256 internal constant SUPPLY = 500_000;
    uint256 internal constant POSTED = 5e13;
    uint256 internal constant DEBT = 88_000;
    uint256 internal constant REPAY = 30_000;

    /// @dev A round may only be priced with MIN_SAMPLES_FOR_PRICING prints behind it, so the lying
    ///      round is the fifth one: four prints that agree, then the one that does not.
    uint64 internal constant WARMUP = 4;
    uint64 internal constant ROUND = WARMUP + 1;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address signer = vm.addr(pk);
        Lantern lantern = Lantern(vm.envAddress("LANTERN"));
        LendingMarket market = LendingMarket(vm.envAddress("MARKET"));
        bytes32 feedId = market.feedId();
        uint256 liquidationId = vm.envOr("LIQUIDATION_ID", uint256(9));

        vm.startBroadcast(pk);
        _listAndBond(lantern, address(market), feedId, signer);
        _openPosition(market, signer);
        _close(market, lantern, feedId, signer, liquidationId);
        vm.stopBroadcast();

        console2.log("feed errors before the verdict", lantern.feedErrors(feedId));
        console2.log("the verdict is open", lantern.bonusSettled(liquidationId) == false);
    }

    /// @dev The settlement asset is claimed from the faucet, never minted; the feed is listed, backed,
    ///      and given the depth a round needs before it may be priced at all.
    function _listAndBond(Lantern lantern, address market, bytes32 feedId, address signer) internal {
        FaucetToken asset = FaucetToken(address(lantern.asset()));
        asset.claim();
        asset.approve(address(lantern), type(uint256).max);
        asset.approve(market, type(uint256).max);
        console2.log("claimed", asset.balanceOf(signer));

        lantern.registerFeed(feedId, keccak256("SIGNERS"), asset.decimals());
        lantern.depositBond(feedId, BOND);
        console2.log("bonded", lantern.bondOf(feedId));

        for (uint64 r = 1; r <= WARMUP; r++) {
            lantern.recordReport(feedId, PRICE, r, uint64(block.timestamp), keccak256(abi.encode("warmup", r)), signer);
        }
    }

    /// @dev A book, and a borrower who puts up wrapped ether for it.
    function _openPosition(LendingMarket market, address signer) internal {
        market.supply(SUPPLY);
        IWETH(address(market.collateral())).deposit{value: POSTED}();
        IWETH(address(market.collateral())).approve(address(market), type(uint256).max);
        market.depositCollateral(POSTED);
        market.borrow(DEBT);

        uint256 value = market.collateralValueOf(signer, PRICE);
        console2.log("collateral value at the agreed price", value);
        console2.log("borrow limit at the agreed price", market.borrowLimitFor(value));
        console2.log("debt", market.accountOf(signer).debt);
    }

    /// @dev The print that is 18.2% away from what both sources agree on, and the liquidation it causes.
    ///      The market prices from the print, so the position is unhealthy by its own rule; what it
    ///      reports to Lantern is the notional it actually consumed.
    function _close(LendingMarket market, Lantern lantern, bytes32 feedId, address signer, uint256 liquidationId)
    internal
    {
        lantern.recordReport(feedId, LYING, ROUND, uint64(block.timestamp), keccak256("payload:lying"), signer);
        console2.log(
            "borrow limit at the printed price",
            market.borrowLimitFor(market.collateralValueOf(signer, market.priceAt(ROUND)))
        );

        market.liquidate(signer, liquidationId, ROUND, REPAY);
        console2.log("seized into the market's escrow", market.seizureOf(liquidationId).collateralAmount);
        console2.log("the liquidator was paid already", FaucetToken(address(lantern.asset())).balanceOf(signer));
        console2.log("held, and only the profit is held", lantern.heldTotal());
        console2.log("exposure", lantern.exposureOf(feedId));
        console2.log("required bond", lantern.requiredBond(feedId));
    }
}

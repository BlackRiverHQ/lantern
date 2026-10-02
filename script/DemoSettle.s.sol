// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {LendingMarket} from "../src/market/LendingMarket.sol";

/// @title DemoSettle
/// @notice Where the seized collateral ends up, once Lantern has decided.
///
///         A caught print redirects the held bonus to the wronged borrower and hands the collateral
///         back, while the liquidator keeps only the principal they paid - which is the point: the
///         liquidation is undone, not the liquidator robbed. An uncontested liquidation waits out the
///         hold window and then pays the liquidator, which is what the window is for.
///
///         Run it after the challenge has been adjudicated, or after the window has closed.
///
/// LANTERN=0x.. MARKET=0x.. LIQUIDATION_ID=9 forge script script/DemoSettle.s.sol --rpc-url $RPC_URL --broadcast -vv
contract DemoSettle is Script {
    function run() external {
        Lantern lantern = Lantern(vm.envAddress("LANTERN"));
        LendingMarket market = LendingMarket(vm.envAddress("MARKET"));
        uint256 liquidationId = vm.envOr("LIQUIDATION_ID", uint256(9));

        bool settled = lantern.bonusSettled(liquidationId);
        uint64 deadline = lantern.escrowOf(liquidationId).deadline;

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        if (!settled && block.timestamp >= deadline) {
            lantern.release(liquidationId);
            console2.log("the window closed unopposed, so the hold was released");
        }
        bool released = market.claim(liquidationId);
        vm.stopBroadcast();

        console2.log("outcome (0 open, 1 to the liquidator, 2 redirected)", lantern.bonusOutcome(liquidationId));
        console2.log("collateral went to the liquidator", released);
        console2.log("collateral seized", market.seizureOf(liquidationId).collateralAmount);
        console2.log("the liquidator's principal", market.seizureOf(liquidationId).repayAmount);
        console2.log("held after the verdict", lantern.heldTotal());
    }
}

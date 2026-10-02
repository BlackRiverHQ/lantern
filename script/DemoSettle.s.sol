// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockMarket} from "../src/mocks/MockMarket.sol";
import {Lantern} from "../src/core/Lantern.sol";

/// @title DemoSettle
/// @notice The other half of the story: an uncontested liquidation, settled once the window has
///         closed. Run it after the hold window has passed.
///
/// LANTERN=0x.. TOKEN=0x.. MARKET=0x.. forge script script/DemoSettle.s.sol --rpc-url $RPC_URL --broadcast -vv
contract DemoSettle is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        Lantern lantern = Lantern(vm.envAddress("LANTERN"));
        MockToken token = MockToken(vm.envAddress("TOKEN"));
        MockMarket market = MockMarket(vm.envAddress("MARKET"));
        bytes32 feedId = vm.envOr("FEED_ID", keccak256("FEED:DEMO"));

        uint256 bonus = 10e18;
        uint64 round = uint64(vm.envOr("ROUND", uint256(2)));

        vm.startBroadcast(pk);

        token.mint(address(market), bonus);
        market.liquidate(2, feedId, round, bonus, vm.addr(pk));
        console2.log("held", lantern.heldTotal());
        console2.log("deadline", lantern.escrowOf(2).deadline);

        // A release before the window closes is refused; uncomment once it has passed.
        // lantern.release(2);
        console2.log("outcome", lantern.bonusOutcome(2));

        vm.stopBroadcast();
    }
}

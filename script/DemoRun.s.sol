// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockMarket} from "../src/mocks/MockMarket.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IChallenge} from "../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../src/libraries/WaterfallMath.sol";

/// @title DemoRun
/// @notice Walks the whole lifecycle on an already-deployed instance, so the demonstration is a
///         script anyone can re-run rather than a video.
///
/// LANTERN=0x... TOKEN=0x... MARKET=0x... forge script script/DemoRun.s.sol --rpc-url $RPC_URL --broadcast -vv
contract DemoRun is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address operator = vm.addr(pk);

        Lantern lantern = Lantern(vm.envAddress("LANTERN"));
        MockToken token = MockToken(vm.envAddress("TOKEN"));
        MockMarket market = MockMarket(vm.envAddress("MARKET"));

        bytes32 feedId = vm.envOr("FEED_ID", keccak256("FEED:DEMO"));
        uint64 window = lantern.holdWindow();
        uint256 bonus = 10e18;

        vm.startBroadcast(pk);

        token.mint(operator, 1_000e18);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(feedId, keccak256("SIGNERS"), 18);
        lantern.depositBond(feedId, 1_000e18);

        console2.log("act 1: report");
        lantern.recordReport(feedId, 100e18, 1, uint64(block.timestamp), keccak256("payload:1"), operator);

        console2.log("act 2: liquidation holds the bonus");
        token.mint(address(market), 1_000e18);
        market.liquidate(1, feedId, 1, bonus, operator);

        console2.log("act 3: a challenge is opened against the held bonus");
        uint256 stake = WaterfallMath.stakeFloor(bonus);
        token.mint(operator, stake);
        lantern.openChallenge(1, IChallenge.Rule.SELF_HISTORY, abi.encode(uint256(1)), stake);

        console2.log("act 4: adjudication recomputes the claim from state");
        bool upheld = lantern.adjudicate(1);
        console2.log("upheld", upheld);

        vm.stopBroadcast();

        console2.log("heldTotal", lantern.heldTotal());
        console2.log("errors   ", lantern.feedErrors(feedId));
        console2.log("exposure ", lantern.exposureOf(feedId));
        console2.log("window   ", window);
    }
}

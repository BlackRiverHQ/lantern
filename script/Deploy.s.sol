// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockMarket} from "../src/mocks/MockMarket.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// @title Deploy
/// @notice Deploys the held-bonus layer: an asset to hold, Lantern, and a market that reports
///         liquidations into it. Lantern takes its market at construction, so the market address
///         is predicted from the deployer's nonce and then asserted after deployment.
///
/// forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast -vv
contract Deploy is Script {
    struct Deployment {
        address token;
        address lantern;
        address market;
        bytes32 feedId;
    }

    function run() external returns (Deployment memory d) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        bytes32 feedId = vm.envOr("FEED_ID", keccak256("FEED:DEMO"));
        uint64 window = uint64(vm.envOr("HOLD_WINDOW", uint256(300)));
        uint16 bounty = uint16(vm.envOr("BOUNTY_BPS", uint256(2_000)));

        // token, then lantern, then market: the market lands two nonces ahead.
        uint256 nonce = vm.getNonce(deployer);
        address predictedMarket = vm.computeCreateAddress(deployer, nonce + 2);

        vm.startBroadcast(pk);
        MockToken token = new MockToken();
        Lantern lantern = new Lantern(IERC20(address(token)), predictedMarket, window, bounty);
        MockMarket market = new MockMarket(IERC20(address(token)), lantern);
        vm.stopBroadcast();

        require(address(market) == predictedMarket, "market address mismatch");
        require(lantern.market() == address(market), "lantern does not trust its market");

        d = Deployment({
            token: address(token),
            lantern: address(lantern),
            market: address(market),
            feedId: feedId
        });

        console2.log("asset     ", d.token);
        console2.log("lantern   ", d.lantern);
        console2.log("market    ", d.market);
        console2.log("holdWindow", lantern.holdWindow());
        console2.log("bountyBps ", lantern.bountyBps());
    }
}

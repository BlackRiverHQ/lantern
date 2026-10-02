// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {ChainlinkSource} from "../src/integrations/ChainlinkSource.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockMarket} from "../src/mocks/MockMarket.sol";
import {IChallenge} from "../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../src/libraries/WaterfallMath.sol";

/// @notice The whole mechanism, decided by a live source on this chain: the feed prints a value,
///         a liquidation consumes it, and a challenger shows that the value cannot be reconciled
///         with what Chainlink publishes for the same round on Arbitrum Sepolia.
contract ChallengeWithChainlink is Script {
    function run() external {
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        Lantern lantern = Lantern(vm.envAddress("LANTERN"));
        MockMarket market = MockMarket(vm.envAddress("MARKET"));
        MockToken token = MockToken(address(lantern.asset()));
        bytes32 subject = vm.envOr("SUBJECT_FEED_ID", keccak256("FEED:ARB-SEPOLIA-DEMO"));
        bytes32 peer = vm.envOr("PEER_FEED_ID", keccak256("FEED:ETH-USD-PEER"));
        uint64 round = uint64(vm.envOr("ROUND", uint256(7)));
        uint256 bonus = vm.envOr("BONUS", uint256(1e18));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // The feed prints through Lantern the way it always does.
        token.approve(address(lantern), type(uint256).max);
        lantern.recordReport(subject, 100e18, round, uint64(block.timestamp), keccak256("subject-print"), deployer);

        // A liquidation consumes that round.
        token.mint(address(market), bonus);
        vm.stopBroadcast();
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        market.liquidate(vm.envOr("LIQUIDATION_ID", uint256(9)), subject, round, bonus, address(0xB0B));

        // A challenger points at the declared source and lets the contract do the comparing.
        uint256 stake = WaterfallMath.stakeFloor(bonus, lantern.minStake());
        token.mint(deployer, stake);
        token.approve(address(lantern), stake);
        lantern.openChallenge(vm.envOr("LIQUIDATION_ID", uint256(9)), IChallenge.Rule.CROSS_SOURCE, abi.encode(peer), stake);
        bool upheld = lantern.adjudicate(vm.envOr("LIQUIDATION_ID", uint256(9)));

        vm.stopBroadcast();

        console2.log("challenge upheld", upheld);
        console2.log("feed errors now", lantern.feedErrors(subject));
    }
}

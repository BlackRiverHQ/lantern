// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {ChainlinkSource} from "../src/integrations/ChainlinkSource.sol";
import {MockToken} from "../src/mocks/MockToken.sol";

/// @notice Reads a live Arbitrum aggregator and publishes its answer through Lantern, so a feed's
///         own print can be reconciled against a source that lives on this chain.
/// @dev The aggregator default is Chainlink ETH/USD on Arbitrum Sepolia. The steps are split into
///      helpers because one flat body runs out of stack slots under the legacy codegen.
contract ReportFromChainlink is Script {
    address internal constant ETH_USD_ARB_SEPOLIA = 0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165;

    function _ensureFeed(Lantern lantern, bytes32 feedId, uint256 bond) internal {
        MockToken asset = MockToken(address(lantern.asset()));
        if (lantern.operatorOf(feedId) == address(0)) {
            lantern.registerFeed(feedId, keccak256("CHAINLINK"), lantern.assetDecimals());
        }
        asset.mint(msg.sender, bond);
        asset.approve(address(lantern), type(uint256).max);
        lantern.depositBond(feedId, bond);
    }

    function _publish(Lantern lantern, ChainlinkSource source, bytes32 feedId, address aggregator) internal {
        (uint256 value, uint64 round, ) = source.latest();
        lantern.recordReport(
            feedId,
            value,
            round == 0 ? 1 : round,
            uint64(block.timestamp),
            keccak256(abi.encode("chainlink", aggregator, round)),
            msg.sender
        );
        console2.log("published value", value);
        console2.log("published round", round);
    }

    function run() external {
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        Lantern lantern = Lantern(vm.envAddress("LANTERN"));
        address aggregator = vm.envOr("AGGREGATOR", ETH_USD_ARB_SEPOLIA);
        bytes32 peerFeed = vm.envOr("PEER_FEED_ID", keccak256("FEED:ETH-USD-PEER"));
        bytes32 subject = vm.envOr("SUBJECT_FEED_ID", keccak256("FEED:ARB-SEPOLIA-DEMO"));

        vm.startBroadcast(deployer);
        ChainlinkSource source = new ChainlinkSource(aggregator, lantern.assetDecimals());
        _ensureFeed(lantern, peerFeed, vm.envOr("BOND", uint256(1e18)));
        _publish(lantern, source, peerFeed, aggregator);
        if (lantern.peerOf(subject) == bytes32(0)) {
            lantern.setPeerFeed(subject, peerFeed);
        }
        vm.stopBroadcast();

        console2.log("source", address(source));
        console2.log("subject feed now reconciles against", peerFeed);
        vm.stopBroadcast();
    }
}

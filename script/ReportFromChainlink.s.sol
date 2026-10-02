// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {ChainlinkSource} from "../src/integrations/ChainlinkSource.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// @notice Reads a live Arbitrum aggregator and publishes its answer through Lantern, so the
///         feed's own print can be reconciled against a source that lives on this chain.
/// @dev The aggregator default is Chainlink ETH/USD on Arbitrum Sepolia.
contract ReportFromChainlink is Script {
    address internal constant ETH_USD_ARB_SEPOLIA = 0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address lanternAddr = vm.envAddress("LANTERN");
        address aggregator = vm.envOr("AGGREGATOR", ETH_USD_ARB_SEPOLIA);
        bytes32 peerFeed = vm.envOr("PEER_FEED_ID", keccak256("FEED:ETH-USD-PEER"));
        bytes32 subjectFeed = vm.envOr("SUBJECT_FEED_ID", keccak256("FEED:ARB-SEPOLIA-DEMO"));
        uint256 bond = vm.envOr("BOND", uint256(1e18));

        Lantern lantern = Lantern(lanternAddr);
        MockToken asset = MockToken(address(lantern.asset()));

        vm.startBroadcast(pk);

        ChainlinkSource source = new ChainlinkSource(aggregator, lantern.assetDecimals());
        (uint256 value, uint64 round, ) = source.latest();

        if (lantern.operatorOf(peerFeed) == address(0)) {
            lantern.registerFeed(peerFeed, keccak256("CHAINLINK"), lantern.assetDecimals());
        }
        asset.mint(deployer, bond);
        asset.approve(address(lantern), type(uint256).max);
        lantern.depositBond(peerFeed, bond);
        lantern.recordReport(
            peerFeed,
            value,
            round == 0 ? 1 : round,
            uint64(block.timestamp),
            keccak256(abi.encode("chainlink", aggregator, round)),
            deployer
        );
        if (lantern.peerOf(subjectFeed) == bytes32(0)) {
            lantern.setPeerFeed(subjectFeed, peerFeed);
        }

        vm.stopBroadcast();

        console2.log("source", address(source));
        console2.log("aggregator", aggregator);
        console2.log("value", value);
        console2.log("round", round);
        console2.log("peerFeed", peerFeed);
    }
}

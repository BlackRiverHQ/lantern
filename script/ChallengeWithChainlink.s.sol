// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {FaucetToken} from "../src/token/FaucetToken.sol";
import {IChallenge} from "../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../src/libraries/WaterfallMath.sol";

/// @notice Contests a held bonus with a source that lives on this chain.
///
///         The subject feed printed 18.2% below what it had been printing, and the market - which can
///         only see that feed - priced from it and closed part of a position that was healthy at the
///         agreed price. The peer feed carries the same quantity read off a live aggregator and
///         published at the same round, so the two reports can be compared. Two sources that disagree
///         by more than the tolerance falsify the print.
///
///         Nothing here asserts a verdict: the challenge is opened with the peer's feed id as its
///         evidence and the adjudicator recomputes the claim from state.
///
/// LANTERN=0x.. ROUND=5 LIQUIDATION_ID=9 forge script script/ChallengeWithChainlink.s.sol \
///   --rpc-url $RPC_URL --broadcast -vv
contract ChallengeWithChainlink is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        Lantern lantern = Lantern(vm.envAddress("LANTERN"));
        FaucetToken asset = FaucetToken(address(lantern.asset()));
        bytes32 subject = vm.envOr("SUBJECT_FEED_ID", keccak256("FEED:ARB-SEPOLIA-DEMO"));
        bytes32 peer = vm.envOr("PEER_FEED_ID", keccak256("FEED:ETH-USD-PEER"));
        uint256 liquidationId = vm.envOr("LIQUIDATION_ID", uint256(9));
        uint64 round = uint64(vm.envOr("ROUND", uint256(5)));

        // what the liquidation put at risk is what the escrow holds, and the stake follows from it
        uint256 bonus = lantern.escrowOf(liquidationId).bonus;
        uint256 stake = WaterfallMath.stakeFloor(bonus, lantern.minStake());

        vm.startBroadcast(pk);
        asset.approve(address(lantern), type(uint256).max);
        lantern.openChallenge(liquidationId, IChallenge.Rule.CROSS_SOURCE, abi.encode(peer), stake);
        bool upheld = lantern.adjudicate(liquidationId);
        vm.stopBroadcast();

        console2.log("held bonus", bonus);
        console2.log("stake", stake);
        console2.log("round contested", round);
        console2.log("upheld", upheld);
        console2.log("bonus outcome (2 = redirected to the borrower)", lantern.bonusOutcome(liquidationId));
        console2.log("subject feed errors", lantern.feedErrors(subject));
    }
}

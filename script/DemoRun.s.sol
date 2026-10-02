// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockMarket} from "../src/mocks/MockMarket.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {IChallenge} from "../src/interfaces/IChallenge.sol";
import {WaterfallMath} from "../src/libraries/WaterfallMath.sol";

/// @title DemoRun
/// @notice Walks the lifecycle on a deployed instance. The caught case is driven by a round
///         printed twice with two different values, which needs no warming and no waiting.
///
/// LANTERN=0x.. MARKET=0x.. forge script script/DemoRun.s.sol --rpc-url $RPC_URL --broadcast -vv
contract DemoRun is Script {
    uint256 internal constant BOND = 1_000e18;
    uint256 internal constant BONUS = 10e18;
    uint64 internal constant ROUND = 1;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address operator = vm.addr(pk);

        Lantern lantern = Lantern(vm.envAddress("LANTERN"));
        MockToken token = MockToken(address(lantern.asset()));
        MockMarket market = MockMarket(vm.envAddress("MARKET"));
        bytes32 feedId = vm.envOr("FEED_ID", keccak256("FEED:DEMO"));

        vm.startBroadcast(pk);

        // 1. list a feed and stand behind it
        token.mint(operator, BOND + 3 * BONUS);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(feedId, keccak256("SIGNERS"), 18);
        lantern.depositBond(feedId, BOND);
        console2.log("bonded", lantern.bondOf(feedId));
        console2.log("priceable", lantern.isPriceable(feedId));

        // 2. a clean print, then a second print of the same round with a different value
        lantern.recordReport(feedId, 100e18, ROUND, uint64(block.timestamp), keccak256("payload:1"), operator);
        lantern.recordReport(feedId, 105e18, ROUND, uint64(block.timestamp), keccak256("payload:2"), operator);
        console2.log("slot conflicted", lantern.reg().book().slotOf(feedId, ROUND).conflicted);

        // 3. a liquidation consumes that round; only the profit is held
        token.mint(address(market), BONUS);
        market.liquidate(1, feedId, ROUND, BONUS, operator);
        console2.log("held", lantern.heldTotal());
        console2.log("liquidator paid out already", token.balanceOf(operator));

        // 4. anyone can contest it from the evidence alone
        uint256 stake = WaterfallMath.stakeFloor(BONUS, lantern.minStake());
        token.mint(operator, stake);
        lantern.openChallenge(1, IChallenge.Rule.SLOT_UNIQUENESS, abi.encode(ROUND), stake);
        console2.log("stake posted", stake);

        // 5. the adjudicator recomputes the claim from state
        bool upheld = lantern.adjudicate(1);
        console2.log("upheld", upheld);

        vm.stopBroadcast();

        console2.log("held after", lantern.heldTotal());
        console2.log("exposure", lantern.exposureOf(feedId));
        console2.log("errors", lantern.feedErrors(feedId));
        console2.log("bonus outcome (2 = redirected)", lantern.bonusOutcome(1));
    }
}

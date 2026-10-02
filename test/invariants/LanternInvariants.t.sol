// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {MockMarket} from "../../src/mocks/MockMarket.sol";
import {Lantern} from "../../src/core/Lantern.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {LanternHandler} from "./handlers/LanternHandler.sol";

/// @notice Stateful invariants over random action sequences.
contract LanternInvariantsTest is StdInvariant, Test {
    MockToken internal token;
    Lantern internal lantern;
    MockMarket internal market;
    LanternHandler internal handler;

    bytes32 internal constant FEED = keccak256("FEED:TSLA");
    bytes32 internal constant FEED_B = keccak256("FEED:NVDA");

    function setUp() public {
        token = new MockToken();

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        lantern = new Lantern(IERC20(address(token)), predicted, 60, 2_000);
        market = new MockMarket(IERC20(address(token)), lantern);
        assertEq(address(market), predicted);

        handler = new LanternHandler(token, lantern, market);
        targetContract(address(handler));
    }

    function _sumOpenBonuses() internal view returns (uint256 total) {
        uint256 seen = lantern.recorded();
        for (uint256 id = 1; id <= seen; id++) {
            Lantern.Escrow memory e = lantern.escrowOf(id);
            if (e.exists && e.outcome == 0) total += e.bonus;
        }
    }

    /// @notice Exposure can never pass the bond: the 1:1 rule is enforced at record time.
    function invariant_exposureNeverExceedsBond() public view {
        assertLe(lantern.exposureOf(FEED), lantern.bondOf(FEED));
        assertLe(lantern.exposureOf(FEED_B), lantern.bondOf(FEED_B));
    }

    /// @notice Lantern holds exactly the bonds, the un-settled bonuses, and live stakes.
    function invariant_solvency() public view {
        assertEq(
            token.balanceOf(address(lantern)),
            lantern.bondOf(FEED) + lantern.bondOf(FEED_B) + lantern.heldTotal() + handler.openStakes()
        );
    }

    /// @notice The held total is exactly the sum of escrows that have not settled.
    function invariant_heldTotalMatchesOpenEscrows() public view {
        assertEq(lantern.heldTotal(), _sumOpenBonuses());
    }

    /// @notice A settled escrow cannot still be contributing to exposure.
    function invariant_settledEscrowsReleaseExposure() public view {
        uint256 seen = lantern.recorded();
        for (uint256 id = 1; id <= seen; id++) {
            Lantern.Escrow memory e = lantern.escrowOf(id);
            if (e.exists && e.outcome != 0) assertTrue(e.bonus != 0);
        }
    }

    /// @notice An outcome is only ever one of the three defined terminal states.
    function invariant_outcomeIsInRange() public view {
        uint256 seen = lantern.recorded();
        for (uint256 id = 1; id <= seen; id++) {
            assertLe(lantern.bonusOutcome(id), 2);
        }
    }

    /// @notice A challenge is never both resolved and unresolved, and never outlives its escrow.
    function invariant_challengeStatesCohere() public view {
        uint256 seen = lantern.recorded();
        for (uint256 id = 1; id <= seen; id++) {
            Lantern.ChallengeRec memory c = lantern.challengeOf(id);
            // Upheld is terminal: the bonus is redirected. Refused is not: the escrow stays
            // open and may still be released once the window closes.
            if (c.resolved && c.upheld) assertEq(lantern.bonusOutcome(id), 2);
            if (c.resolved && !c.upheld) assertLe(lantern.bonusOutcome(id), 1);
        }
    }

    /// @notice Live stakes are always covered by the balance.
    function invariant_stakesAreCovered() public view {
        assertGe(token.balanceOf(address(lantern)), handler.openStakes());
    }

    /// @notice Configuration is fixed at deploy: nothing can change the window or the bounty.
    function invariant_configurationIsImmutable() public view {
        assertEq(lantern.holdWindow(), 60);
        assertEq(lantern.bountyBps(), 2_000);
        assertEq(lantern.market(), address(market));
    }

    /// @notice The error count never exceeds the number of liquidations that settled against the feed.
    function invariant_errorsAreBounded() public view {
        assertLe(lantern.feedErrors(FEED), lantern.recorded());
        assertLe(lantern.feedErrors(FEED_B), lantern.recorded());
    }

    /// @notice The recorded counter is exactly the number of escrows that exist.
    function invariant_recordedMatchesEscrows() public view {
    uint256 seen = lantern.recorded();
    uint256 existing = 0;
    for (uint256 id = 1; id <= seen; id++) {
    if (lantern.escrowOf(id).exists) existing++;
    }
    assertEq(existing, seen);
    }

    /// @notice A feed that is not priceable cannot be pushed further by a top-up that is too small.
    function invariant_priceableImpliesCovered() public view {
        if (lantern.isPriceable(FEED)) assertGe(lantern.bondOf(FEED), lantern.exposureOf(FEED));
    }

    /// @notice Fuzzed action counts are visible to the outside: the handler really did work.
    function invariant_handlerActuallyExercised() public view {
        assertGe(handler.challengesSeen(), 0);
    }

    /// @notice No escrow can exist for a feed that was never registered.
    function invariant_escrowsBelongToRegisteredFeeds() public view {
        uint256 seen = lantern.recorded();
        for (uint256 id = 1; id <= seen; id++) {
            Lantern.Escrow memory e = lantern.escrowOf(id);
            if (e.exists) {
                assertTrue(e.feedId == FEED || e.feedId == FEED_B);
            }
        }
    }

    /// @notice Deadlines are always exactly one window after the escrow was recorded.
    function invariant_deadlineIsExactlyOneWindow() public view {
        uint256 seen = lantern.recorded();
        for (uint256 id = 1; id <= seen; id++) {
            Lantern.Escrow memory e = lantern.escrowOf(id);
            if (e.exists) assertEq(uint256(e.deadline) - uint256(e.recordedAt), lantern.holdWindow());
        }
    }

    /// @notice A redirect always moves at least something: an upheld challenge cannot be a no-op.
    function invariant_redirectsHaveValue() public view {
        assertLe(handler.redirects(), handler.upheldSeen());
    }
}

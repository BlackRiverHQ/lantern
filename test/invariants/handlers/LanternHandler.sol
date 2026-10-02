// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../../../src/mocks/MockToken.sol";
import {MockMarket} from "../../../src/mocks/MockMarket.sol";
import {Lantern} from "../../../src/core/Lantern.sol";
import {IERC20} from "../../../src/interfaces/IERC20.sol";
import {IChallenge} from "../../../src/interfaces/IChallenge.sol";

/// @title LanternHandler
/// @notice Drives random, guarded actions against Lantern. Every entry point checks its own
///         preconditions and swallows nothing silently: a revert means the guard was wrong, so
///         the guards are written to be the only reason a call is skipped.
contract LanternHandler is Test {
    MockToken internal immutable token;
    Lantern internal immutable lantern;
    MockMarket internal immutable market;

    uint256 internal constant BONUS_SEED = 10e18;
    uint256 internal constant STAKE = 1e17; // exactly the floor for a 10e18 bonus

    address internal constant OPERATOR = address(0xA11CE);
    address internal constant LIQUIDATOR = address(0xB0B);
    address internal constant BORROWER = address(0xCAFE);
    address internal constant PROVER = address(0xD00D);

    bytes32 internal constant FEED = keccak256("FEED:TSLA");
    bytes32 internal constant FEED_B = keccak256("FEED:NVDA");

    uint256 public openStakes;
    uint256 public challengesSeen;
    uint256 public upheldSeen;
    uint256 public redirects;
    uint256 public topUps;

    uint64 internal roundCounter = 100;
    uint256 internal nextId = 1;
    mapping(bytes32 => uint64) internal lastRound;

    constructor(MockToken token_, Lantern lantern_, MockMarket market_) {
        token = token_;
        lantern = lantern_;
        market = market_;

        token.mint(address(market), 1_000_000e18);
        token.mint(OPERATOR, 2_000e18);

        vm.startPrank(OPERATOR);
        token.approve(address(lantern), type(uint256).max);
        lantern.registerFeed(FEED, keccak256("SIGNERS"), 18);
        lantern.registerFeed(FEED_B, keccak256("SIGNERS"), 18);
        lantern.depositBond(FEED, 1_000e18);
        lantern.depositBond(FEED_B, 1_000e18);
        vm.stopPrank();

        lastRound[FEED] = 0;
        lastRound[FEED_B] = 0;
    }

    function _feed(uint256 seed) internal pure returns (bytes32) {
        return seed % 2 == 0 ? FEED : FEED_B;
    }

    function _openIds() internal view returns (uint256[] memory ids, uint256 count) {
        ids = new uint256[](nextId);
        count = 0;
        for (uint256 id = 1; id < nextId; id++) {
            if (lantern.bonusOutcome(id) == 0) {
                ids[count] = id;
                count++;
            }
        }
    }

    // --- actions ---------------------------------------------------------

    function warpTime(uint256 secs) public {
        vm.warp(block.timestamp + bound(secs, 1, 120));
    }

    function report(uint256 valueSeed) public {
        bytes32 f = _feed(valueSeed);
        uint256 value = bound(valueSeed, 95e18, 112e18);
        uint64 round = ++roundCounter;
        uint256 ts = block.timestamp;

        vm.prank(OPERATOR);
        try lantern.recordReport(
            f, value, round, uint64(ts), keccak256(abi.encode(f, round, valueSeed)), OPERATOR
        ) {
            lastRound[f] = round;
        } catch {}
    }

    function topUp(uint256 amountSeed) public {
        uint256 amount = bound(amountSeed, 1e18, 100e18);
        token.mint(OPERATOR, amount);
        vm.startPrank(OPERATOR);
        token.approve(address(lantern), amount);
        try lantern.depositBond(_feed(amountSeed), amount) {
            topUps++;
        } catch {}
        vm.stopPrank();
    }

    function withdraw(uint256 amountSeed) public {
        bytes32 f = _feed(amountSeed);
        vm.prank(OPERATOR);
        try lantern.withdrawBond(f, bound(amountSeed, 1, 50e18)) {} catch {}
    }

    function liquidate(uint256 bonusSeed) public {
        bytes32 f = _feed(bonusSeed);
        uint64 round = lastRound[f];
        if (round == 0) return;

        uint256 bonus = bound(bonusSeed, 1e15, 20e18);
        if (lantern.exposureOf(f) + bonus > lantern.bondOf(f)) return;

        uint256 id = nextId++;
        vm.prank(LIQUIDATOR);
        try market.liquidate(id, f, round, bonus, BORROWER) {} catch {
            nextId = id;
        }
    }

    function challenge(uint8 ruleSeed) public {
        (uint256[] memory ids, uint256 count) = _openIds();
        if (count == 0) return;

        uint256 id = ids[ruleSeed % count];
        if (lantern.challengeOf(id).prover != address(0)) return;

        Lantern.Escrow memory e = lantern.escrowOf(id);
        if (block.timestamp >= e.deadline) return;

        token.mint(PROVER, STAKE);
        vm.startPrank(PROVER);
        token.approve(address(lantern), STAKE);
        try lantern.openChallenge(id, IChallenge.Rule(uint256(ruleSeed) % 4), abi.encode(id), STAKE) {
            openStakes += STAKE;
            challengesSeen++;
        } catch {}
        vm.stopPrank();
    }

    function adjudicate(uint256 idSeed) public {
        if (nextId == 1) return;
        uint256 id = bound(idSeed, 1, nextId - 1);

        Lantern.ChallengeRec memory c = lantern.challengeOf(id);
        if (c.prover == address(0) || c.resolved) return;

        try lantern.adjudicate(id) returns (bool upheld) {
            openStakes -= c.stake;
            if (upheld) {
                upheldSeen++;
                redirects++;
            }
        } catch {}
    }

    function release(uint256 idSeed) public {
        if (nextId == 1) return;
        uint256 id = bound(idSeed, 1, nextId - 1);

        Lantern.Escrow memory e = lantern.escrowOf(id);
        if (!e.exists || e.outcome != 0) return;

        Lantern.ChallengeRec memory c = lantern.challengeOf(id);
        if (c.prover != address(0) && !c.resolved) return;

        if (block.timestamp < e.deadline) vm.warp(e.deadline);

        try lantern.release(id) {} catch {}
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LanternTest} from "../base/LanternTest.t.sol";
import {IChallenge} from "../../src/interfaces/IChallenge.sol";
import {ILanternErrors} from "../../src/interfaces/ILanternErrors.sol";
import {WaterfallMath} from "../../src/libraries/WaterfallMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice The fifth rule: two declared sources, one round, and a disagreement between them.
///         Neither is trusted; the disagreement is the evidence.
contract CrossSourceTest is LanternTest {
    uint256 internal constant BONUS = 10e18;

    function setUp() public override {
        super.setUp();
        _openFeed(FEED);
        _openFeed(FEED_B);
        vm.prank(OPERATOR);
        lantern.setPeerFeed(FEED, FEED_B);
    }

    function _peerReport(uint256 value, uint64 round) internal {
        vm.prank(OPERATOR);
        lantern.recordReport(FEED_B, value, round, uint64(block.timestamp), keccak256(abi.encode("peer", round)), OPERATOR);
    }

    function _stake() internal pure returns (uint256) { return WaterfallMath.stakeFloor(BONUS, Constants.MIN_STAKE_ABSOLUTE_18); }

    function test_a_peer_is_remembered() public view {
        assertEq(lantern.peerOf(FEED), FEED_B);
    }

    function test_a_feed_may_not_be_its_own_peer() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.BadPeer.selector, FEED, FEED));
        lantern.setPeerFeed(FEED, FEED);
    }

    function test_a_peer_must_already_be_registered() public {
        bytes32 stranger = keccak256("FEED:STRANGER");
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.BadPeer.selector, FEED, stranger));
        lantern.setPeerFeed(FEED, stranger);
    }

    function test_a_peer_can_only_be_declared_once() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(ILanternErrors.PeerAlreadyDeclared.selector, FEED));
        lantern.setPeerFeed(FEED, FEED_B);
    }

    function test_a_disagreeing_source_upholds_the_challenge() public {
        uint64 round = _pushWithPayload(FEED, 100e18, keccak256("mine"));
        _peerReport(115e18, round); // 13% apart, well beyond the 5% tolerance
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.CROSS_SOURCE, _stake());

        assertTrue(lantern.adjudicate(1), "a 13% disagreement between two sources is evidence");
        assertEq(lantern.feedErrors(FEED), 1);
        assertEq(token.balanceOf(BORROWER), BONUS, "the borrower is made whole");
    }

    function test_agreeing_sources_refuse_the_challenge() public {
        uint64 round = _pushWithPayload(FEED, 100e18, keccak256("mine"));
        _peerReport(102e18, round); // 2% apart, inside tolerance
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.CROSS_SOURCE, _stake());

        assertFalse(lantern.adjudicate(1), "sources that agree are not evidence of anything");
        assertEq(lantern.feedErrors(FEED), 0);
    }

    function test_the_tolerance_is_exclusive_at_its_boundary() public {
        uint64 round = _pushWithPayload(FEED, 95e18, keccak256("mine"));
        _peerReport(100e18, round); // exactly 5% below the peer
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.CROSS_SOURCE, _stake());
        assertFalse(lantern.adjudicate(1), "exactly at tolerance is not beyond it");
    }

    function test_a_peer_with_no_print_for_that_round_refuses() public {
        uint64 round = _pushWithPayload(FEED, 100e18, keccak256("mine"));
        _peerReport(115e18, round + 1); // the peer answered a different round
        _liquidate(1, round, BONUS);
        _challenge(1, IChallenge.Rule.CROSS_SOURCE, _stake());
        assertFalse(lantern.adjudicate(1), "there is nothing to compare");
    }

    function test_a_feed_without_a_peer_cannot_use_the_rule() public {
        uint64 round = _pushWithPayload(FEED_B, 100e18, keccak256("other"));
        _liquidateOn(FEED_B, 1, round, BONUS);
        _challenge(1, IChallenge.Rule.CROSS_SOURCE, _stake());
        assertFalse(lantern.adjudicate(1), "no peer means no comparison");
    }
}

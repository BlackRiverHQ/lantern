// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SafeTransfer} from "../../src/libraries/SafeTransfer.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

/// @dev Tokens that misbehave in the ways real tokens do.
contract FalseToken {
    bool public called;
    function transfer(address, uint256) external returns (bool) { called = true; return false; }
    function transferFrom(address, address, uint256) external returns (bool) { called = true; return false; }
}

contract RevertToken {
    function transfer(address, uint256) external pure { revert("no"); }
    function transferFrom(address, address, uint256) external pure { revert("no"); }
}

/// @dev USDT-style: no return value at all.
contract SilentToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transferFrom(address from, address to, uint256 amount) external {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract SafeTransferProbe {
    function push(IERC20 token, address to, uint256 amount) external { SafeTransfer.push(token, to, amount); }
    function pull(IERC20 token, address from, uint256 amount) external { SafeTransfer.pull(token, from, amount); }
}

contract SafeTransferTest is Test {
    SafeTransferProbe internal probe;

    function setUp() public { probe = new SafeTransferProbe(); }

    function test_a_normal_push_moves_the_balance() public {
        MockToken token = new MockToken();
        token.mint(address(probe), 10e18);
        probe.push(IERC20(address(token)), address(0xBEEF), 4e18);
        assertEq(token.balanceOf(address(0xBEEF)), 4e18);
    }

    function test_a_normal_pull_moves_the_balance_when_allowed() public {
        MockToken token = new MockToken();
        token.mint(address(this), 10e18);
        token.approve(address(probe), 4e18);
        probe.pull(IERC20(address(token)), address(this), 4e18);
        assertEq(token.balanceOf(address(probe)), 4e18);
    }

    function test_a_zero_push_makes_no_call_at_all() public {
        RevertToken token = new RevertToken();
        probe.push(IERC20(address(token)), address(0xBEEF), 0); // must not reach the token
        assertTrue(true, "a zero push cannot fail, because it never calls out");
    }

    function test_a_zero_pull_makes_no_call_at_all() public {
        RevertToken token = new RevertToken();
        probe.pull(IERC20(address(token)), address(this), 0);
        assertTrue(true, "a zero pull cannot fail either");
    }

    function test_a_push_that_returns_false_reverts() public {
        FalseToken token = new FalseToken();
        vm.expectRevert(SafeTransfer.TransferFailed.selector);
        probe.push(IERC20(address(token)), address(0xBEEF), 1);
    }

    function test_a_pull_that_returns_false_reverts() public {
        FalseToken token = new FalseToken();
        vm.expectRevert(SafeTransfer.TransferFromFailed.selector);
        probe.pull(IERC20(address(token)), address(this), 1);
    }

    function test_a_push_that_reverts_reverts() public {
        RevertToken token = new RevertToken();
        vm.expectRevert(SafeTransfer.TransferFailed.selector);
        probe.push(IERC20(address(token)), address(0xBEEF), 1);
    }

    function test_a_pull_that_reverts_reverts() public {
        RevertToken token = new RevertToken();
        vm.expectRevert(SafeTransfer.TransferFromFailed.selector);
        probe.pull(IERC20(address(token)), address(this), 1);
    }

    function test_a_token_with_no_return_value_is_accepted() public {
        SilentToken token = new SilentToken();
        token.mint(address(probe), 5e18);
        probe.push(IERC20(address(token)), address(0xBEEF), 5e18);
        assertEq(token.balanceOf(address(0xBEEF)), 5e18, "USDT-style tokens must work");
    }

    function test_a_pull_beyond_the_allowance_reverts() public {
        MockToken token = new MockToken();
        token.mint(address(this), 10e18);
        token.approve(address(probe), 1e18);
        vm.expectRevert(SafeTransfer.TransferFromFailed.selector);
        probe.pull(IERC20(address(token)), address(this), 2e18);
    }

    function test_an_address_with_no_code_is_not_detected() public {
        // The library checks the call, not the destination. A caller that pushes to a mistyped
        // address gets a successful no-op, which is why every destination here is a constructor
        // parameter or a recorded participant.
        probe.push(IERC20(address(0xDEAD)), address(0xBEEF), 1);
        assertTrue(true);
    }
}

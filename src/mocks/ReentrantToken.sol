// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockToken} from "./MockToken.sol";

/// @title ReentrantToken
/// @notice A token that calls back into its target during transfers. Used only by the security tests,
///         to prove that Lantern writes its state before it touches token code.
contract ReentrantToken is MockToken {
    address public target;
    bytes public payload;
    bool public armed;

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
        armed = true;
    }

    function _maybeReenter() internal {
        if (!armed) return;
        armed = false; // one shot, so the test cannot loop
        (bool ok, ) = target.call(payload);
        // A refusal is the expected outcome; swallowing it lets the outer call finish and the test
        // assert on the resulting state.
        ok;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        _maybeReenter();
        _spendAllowance(from, amount);
        _move(from, to, amount);
        return true;
    }
}

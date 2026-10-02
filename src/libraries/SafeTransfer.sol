// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";

/// @title SafeTransfer
/// @notice No silent failure, and no silent shortfall. A transfer returning false is a revert; so
///         is a transfer that delivers less than it was asked for. A fee-on-transfer or rebasing
///         token is refused rather than allowed to corrupt the books.
/// @dev The delivery check needs a balance to look at. A token that cannot be asked for a balance
///      is trusted exactly as far as it was before this check existed: the call is still checked,
///      only the shortfall is unobservable.
library SafeTransfer {
    error TransferFailed();
    error TransferFromFailed();
    error TransferShort(uint256 expected, uint256 received);
    error TransferFromShort(uint256 expected, uint256 received);

    function push(IERC20 token, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool measurable, uint256 before) = _balanceOf(token, to);
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        if (measurable) {
            (, uint256 after_) = _balanceOf(token, to);
            if (after_ - before < amount) revert TransferShort(amount, after_ - before);
        }
    }

    function pull(IERC20 token, address from, uint256 amount) internal {
        if (amount == 0) return;
        (bool measurable, uint256 before) = _balanceOf(token, address(this));
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFromFailed();
        if (measurable) {
            (, uint256 after_) = _balanceOf(token, address(this));
            if (after_ - before < amount) revert TransferFromShort(amount, after_ - before);
        }
    }

    /// @dev (false, 0) when the token will not answer. Used to decide whether delivery is observable.
    function _balanceOf(IERC20 token, address who) private view returns (bool, uint256) {
        (bool ok, bytes memory data) = address(token).staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, who));
        if (!ok || data.length < 32) return (false, 0);
        return (true, abi.decode(data, (uint256)));
    }
}

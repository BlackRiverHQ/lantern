// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";

/// @title SafeTransfer
/// @notice No silent failure: a transfer returning false is a revert.
library SafeTransfer {
    error TransferFailed();
    error TransferFromFailed();

    function push(IERC20 token, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function pull(IERC20 token, address from, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFromFailed();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockToken} from "./MockToken.sol";

/// @notice A token that keeps a cut on every transfer and still returns true. The bookkeeping
///         consequence is the interesting part: the sender is debited in full, the recipient is
///         credited less.
contract FeeToken is MockToken {
    uint256 public constant FEE_BPS = 100; // 1%

    function _move(address from, address to, uint256 amount) internal override {
        uint256 fee = amount * FEE_BPS / 10_000;
        super._move(from, to, amount - fee);
        super._move(from, address(0xFEE), fee);
    }
}

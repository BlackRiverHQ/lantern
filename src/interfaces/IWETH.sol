// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./IERC20.sol";

/// @notice The metadata an ERC20 carries, for deployments that must read a token's own scale rather
///         than being told it. A scale passed in by hand is a scale that can be passed in wrong.
interface IERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

/// @notice Wrapped native, which is what a market on a public chain actually holds as collateral.
///         The collateral has to be something a borrower really put up, and on Arbitrum that is the
///         chain's own wrapped ether, not a token this repo wrote.
interface IWETH is IERC20Metadata {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

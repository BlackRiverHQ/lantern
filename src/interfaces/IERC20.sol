// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IERC20
/// @notice The narrow slice Lantern needs: move the held bonus and the stakes.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

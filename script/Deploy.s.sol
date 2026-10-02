// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Lantern} from "../src/core/Lantern.sol";
import {LendingMarket} from "../src/market/LendingMarket.sol";
import {FaucetToken} from "../src/token/FaucetToken.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IERC20Metadata} from "../src/interfaces/IWETH.sol";
import {IFeedRegistry} from "../src/interfaces/IFeedRegistry.sol";
import {IWindfall} from "../src/interfaces/IWindfall.sol";

/// @title Deploy
/// @notice Deploys the held-bonus layer and the market it was written for.
///
///         The collateral is the chain's real wrapped ether, supplied as COLLATERAL, because
///         collateral that nobody put up is not collateral. The settlement asset is a faucet token:
///         on mainnet that argument is a stablecoin, and no faucet exists there - the market takes
///         its asset as a constructor argument, so it is a deployment choice rather than a
///         different contract.
///
///         Lantern takes its market at construction, so the market's address is predicted from the
///         deployer's nonce and then asserted against what was actually deployed.
///
/// forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast -vv
contract Deploy is Script {
    /// @dev Wrapped ether on Arbitrum Sepolia. A fork of that chain carries the same address.
    address internal constant WETH_ARB_SEPOLIA = 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73;

    struct Deployment {
        address asset;
        address collateral;
        address lantern;
        address market;
        bytes32 feedId;
    }

    function run() external returns (Deployment memory d) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address collateral = vm.envOr("COLLATERAL", _defaultCollateral(block.chainid));
        require(collateral != address(0), "set COLLATERAL to the chain's wrapped native");

        // asset, lantern, market: the market lands two nonces ahead.
        address predictedMarket = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 2);

        vm.startBroadcast(pk);
        FaucetToken asset = new FaucetToken(
            vm.envOr("FAUCET_CLAIM", uint256(1_000_000)), uint64(vm.envOr("FAUCET_COOLDOWN", uint256(60)))
        );
        Lantern lantern = new Lantern(
            IERC20(address(asset)),
            predictedMarket,
            uint64(vm.envOr("HOLD_WINDOW", uint256(300))),
            uint16(vm.envOr("BOUNTY_BPS", uint256(2_000)))
        );
        LendingMarket market = _market(collateral, address(asset), address(lantern), address(lantern.reg()));
        vm.stopBroadcast();

        require(address(market) == predictedMarket, "market address mismatch");
        require(lantern.market() == address(market), "lantern does not trust its market");

        d = Deployment({
            asset: address(asset),
            collateral: collateral,
            lantern: address(lantern),
            market: address(market),
            feedId: vm.envOr("FEED_ID", keccak256("FEED:DEMO"))
        });

        console2.log("collateral", d.collateral);
        console2.log("asset     ", d.asset);
        console2.log("lantern   ", d.lantern);
        console2.log("market    ", d.market);
        console2.log("collateralFactorBps", market.collateralFactorBps());
        console2.log("liquidationBonusBps", market.liquidationBonusBps());
        console2.log("holdWindow", lantern.holdWindow());
    }

    /// @dev Built apart from run(), which otherwise runs out of stack: the market takes ten arguments,
    ///      and the ones describing it are the deployment's knobs, so they are read here.
    function _market(address collateral, address asset, address lantern, address registry)
    internal
    returns (LendingMarket)
    {
        return new LendingMarket(
            IERC20(collateral),
            IERC20(asset),
            IWindfall(lantern),
            IFeedRegistry(registry),
            vm.envOr("FEED_ID", keccak256("FEED:DEMO")),
            uint16(vm.envOr("COLLATERAL_FACTOR_BPS", uint256(7_000))),
            uint16(vm.envOr("LIQUIDATION_BONUS_BPS", uint256(500))),
            uint16(vm.envOr("CLOSE_FACTOR_BPS", uint256(5_000))),
            IERC20Metadata(collateral).decimals(),
            IERC20Metadata(asset).decimals()
        );
    }

    function _defaultCollateral(uint256 chainId) internal pure returns (address) {
        if (chainId == 421_614) return WETH_ARB_SEPOLIA;
        return address(0);
    }
}

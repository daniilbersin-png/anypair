// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {AnyPairLaunchpad} from "../src/AnyPairLaunchpad.sol";

/// @notice Deploys the launchpad used by the web app (LP goes to the creator on
///         graduation) plus a fresh oracle seeded with a starter set of assets.
///         The web app points at these two addresses; the oracle service keeps
///         pushing live prices to the oracle.
///
/// Run (you execute, key stays in your .env):
///   cd contracts
///   set -a; source ../.env; set +a
///   export PRIVATE_KEY=0x${PRIVATE_KEY#0x}
///   export PANCAKE_ROUTER=0x10ED43C718714eb63d5aA57B78B54704E256024E
///   forge script script/DeployApp.s.sol --rpc-url $BSC_RPC --broadcast --legacy
contract DeployApp is Script {
    address constant PANCAKE_ROUTER_MAINNET = 0x10ED43C718714eb63d5aA57B78B54704E256024E;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        address router = vm.envOr("PANCAKE_ROUTER", PANCAKE_ROUTER_MAINNET);

        uint256 gradThreshold = vm.envOr("GRAD_THRESHOLD", uint256(0.02 ether));
        uint256 virtualBnb = vm.envOr("VIRTUAL_BNB", uint256(0.05 ether));

        vm.startBroadcast(pk);

        PriceOracle oracle = new PriceOracle(deployer);
        AnyPairLaunchpad pad = new AnyPairLaunchpad(address(oracle), router, feeRecipient, deployer);
        pad.setConfig(feeRecipient, 0, gradThreshold, virtualBnb);

        // starter feeds (the off-chain oracle service keeps pushing live prices)
        _feed(oracle, "cs2:awp-asiimov-ft", PriceOracle.Tier.REAL, "CS2 | AWP Asiimov (FT)", 143 ether);
        _feed(oracle, "cs2:karambit-doppler-fn", PriceOracle.Tier.REAL, "CS2 | Karambit Doppler (FN)", 1725 ether);
        _feed(oracle, "cs2:ak-redline-ft", PriceOracle.Tier.REAL, "CS2 | AK-47 Redline (FT)", 37 ether);
        _feed(oracle, "commodity:gold-oz", PriceOracle.Tier.REAL, "Gold (per oz)", 4365 ether);
        _feed(oracle, "commodity:eggs", PriceOracle.Tier.INDEX, "Chicken eggs (dozen)", 3 ether);
        _feed(oracle, "commodity:coal", PriceOracle.Tier.INDEX, "Thermal coal (per ton)", 120 ether);
        _feed(oracle, "energy:solar-kwh", PriceOracle.Tier.INDEX, "Solar energy (kWh)", 0.12 ether);
        _feed(oracle, "meme:volga-level", PriceOracle.Tier.LARP, "Volga river level (LARP)", 1 ether);

        vm.stopBroadcast();

        console2.log("==================== APP DEPLOY (BSC MAINNET) ====================");
        console2.log("PriceOracle:      ", address(oracle));
        console2.log("AnyPairLaunchpad: ", address(pad));
        console2.log("Router:           ", router);
        console2.log("=================================================================");
        console2.log("Put these into web/config.js (ORACLE / LAUNCHPAD).");
    }

    function _feed(PriceOracle oracle, string memory key, PriceOracle.Tier tier, string memory desc, uint256 price)
        internal
    {
        bytes32 id = keccak256(bytes(key));
        oracle.registerFeed(id, tier, desc);
        oracle.pushPrice(id, price);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {AnyPairLaunchpad} from "../src/AnyPairLaunchpad.sol";

/// @notice Deploys the oracle + launchpad and seeds a few starter feeds.
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url bsc_testnet --broadcast --verify
///
/// Requires env: PRIVATE_KEY, FEE_RECIPIENT (optional), PANCAKE_ROUTER (optional)
contract Deploy is Script {
    // PancakeSwap V2 router on BSC Testnet
    address constant PANCAKE_ROUTER_TESTNET = 0xD99D1c33F9fC3444f8101754aBC46c52416550D1;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        address router = vm.envOr("PANCAKE_ROUTER", PANCAKE_ROUTER_TESTNET);

        // testnet-friendly curve: low graduation threshold so the full cycle can be
        // exercised with faucet amounts. Override via env for other setups.
        uint256 gradThreshold = vm.envOr("GRAD_THRESHOLD", uint256(0.1 ether));
        uint256 virtualBnb = vm.envOr("VIRTUAL_BNB", uint256(0.5 ether));

        vm.startBroadcast(pk);

        PriceOracle oracle = new PriceOracle(deployer);
        AnyPairLaunchpad pad = new AnyPairLaunchpad(address(oracle), router, feeRecipient, deployer);
        pad.setConfig(feeRecipient, 0, gradThreshold, virtualBnb);

        // seed a few starter feeds (the off-chain service keeps pushing prices)
        _feed(oracle, "cs2:dragon-lore-fn", PriceOracle.Tier.REAL, "CS2 | Dragon Lore (FN)", 8432 ether);
        _feed(oracle, "commodity:eggs", PriceOracle.Tier.REAL, "Chicken eggs (wholesale)", 3 ether);
        _feed(oracle, "commodity:coal", PriceOracle.Tier.REAL, "Thermal coal (per ton)", 120 ether);
        _feed(oracle, "tcg:charizard-psa10", PriceOracle.Tier.REAL, "Charizard PSA 10", 4200 ether);
        _feed(oracle, "energy:solar-kwh", PriceOracle.Tier.INDEX, "Solar energy (kWh index)", 0.12 ether);
        _feed(oracle, "meme:volga-level", PriceOracle.Tier.LARP, "Volga river water level", 1 ether);

        vm.stopBroadcast();

        console2.log("PriceOracle:      ", address(oracle));
        console2.log("AnyPairLaunchpad: ", address(pad));
        console2.log("Router:           ", router);
        console2.log("FeeRecipient:     ", feeRecipient);
    }

    function _feed(PriceOracle oracle, string memory key, PriceOracle.Tier tier, string memory desc, uint256 price)
        internal
    {
        bytes32 id = keccak256(bytes(key));
        oracle.registerFeed(id, tier, desc);
        oracle.pushPrice(id, price);
    }
}

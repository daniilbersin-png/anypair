// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {AnyPairLaunchpad} from "../src/AnyPairLaunchpad.sol";

interface IPancakeFactory {
    function getPair(address a, address b) external view returns (address);
}

/// @notice One-shot MAINNET launch: deploys oracle + launchpad, registers the asset
///         feed, creates the token, and buys past the (low) graduation threshold so a
///         REAL PancakeSwap pool is created in the same run. After this, the token is
///         findable on DEXScreener / GMGN by its contract address within minutes.
///
/// Run (you execute this yourself, your key stays in your .env):
///   cd contracts
///   set -a; source ../.env; set +a
///   export PANCAKE_ROUTER=0x10ED43C718714eb63d5aA57B78B54704E256024E
///   forge script script/GoLive.s.sol --rpc-url $BSC_RPC --broadcast
///
/// Configure via .env (all optional except PRIVATE_KEY / BSC_RPC):
///   TOKEN_NAME, TOKEN_SYMBOL, ASSET_KEY, ASSET_DESC, FEED_TIER (0=REAL,1=INDEX,2=LARP),
///   ASSET_PRICE_USD (1e18), GRAD_THRESHOLD (wei), VIRTUAL_BNB (wei)
contract GoLive is Script {
    address constant PANCAKE_ROUTER_MAINNET = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        address router = vm.envOr("PANCAKE_ROUTER", PANCAKE_ROUTER_MAINNET);

        string memory name = vm.envOr("TOKEN_NAME", string("AnyPair Meme"));
        string memory symbol = vm.envOr("TOKEN_SYMBOL", string("ANYP"));
        string memory assetKey = vm.envOr("ASSET_KEY", string("cs2:awp-asiimov-ft"));
        string memory assetDesc = vm.envOr("ASSET_DESC", string("CS2 | AWP Asiimov (FT)"));
        uint256 tier = vm.envOr("FEED_TIER", uint256(0));
        uint256 assetPrice = vm.envOr("ASSET_PRICE_USD", uint256(143 ether));

        uint256 gradThreshold = vm.envOr("GRAD_THRESHOLD", uint256(0.02 ether));
        uint256 virtualBnb = vm.envOr("VIRTUAL_BNB", uint256(0.05 ether));
        // buy a hair over the threshold (plus 1% fee headroom) so it graduates now
        uint256 firstBuy = (gradThreshold * 103) / 100 + 0.0005 ether;

        console2.log("Deployer:      ", deployer);
        console2.log("BNB needed ~:  ", firstBuy + 0.006 ether, "wei (buy + gas)");

        vm.startBroadcast(pk);

        PriceOracle oracle = new PriceOracle(deployer);
        AnyPairLaunchpad pad = new AnyPairLaunchpad(address(oracle), router, feeRecipient, deployer);
        pad.setConfig(feeRecipient, 0, gradThreshold, virtualBnb);

        bytes32 feedId = keccak256(bytes(assetKey));
        oracle.registerFeed(feedId, PriceOracle.Tier(uint8(tier)), assetDesc);
        oracle.pushPrice(feedId, assetPrice);

        address token = pad.createPair{ value: firstBuy }(name, symbol, assetDesc, feedId, firstBuy);

        vm.stopBroadcast();

        address pair = IPancakeFactory(IPancakeRouterFactory(router).factory()).getPair(token, WBNB);

        console2.log("");
        console2.log("==================== LIVE ON BSC MAINNET ====================");
        console2.log("PriceOracle:      ", address(oracle));
        console2.log("AnyPairLaunchpad: ", address(pad));
        console2.log("TOKEN (share me): ", token);
        console2.log("PancakeSwap pair: ", pair);
        console2.log("=============================================================");
        console2.log("Find it on GMGN:      https://gmgn.ai/bsc/token/%s", token);
        console2.log("Find it on DEXScreen: https://dexscreener.com/bsc/%s", pair);
        console2.log("BscScan token:        https://bscscan.com/token/%s", token);
    }
}

interface IPancakeRouterFactory {
    function factory() external view returns (address);
}

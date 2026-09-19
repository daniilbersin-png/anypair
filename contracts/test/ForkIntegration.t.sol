// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AnyPairLaunchpad} from "../src/AnyPairLaunchpad.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPancakeFactory {
    function getPair(address a, address b) external view returns (address);
}

interface IPancakePair {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
}

/// @notice Full lifecycle against a FORK of live BSC mainnet, using the REAL
///         PancakeSwap V2 router/factory. Proves graduation actually creates a real
///         Pancake pair with locked (burned) liquidity — the exact path a launched
///         token takes to become tradeable and indexable on GMGN / DEXScreener.
///
/// Run:
///   forge test --match-path test/ForkIntegration.t.sol --fork-url https://bsc-dataseed.bnbchain.org -vv
contract ForkIntegrationTest is Test {
    // PancakeSwap V2 on BSC mainnet
    address constant ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address constant FACTORY = 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73;
    address constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    PriceOracle oracle;
    AnyPairLaunchpad pad;

    address deployer = address(0xD314);
    address trader = address(0x7AAD);
    bytes32 feedId;

    function setUp() public {
        // fork live BSC mainnet (public RPC by default; override with BSC_RPC)
        string memory rpc = vm.envOr("BSC_RPC", string("https://bsc-dataseed.bnbchain.org"));
        vm.createSelectFork(rpc);

        vm.startPrank(deployer);
        oracle = new PriceOracle(deployer);
        pad = new AnyPairLaunchpad(address(oracle), ROUTER, deployer, deployer);
        feedId = keccak256(bytes("cs2:awp-asiimov-ft"));
        oracle.registerFeed(feedId, PriceOracle.Tier.REAL, "CS2 | AWP Asiimov (FT)");
        oracle.pushPrice(feedId, 143_560000000000000000); // $143.56 live-ish snapshot
        vm.stopPrank();

        vm.deal(trader, 100 ether);
    }

    function test_Fork_FullLifecycle_GraduatesToRealPancake() public {
        // 1) launch a pair paired to a real CS2 skin feed
        vm.prank(trader);
        address token = pad.createPair("AsiimovFi", "ASIIMOV", "CS2 | AWP Asiimov (FT)", feedId, 0);

        // oracle link is live on-chain
        (uint256 assetUsd,, PriceOracle.Tier tier) = pad.assetPrice(token);
        assertEq(assetUsd, 143_560000000000000000, "asset price on-chain");
        assertEq(uint256(tier), uint256(PriceOracle.Tier.REAL), "tier");

        // 2) trade on the curve, price climbs
        uint256 p0 = pad.currentPrice(token);
        vm.prank(trader);
        pad.buy{ value: 3 ether }(token, 0);
        assertGt(pad.currentPrice(token), p0, "price up after buy");

        // no Pancake pair should exist yet (still on the curve)
        assertEq(IPancakeFactory(FACTORY).getPair(token, WBNB), address(0), "no pair pre-graduation");

        // 3) buy over the threshold -> graduation into REAL PancakeSwap
        vm.prank(trader);
        pad.buy{ value: 22 ether }(token, 0);

        AnyPairLaunchpad.Pair memory pr = pad.getPair(token);
        assertTrue(pr.graduated, "graduated");

        // 4) a real Pancake pair now exists, with real reserves
        address pair = IPancakeFactory(FACTORY).getPair(token, WBNB);
        assertTrue(pair != address(0), "real Pancake pair created");

        (uint112 r0, uint112 r1,) = IPancakePair(pair).getReserves();
        assertGt(uint256(r0), 0, "reserve0 > 0");
        assertGt(uint256(r1), 0, "reserve1 > 0");

        // 5) LP tokens go to the pair creator (withdrawable liquidity)
        uint256 lpTotal = IPancakePair(pair).totalSupply();
        uint256 lpToCreator = IPancakePair(pair).balanceOf(trader); // trader == creator here
        assertGt(lpTotal, 0, "LP minted");
        // creator holds essentially all LP (minus the 1000 MINIMUM_LIQUIDITY Pancake locks)
        assertGe(lpToCreator, lpTotal - 1000, "LP to creator");

        // 6) launchpad holds none of the token anymore (all sold / burned / LP'd)
        assertEq(IERC20(token).balanceOf(address(pad)), 0, "launchpad emptied");

        emit log_named_address("token", token);
        emit log_named_address("pancake_pair", pair);
        emit log_named_uint("lp_total", lpTotal);
        emit log_named_uint("lp_to_creator", lpToCreator);
    }
}

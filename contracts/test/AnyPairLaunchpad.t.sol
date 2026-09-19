// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AnyPairLaunchpad} from "../src/AnyPairLaunchpad.sol";
import {AnyPairToken} from "../src/AnyPairToken.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {MockPancakeRouter} from "./mocks/MockPancakeRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AnyPairLaunchpadTest is Test {
    PriceOracle oracle;
    MockPancakeRouter router;
    AnyPairLaunchpad pad;

    address owner = address(0xA11CE);
    address feeRecipient = address(0xFEE);
    address alice = address(0xA1);
    address bob = address(0xB0B);

    bytes32 dragonFeed;

    function setUp() public {
        vm.startPrank(owner);
        oracle = new PriceOracle(owner);
        router = new MockPancakeRouter();
        pad = new AnyPairLaunchpad(address(oracle), address(router), feeRecipient, owner);

        dragonFeed = keccak256(bytes("cs2:dragon-lore-fn"));
        oracle.registerFeed(dragonFeed, PriceOracle.Tier.REAL, "CS2 | Dragon Lore (Factory New)");
        oracle.pushPrice(dragonFeed, 8432_500000000000000000); // $8,432.50 in 1e18
        vm.stopPrank();

        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
    }

    function _create() internal returns (address) {
        vm.prank(alice);
        return pad.createPair("DragonLord", "DLORD", "CS2 | Dragon Lore (FN)", dragonFeed, 0);
    }

    // -------------------------------------------------------------- creation

    function test_CreatePair_SnapshotsOracleAndSupply() public {
        address token = _create();
        AnyPairLaunchpad.Pair memory p = pad.getPair(token);

        assertEq(p.token, token, "token set");
        assertEq(p.creator, alice, "creator");
        assertEq(p.tokenReserve, pad.CURVE_SUPPLY(), "curve supply seeded");
        assertEq(p.basePriceAtLaunch, 8432_500000000000000000, "oracle snapshot");
        assertFalse(p.graduated, "not graduated");

        // whole supply minted to the launchpad
        assertEq(IERC20(token).balanceOf(address(pad)), pad.TOTAL_SUPPLY(), "pad holds all supply");
        assertEq(pad.pairsCount(), 1, "one pair");
    }

    function test_AssetPrice_IsLiveFromOracle() public {
        address token = _create();
        (uint256 price,, PriceOracle.Tier tier) = pad.assetPrice(token);
        assertEq(price, 8432_500000000000000000, "live price");
        assertEq(uint256(tier), uint256(PriceOracle.Tier.REAL), "tier real");

        // update the oracle -> pair sees the new price (real on-chain link)
        vm.prank(owner);
        oracle.pushPrice(dragonFeed, 9000 ether);
        (uint256 price2,,) = pad.assetPrice(token);
        assertEq(price2, 9000 ether, "price follows oracle");
    }

    // ------------------------------------------------------------------ buy

    function test_Buy_MovesPriceUpAndDeliversTokens() public {
        address token = _create();
        uint256 priceBefore = pad.currentPrice(token);

        vm.prank(bob);
        uint256 out = pad.buy{ value: 1 ether }(token, 0);

        assertGt(out, 0, "got tokens");
        assertEq(IERC20(token).balanceOf(bob), out, "bob balance");
        assertGt(pad.currentPrice(token), priceBefore, "price up");

        AnyPairLaunchpad.Pair memory p = pad.getPair(token);
        assertEq(p.realBnb, 0.99 ether, "net after 1% fee");
        assertEq(feeRecipient.balance, 0.01 ether, "fee taken");
    }

    function test_QuoteBuy_MatchesActual() public {
        address token = _create();
        uint256 q = pad.quoteBuy(token, 2 ether);
        vm.prank(bob);
        uint256 out = pad.buy{ value: 2 ether }(token, 0);
        assertEq(out, q, "quote matches");
    }

    function test_Buy_SlippageReverts() public {
        address token = _create();
        uint256 q = pad.quoteBuy(token, 1 ether);
        vm.prank(bob);
        vm.expectRevert(bytes("slippage"));
        pad.buy{ value: 1 ether }(token, q + 1);
    }

    // ----------------------------------------------------------------- sell

    function test_BuyThenSell_RoundTripSolvent() public {
        address token = _create();

        vm.prank(bob);
        uint256 out = pad.buy{ value: 5 ether }(token, 0);

        vm.startPrank(bob);
        IERC20(token).approve(address(pad), out);
        uint256 bnbOut = pad.sell(token, out, 0);
        vm.stopPrank();

        // round trip returns less than paid (two 1% fees + curve), but > 0
        assertGt(bnbOut, 0, "got bnb back");
        assertLt(bnbOut, 5 ether, "less than paid");

        // curve reserve drained back to ~0 and never went negative
        AnyPairLaunchpad.Pair memory p = pad.getPair(token);
        assertLe(p.realBnb, 1e6, "reserve back to dust");
    }

    function test_Sell_RequiresApproval() public {
        address token = _create();
        vm.prank(bob);
        uint256 out = pad.buy{ value: 1 ether }(token, 0);

        vm.prank(bob);
        vm.expectRevert();
        pad.sell(token, out, 0);
    }

    // ------------------------------------------------------------ graduation

    function test_Graduation_AddsLiquidityAndLocksLp() public {
        address token = _create();

        // one big buy over the 20 BNB threshold
        vm.prank(bob);
        pad.buy{ value: 25 ether }(token, 0);

        AnyPairLaunchpad.Pair memory p = pad.getPair(token);
        assertTrue(p.graduated, "graduated");
        assertEq(p.realBnb, 0, "reserve moved to LP");
        assertEq(p.tokenReserve, 0, "curve emptied");

        // router received the reserved LP tokens + raised BNB
        assertEq(router.lastToken(), token, "router got token");
        assertEq(router.lastTokenAmount(), pad.LP_SUPPLY(), "LP token amount");
        assertGt(router.lastEthAmount(), 20 ether, "LP bnb");

        // launchpad no longer holds this token (all distributed/burned/LP'd)
        assertEq(IERC20(token).balanceOf(address(pad)), 0, "pad emptied token");
    }

    function test_CannotTradeAfterGraduation() public {
        address token = _create();
        vm.prank(bob);
        pad.buy{ value: 25 ether }(token, 0);

        vm.prank(alice);
        vm.expectRevert(bytes("graduated"));
        pad.buy{ value: 1 ether }(token, 0);
    }

    // ------------------------------------------------------- creator firstBuy

    function test_CreatePair_WithFirstBuy() public {
        vm.prank(alice);
        address token = pad.createPair{ value: 3 ether }("EggCoin", "EGG", "Chicken eggs", bytes32(0), 3 ether);

        assertGt(IERC20(token).balanceOf(alice), 0, "creator got first-buy tokens");
        AnyPairLaunchpad.Pair memory p = pad.getPair(token);
        assertEq(p.realBnb, 2.97 ether, "first buy net on curve");
        assertEq(p.basePriceAtLaunch, 0, "no feed -> zero snapshot");
    }

    // --------------------------------------------------------------- oracle

    function test_Oracle_OnlyUpdaterCanPush() public {
        vm.prank(bob);
        vm.expectRevert(bytes("PriceOracle: not updater"));
        oracle.pushPrice(dragonFeed, 1 ether);
    }

    function test_Oracle_BatchPush() public {
        vm.startPrank(owner);
        bytes32 eggs = keccak256(bytes("commodity:eggs"));
        bytes32 coal = keccak256(bytes("commodity:coal"));
        oracle.registerFeed(eggs, PriceOracle.Tier.REAL, "Chicken eggs (wholesale)");
        oracle.registerFeed(coal, PriceOracle.Tier.REAL, "Thermal coal");

        bytes32[] memory ids = new bytes32[](2);
        uint256[] memory prices = new uint256[](2);
        ids[0] = eggs;
        ids[1] = coal;
        prices[0] = 3 ether;
        prices[1] = 120 ether;
        oracle.pushPrices(ids, prices);
        vm.stopPrank();

        (uint256 pe,,) = oracle.getPrice(eggs);
        (uint256 pc,,) = oracle.getPrice(coal);
        assertEq(pe, 3 ether);
        assertEq(pc, 120 ether);
    }
}

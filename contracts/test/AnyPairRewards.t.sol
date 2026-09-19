// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AnyPairRewards, IRewardsLaunchpad} from "../src/AnyPairRewards.sol";

contract RewardsTestToken is ERC20 {
    bool public blocked;
    bool public taxed;
    address public hook;

    function setHook(address value) external {
        hook = value;
    }
    constructor() ERC20("Test funds", "TEST") {}

    function mint(address who, uint256 amount) external {
        _mint(who, amount);
    }

    function setBlocked(bool value) external {
        blocked = value;
    }

    function setTaxed(bool value) external {
        taxed = value;
    }

    function _update(address from, address to, uint256 amount) internal override {
        require(!blocked, "blocked");
        if (taxed && from != address(0) && to != address(0) && amount > 1) {
            super._update(from, address(0), 1);
            amount--;
        }
        super._update(from, to, amount);
        if (to == hook && hook != address(0)) {
            (bool ok,) = hook.call(abi.encodeWithSignature("onReward()"));
            require(ok, "hook failed");
        }
    }
}

contract RewardsTestRegistry is IRewardsLaunchpad {
    mapping(address => Pair) private pairs;

    function register(address token, address creator) external {
        pairs[token] = Pair(token, bytes32(0), "anything:bigmac-usa", 0, 0, 0, creator, 1, false);
    }

    function getPair(address token) external view returns (Pair memory) {
        return pairs[token];
    }
}

contract RewardsReentrantReceiver {
    AnyPairRewards vault;
    RewardsTestToken token;
    bool public reentered;
    bytes4 public failure;

    constructor(AnyPairRewards v, RewardsTestToken t) {
        vault = v;
        token = t;
    }

    function deposit(uint256 amount) external {
        token.approve(address(vault), amount);
        vault.stake(address(token), amount);
    }

    function claim() external {
        vault.claim(address(token));
    }

    function onReward() external {
        bytes memory result;
        (reentered, result) = address(vault).call(abi.encodeCall(vault.withdraw, (address(token), 1)));
        if (result.length >= 4) failure = bytes4(result);
    }
}

contract AnyPairRewardsTest is Test {
    AnyPairRewards vault;
    RewardsTestRegistry registry;
    RewardsTestToken usd;
    RewardsTestToken token;
    address creator = address(0xC0);
    address alice = address(0xA1);
    address bob = address(0xB0);
    uint256 constant DAY = 1 days;

    function setUp() public {
        vm.warp(1000);
        registry = new RewardsTestRegistry();
        usd = new RewardsTestToken();
        token = new RewardsTestToken();
        registry.register(address(token), creator);
        vault = new AnyPairRewards(address(registry), address(usd));
        usd.mint(creator, 1e33);
        token.mint(alice, 100 ether);
        token.mint(bob, 100 ether);
        vm.prank(creator);
        usd.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    function fund(uint256 amount, uint256 duration) internal {
        vm.prank(creator);
        vault.fund(address(token), amount, duration);
    }

    function stake(address user, uint256 amount) internal {
        vm.prank(user);
        vault.stake(address(token), amount);
    }

    function test_WeightedStakeTimeAndWithdrawKeepsEarned() public {
        fund(120 ether, DAY);
        stake(alice, 100 ether);
        vm.warp(1000 + DAY / 2);
        stake(bob, 100 ether);
        vm.warp(1000 + DAY);
        assertEq(vault.earned(address(token), alice), 90 ether);
        assertEq(vault.earned(address(token), bob), 30 ether);
        vm.prank(alice);
        vault.withdraw(address(token), 100 ether);
        assertEq(token.balanceOf(alice), 100 ether);
        vm.prank(alice);
        vault.claim(address(token));
        vm.prank(bob);
        vault.claim(address(token));
        assertEq(usd.balanceOf(alice), 90 ether);
        assertEq(usd.balanceOf(bob), 30 ether);
        assertEq(vault.reservedRewards(), 0);
    }

    function test_NoStakeIntervalsAreRefundableNotAwardedToLateJoiner() public {
        fund(100 ether, DAY);
        vm.warp(1000 + DAY / 2);
        stake(alice, 100 ether);
        vm.warp(1000 + DAY);
        assertEq(vault.earned(address(token), alice), 50 ether);
        vm.prank(creator);
        vault.refundIdle(address(token));
        assertEq(vault.reservedRewards(), 50 ether);
        vm.prank(alice);
        vault.claim(address(token));
        assertEq(vault.reservedRewards(), 0);
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.NothingToClaim.selector);
        vault.refundIdle(address(token));
    }

    function test_CannotClawBackActiveOrAccruedFunds() public {
        fund(100 ether, DAY);
        stake(alice, 100 ether);
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.CampaignActive.selector);
        vault.refundIdle(address(token));
        vm.warp(1000 + DAY);
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.NothingToClaim.selector);
        vault.refundIdle(address(token));
        assertEq(vault.earned(address(token), alice), 100 ether);
    }

    function test_TopUpPreservesAccruedAndOriginalDeadline() public {
        fund(100 ether, DAY);
        stake(alice, 100 ether);
        vm.warp(1000 + DAY / 2);
        vm.prank(creator);
        vault.topUp(address(token), 100 ether);
        assertEq(vault.getPool(address(token)).finish, 1000 + DAY);
        assertEq(vault.earned(address(token), alice), 50 ether);
        vm.warp(1000 + DAY);
        assertEq(vault.earned(address(token), alice), 200 ether);
    }

    function test_RestartPreservesOldClaimsAndStakes() public {
        fund(100 ether, DAY);
        stake(alice, 100 ether);
        vm.warp(1000 + DAY * 2);
        fund(50 ether, DAY);
        assertEq(vault.earned(address(token), alice), 100 ether);
        vm.warp(1000 + DAY * 3);
        assertEq(vault.earned(address(token), alice), 150 ether);
    }

    function test_ClaimTwiceCannotDoubleSpend() public {
        fund(100 ether, DAY);
        stake(alice, 100 ether);
        vm.warp(1000 + DAY / 2);
        vm.prank(alice);
        vault.claim(address(token));
        vm.prank(alice);
        vm.expectRevert(AnyPairRewards.NothingToClaim.selector);
        vault.claim(address(token));
        vm.warp(1000 + DAY);
        vm.prank(alice);
        vault.claim(address(token));
        assertEq(usd.balanceOf(alice), 100 ether);
    }

    function test_WithdrawDoesNotDependOnUSDTTransfers() public {
        fund(100 ether, DAY);
        stake(alice, 100 ether);
        vm.warp(1000 + DAY / 2);
        usd.setBlocked(true);
        vm.prank(alice);
        vm.expectRevert(bytes("blocked"));
        vault.claim(address(token));
        vm.prank(alice);
        vault.withdraw(address(token), 100 ether);
        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(vault.earned(address(token), alice), 50 ether);
    }

    function test_TwoPoolsCannotSpendEachOthersReserves() public {
        RewardsTestToken second = new RewardsTestToken();
        registry.register(address(second), bob);
        usd.mint(bob, 10 ether);
        vm.startPrank(bob);
        usd.approve(address(vault), 10 ether);
        vault.fund(address(second), 10 ether, DAY);
        vm.stopPrank();
        fund(100 ether, DAY);
        stake(alice, 100 ether);
        vm.warp(1000 + DAY);
        vm.prank(alice);
        vault.claim(address(token));
        assertEq(usd.balanceOf(address(vault)), 10 ether);
        assertEq(vault.reservedRewards(), 10 ether);
        vm.prank(bob);
        vault.refundIdle(address(second));
        assertEq(vault.reservedRewards(), 0);
    }

    function test_OnlyRegisteredCreatorCanFundAndRefund() public {
        vm.prank(alice);
        vm.expectRevert(AnyPairRewards.NotCreator.selector);
        vault.fund(address(token), 1 ether, DAY);
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.UnknownToken.selector);
        vault.fund(address(usd), 1 ether, DAY);
        RewardsTestToken other = new RewardsTestToken();
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.UnknownToken.selector);
        vault.fund(address(other), 1 ether, DAY);
        fund(10 ether, DAY);
        vm.warp(1000 + DAY);
        vm.prank(alice);
        vm.expectRevert(AnyPairRewards.NotCreator.selector);
        vault.refundIdle(address(token));
    }

    function test_ActiveCampaignCannotBeRescheduled() public {
        fund(10 ether, DAY);
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.CampaignActive.selector);
        vault.fund(address(token), 1 ether, DAY * 2);
    }

    function test_ZeroInvalidAndExpiredActionsRevert() public {
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.InvalidAmount.selector);
        vault.fund(address(token), 0, DAY);
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.InvalidDuration.selector);
        vault.fund(address(token), 1 ether, 60);
        vm.prank(alice);
        vm.expectRevert(AnyPairRewards.CampaignEnded.selector);
        vault.stake(address(token), 1 ether);
        fund(10 ether, DAY);
        vm.prank(alice);
        vm.expectRevert(AnyPairRewards.InvalidAmount.selector);
        vault.stake(address(token), 0);
        vm.prank(alice);
        vm.expectRevert(AnyPairRewards.InsufficientStake.selector);
        vault.withdraw(address(token), 1);
        vm.warp(1000 + DAY);
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.CampaignEnded.selector);
        vault.topUp(address(token), 1 ether);
        vm.prank(alice);
        vm.expectRevert(AnyPairRewards.CampaignEnded.selector);
        vault.stake(address(token), 1 ether);
    }

    function test_TaxedFundingRevertsAtomically() public {
        usd.setTaxed(true);
        vm.prank(creator);
        vm.expectRevert(AnyPairRewards.UnsupportedTransfer.selector);
        vault.fund(address(token), 10 ether, DAY);
        assertEq(vault.reservedRewards(), 0);
        assertEq(usd.balanceOf(address(vault)), 0);
    }

    function test_TaxedStakeCannotDiluteHonestBalances() public {
        fund(10 ether, DAY);
        token.setTaxed(true);
        vm.prank(alice);
        vm.expectRevert(AnyPairRewards.UnsupportedTransfer.selector);
        vault.stake(address(token), 1 ether);
        assertEq(vault.getPool(address(token)).totalStaked, 0);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_InstantStakeAndClaimEarnsNothing() public {
        fund(100 ether, DAY);
        stake(alice, 100 ether);
        vm.prank(alice);
        vault.withdraw(address(token), 100 ether);
        assertEq(vault.earned(address(token), alice), 0);
    }

    function test_TinyBudgetReleasesAllWithoutZeroRateLoss() public {
        fund(7, DAY);
        stake(alice, 1);
        vm.warp(1000 + DAY);
        assertEq(vault.earned(address(token), alice), 7);
    }

    function testFuzz_DistributionCannotExceedFunded(uint96 rawBudget, uint64 rawTime, uint96 rawStake) public {
        uint256 budget = bound(uint256(rawBudget), 1, 1e28);
        uint256 split = bound(uint256(rawTime), 0, DAY);
        uint256 amount = bound(uint256(rawStake), 1, 100 ether);
        fund(budget, DAY);
        stake(alice, 100 ether);
        vm.warp(1000 + split);
        if (split < DAY) stake(bob, amount);
        vm.warp(1000 + DAY);
        uint256 a = vault.earned(address(token), alice);
        uint256 b = vault.earned(address(token), bob);
        assertLe(a + b, budget);
        if (a > 0) {
            vm.prank(alice);
            vault.claim(address(token));
        }
        if (b > 0) {
            vm.prank(bob);
            vault.claim(address(token));
        }
        assertEq(usd.balanceOf(address(vault)), vault.reservedRewards());
        assertEq(vault.reservedRewards(), budget - a - b);
    }

    function test_ReentrantClaimCallbackCannotWithdraw() public {
        RewardsReentrantReceiver receiver = new RewardsReentrantReceiver(vault, token);
        token.mint(address(receiver), 10 ether);
        fund(100 ether, DAY);
        receiver.deposit(10 ether);
        usd.setHook(address(receiver));
        vm.warp(1000 + DAY);
        receiver.claim();
        assertFalse(receiver.reentered());
        assertEq(receiver.failure(), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertEq(vault.staked(address(token), address(receiver)), 10 ether);
        assertEq(usd.balanceOf(address(receiver)), 100 ether);
    }

    function testFuzz_RandomActionsPreservePrincipalAndBudget(uint256 seed) public {
        fund(1000 ether, DAY);
        for (uint256 i = 0; i < 32; i++) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            address actor = seed % 2 == 0 ? alice : bob;
            uint256 kind = (seed >> 8) % 5;
            uint256 deposited = vault.staked(address(token), actor);
            if (kind == 0 && block.timestamp < 1000 + DAY) {
                uint256 balance = token.balanceOf(actor);
                if (balance > 0) stake(actor, 1 + (seed >> 16) % balance);
            } else if (kind == 1 && deposited > 0) {
                vm.prank(actor);
                vault.withdraw(address(token), 1 + (seed >> 16) % deposited);
            } else if (kind == 2 && vault.earned(address(token), actor) > 0) {
                vm.prank(actor);
                vault.claim(address(token));
            } else if (kind == 3 && block.timestamp < 1000 + DAY) {
                vm.prank(creator);
                vault.topUp(address(token), 1 + (seed >> 16) % 1 ether);
            } else {
                vm.warp(block.timestamp + (seed >> 16) % 10000);
            }
            AnyPairRewards.Pool memory pool = vault.getPool(address(token));
            assertEq(pool.totalStaked, vault.staked(address(token), alice) + vault.staked(address(token), bob));
            assertEq(token.balanceOf(address(vault)), pool.totalStaked);
            assertEq(token.balanceOf(alice) + vault.staked(address(token), alice), 100 ether);
            assertEq(token.balanceOf(bob) + vault.staked(address(token), bob), 100 ether);
            assertEq(usd.balanceOf(address(vault)), vault.reservedRewards());
            assertLe(vault.earned(address(token), alice) + vault.earned(address(token), bob), vault.reservedRewards());
            assertEq(pool.funded, pool.claimed + pool.refunded + vault.reservedRewards());
        }
    }
}

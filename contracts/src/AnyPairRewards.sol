// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IRewardsLaunchpad {
    struct Pair {
        address token;
        bytes32 feedId;
        string assetKey;
        uint256 realBnb;
        uint256 tokenReserve;
        uint256 basePriceAtLaunch;
        address creator;
        uint64 createdAt;
        bool graduated;
    }
    function getPair(address token) external view returns (Pair memory);
}

/// @notice Creator-funded USDT staking rewards, isolated from launchpad liquidity.
/// @dev No owner, upgrade, rescue of user assets, or operator-supplied price. Coupon
/// equivalents are a UI estimate only; every monetary liability is denominated in USDT.
contract AnyPairRewards is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant PRECISION = 1e27;
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 365 days;
    uint256 public constant MAX_FUNDING = 1e30;
    string public constant VERSION = "AnythingRewards/1";
    IRewardsLaunchpad public immutable launchpad;
    IERC20 public immutable rewardToken;
    uint256 public reservedRewards;

    struct Pool {
        uint256 totalStaked;
        uint256 rewardPerTokenStored;
        uint256 funded;
        uint256 allocated;
        uint256 claimed;
        uint256 idle;
        uint256 refunded;
        uint256 epochBudget;
        uint256 epochReleased;
        uint64 start;
        uint64 finish;
    }
    mapping(address => Pool) private pools;
    mapping(address => mapping(address => uint256)) public staked;
    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256)) public rewards;

    event Funded(address indexed token, address indexed creator, uint256 amount, uint64 finish);
    event Staked(address indexed token, address indexed account, uint256 amount);
    event Withdrawn(address indexed token, address indexed account, uint256 amount);
    event Claimed(address indexed token, address indexed account, uint256 amount);
    event IdleRefunded(address indexed token, address indexed creator, uint256 amount);

    error InvalidConfig();
    error InvalidAmount();
    error InvalidDuration();
    error NotCreator();
    error UnknownToken();
    error CampaignActive();
    error CampaignEnded();
    error InsufficientStake();
    error NothingToClaim();
    error UnsupportedTransfer();

    constructor(address launchpad_, address rewardToken_) {
        if (launchpad_.code.length == 0 || rewardToken_.code.length == 0 || launchpad_ == rewardToken_) {
            revert InvalidConfig();
        }
        launchpad = IRewardsLaunchpad(launchpad_);
        rewardToken = IERC20(rewardToken_);
    }

    function getPool(address token) external view returns (Pool memory) {
        return pools[token];
    }

    function _creator(address token) private view returns (address creator) {
        if (token == address(rewardToken) || token.code.length == 0) revert UnknownToken();
        IRewardsLaunchpad.Pair memory pair = launchpad.getPair(token);
        if (pair.token != token || pair.creator == address(0)) revert UnknownToken();
        creator = pair.creator;
        if (msg.sender != creator) revert NotCreator();
    }

    function _released(Pool storage p) private view returns (uint256) {
        if (p.finish == 0) return 0;
        uint256 time = Math.min(block.timestamp, p.finish);
        return Math.mulDiv(p.epochBudget, time - p.start, p.finish - p.start);
    }

    function rewardPerToken(address token) public view returns (uint256) {
        Pool storage p = pools[token];
        if (p.totalStaked == 0) return p.rewardPerTokenStored;
        return p.rewardPerTokenStored + Math.mulDiv(_released(p) - p.epochReleased, PRECISION, p.totalStaked);
    }

    function earned(address token, address account) public view returns (uint256) {
        return rewards[token][account]
            + Math.mulDiv(
            staked[token][account], rewardPerToken(token) - userRewardPerTokenPaid[token][account], PRECISION
        );
    }

    function _update(address token, address account) private {
        Pool storage p = pools[token];
        uint256 released = _released(p);
        uint256 delta = released - p.epochReleased;
        p.epochReleased = released;
        if (p.totalStaked == 0) {
            p.idle += delta;
        } else {
            p.rewardPerTokenStored += Math.mulDiv(delta, PRECISION, p.totalStaked);
            p.allocated += delta;
        }
        if (account != address(0)) {
            rewards[
                token
            ][
                account
            ] += Math.mulDiv(
                staked[token][account], p.rewardPerTokenStored - userRewardPerTokenPaid[token][account], PRECISION
            );
            userRewardPerTokenPaid[token][account] = p.rewardPerTokenStored;
        }
    }

    function _receiveFunding(Pool storage p, uint256 amount) private {
        if (amount == 0 || amount > MAX_FUNDING) revert InvalidAmount();
        uint256 beforeBalance = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        if (rewardToken.balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedTransfer();
        p.funded += amount;
        reservedRewards += amount;
    }

    /// @notice Start a fixed-duration campaign; old accrued claims remain payable.
    function fund(address token, uint256 amount, uint256 duration) external nonReentrant {
        _creator(token);
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration();
        Pool storage p = pools[token];
        if (block.timestamp < p.finish) revert CampaignActive();
        _update(token, address(0));
        _receiveFunding(p, amount);
        p.epochBudget = amount;
        p.epochReleased = 0;
        p.start = uint64(block.timestamp);
        p.finish = uint64(block.timestamp + duration);
        emit Funded(token, msg.sender, amount, p.finish);
    }

    /// @notice Increase the remaining budget without extending the promised finish.
    function topUp(address token, uint256 amount) external nonReentrant {
        _creator(token);
        Pool storage p = pools[token];
        if (block.timestamp >= p.finish) revert CampaignEnded();
        _update(token, address(0));
        uint256 remaining = p.epochBudget - p.epochReleased;
        if (remaining + amount > MAX_FUNDING) revert InvalidAmount();
        _receiveFunding(p, amount);
        p.epochBudget = remaining + amount;
        p.epochReleased = 0;
        p.start = uint64(block.timestamp);
        emit Funded(token, msg.sender, amount, p.finish);
    }

    function stake(address token, uint256 amount) external nonReentrant {
        Pool storage p = pools[token];
        if (block.timestamp >= p.finish) revert CampaignEnded();
        if (amount == 0) revert InvalidAmount();
        _update(token, msg.sender);
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedTransfer();
        staked[token][msg.sender] += amount;
        p.totalStaked += amount;
        emit Staked(token, msg.sender, amount);
    }

    /// @notice Principal withdrawal is independent of any USDT transfer or price source.
    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0 || amount > staked[token][msg.sender]) revert InsufficientStake();
        _update(token, msg.sender);
        staked[token][msg.sender] -= amount;
        pools[token].totalStaked -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(token, msg.sender, amount);
    }

    function claim(address token) external nonReentrant returns (uint256 amount) {
        _update(token, msg.sender);
        amount = rewards[token][msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewards[token][msg.sender] = 0;
        pools[token].claimed += amount;
        reservedRewards -= amount;
        rewardToken.safeTransfer(msg.sender, amount);
        emit Claimed(token, msg.sender, amount);
    }

    /// @notice Only emissions from intervals with no stakers can be refunded.
    /// Already allocated rewards (including rounding dust) can never be clawed back.
    function refundIdle(address token) external nonReentrant returns (uint256 amount) {
        _creator(token);
        Pool storage p = pools[token];
        if (block.timestamp < p.finish) revert CampaignActive();
        _update(token, address(0));
        amount = p.idle - p.refunded;
        if (amount == 0) revert NothingToClaim();
        p.refunded += amount;
        reservedRewards -= amount;
        rewardToken.safeTransfer(msg.sender, amount);
        emit IdleRefunded(token, msg.sender, amount);
    }
}

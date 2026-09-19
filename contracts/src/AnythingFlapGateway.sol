// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRewardsLaunchpad, AnyPairRewards} from "./AnyPairRewards.sol";

interface IFlapPortal {
    struct FeeConfig { uint8 feeType; uint16 bps; address marketingAddress; address dividendToken; uint256 minimumShareBalance; }
    struct NewTokenV7Params {
        string name; string symbol; string meta; uint8 dexThresh; bytes32 salt;
        uint8 migratorType; address quoteToken; uint256 quoteAmt; bytes permitData;
        bytes32 extensionID; bytes extensionData; uint8 dexId; uint16 buyTaxRate;
        uint16 sellTaxRate; uint64 taxDuration; uint64 antiFarmerDuration;
        address commissionReceiver; uint8 tokenVersion; FeeConfig[4] feeConfigs;
    }
    function SALT_LOCK_FEE() external view returns (uint256);
    function lockSalt(bytes32 salt, uint8 tokenVersion) external payable;
    function newTokenV7(NewTokenV7Params calldata params) external payable returns (address);
}

/// @notice Creates standard non-tax Flap tokens and records their original creator
/// and product reference for Anything's existing creator-funded rewards mechanism.
/// @dev Flap's TokenCreated.creator is this factory; this registry's creator
/// is the user's wallet. Flap's pool fees use its native BNB dividend mode. No owner, fees, arbitrary calls or upgrades.
contract AnythingFlapGateway is ReentrancyGuard, IRewardsLaunchpad {
    using SafeERC20 for IERC20;
    IFlapPortal public immutable portal;
    string public constant VERSION = "AnythingFlap/1";
    mapping(address => Pair) private pairs;
    address[] public allPairs;
    event PairCreated(address indexed token, address indexed creator, string assetKey, string meta);

    constructor(address portal_) {
        require(portal_.code.length > 0, "Invalid portal");
        portal = IFlapPortal(portal_);
    }

    function createPair(string calldata name, string calldata symbol, string calldata assetKey,
        string calldata meta, bytes32 salt, address expectedToken, uint256 firstBuy) external payable nonReentrant returns (address token)
    {
        uint256 launchFee = portal.SALT_LOCK_FEE();
        require(msg.value == firstBuy + launchFee, "Value mismatch");
        require(bytes(name).length > 0 && bytes(name).length <= 128, "Invalid name");
        require(bytes(symbol).length > 0 && bytes(symbol).length <= 16, "Invalid symbol");
        require(bytes(meta).length > 0 && bytes(meta).length <= 100, "Invalid metadata");
        require(bytes(assetKey).length > 9 && bytes(assetKey).length <= 73, "Invalid reference");
        uint256 balanceBefore = address(this).balance - msg.value;
        IFlapPortal.NewTokenV7Params memory p;
        p.name = name; p.symbol = symbol; p.meta = meta; p.salt = salt;
        p.dexThresh = 1; // Flap's FOUR_FIFTHS threshold.
        p.migratorType = 3; // PancakeSwap Infinity CL.
        p.quoteAmt = firstBuy;
        p.feeConfigs[0] = IFlapPortal.FeeConfig(2, 10000, address(0), address(0), 10000 ether);
        p.tokenVersion = 7; // TOKEN_V3_PERMIT; all token taxes and commissions stay zero.
        portal.lockSalt{value: launchFee}(salt, 7);
        token = portal.newTokenV7{value: firstBuy}(p);
        require(token == expectedToken && token.code.length > 0 && pairs[token].token == address(0), "Unexpected token");
        pairs[token] = Pair(token, bytes32(0), assetKey, 0, 0, 0, msg.sender, uint64(block.timestamp), false);
        allPairs.push(token);
        uint256 bought = IERC20(token).balanceOf(address(this));
        if (bought > 0) IERC20(token).safeTransfer(msg.sender, bought);
        uint256 refund = address(this).balance - balanceBefore;
        if (refund > 0) { (bool ok,) = msg.sender.call{value: refund}(""); require(ok, "Refund failed"); }
        emit PairCreated(token, msg.sender, assetKey, meta);
    }

    /// @notice Registry identity only. Live reserves and status must come from Flap.
    function getPair(address token) external view returns (Pair memory) { return pairs[token]; }
    function pairsCount() external view returns (uint256) { return allPairs.length; }
    function getPairs(uint256 offset, uint256 limit) external view returns (Pair[] memory result) {
        if (offset >= allPairs.length) return new Pair[](0);
        uint256 n = allPairs.length - offset; if (n > limit) n = limit; if (n > 200) n = 200;
        result = new Pair[](n);
        for (uint256 i; i < n; ++i) result[i] = pairs[allPairs[offset + i]];
    }
    receive() external payable { require(msg.sender == address(portal), "Portal only"); }
}

/// @notice One wallet transaction deploys the gateway and its USDT reward vault.
contract AnythingFlapDeployment {
    AnythingFlapGateway public immutable gateway;
    AnyPairRewards public immutable rewards;
    constructor(address portal, address usdt) {
        gateway = new AnythingFlapGateway(portal);
        rewards = new AnyPairRewards(address(gateway), usdt);
    }
}

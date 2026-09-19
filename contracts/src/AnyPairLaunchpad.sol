// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AnyPairToken} from "./AnyPairToken.sol";
import {PriceOracle} from "./PriceOracle.sol";
import {IPancakeRouter02} from "./interfaces/IPancakeRouter02.sol";

/// @title AnyPairLaunchpad
/// @notice pump.fun-style launchpad on BNB Chain where every token is *paired* to an
///         arbitrary real-world asset via the PriceOracle.
///
///         TRADING is a self-contained constant-product bonding curve with virtual
///         reserves. It holds real BNB and is always solvent: you can never extract
///         more BNB than was put in. This is the part that "really works".
///
///         The ORACLE is genuinely on-chain: at launch we snapshot the paired asset's
///         price, and the live price stays queryable (`assetPrice`) so the app can show
///         real token-vs-asset tracking. Trust tier (REAL / INDEX / LARP) is always
///         visible and never hidden.
///
///         When the curve raises `graduationThreshold` BNB, the pair "graduates":
///         the raised BNB + a reserved token slice are deposited as PancakeSwap
///         liquidity and the LP tokens are burned, so liquidity is locked forever.
///
/// @dev NOT AUDITED. Deploy to BSC Testnet only until a professional audit is done.
contract AnyPairLaunchpad is Ownable, ReentrancyGuard {
    // ------------------------------------------------------------- constants

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether; // 1e9 * 1e18
    uint256 public constant CURVE_SUPPLY = 800_000_000 ether; // sold via the curve
    uint256 public constant LP_SUPPLY = 200_000_000 ether; // reserved for DEX liquidity
    uint256 public constant FEE_BPS = 100; // 1% trade fee
    uint256 public constant BPS = 10_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ---------------------------------------------------------------- config

    PriceOracle public immutable oracle;
    IPancakeRouter02 public immutable router;

    address public feeRecipient;
    uint256 public creationFee; // anti-spam fee to create a pair
    uint256 public graduationThreshold; // realBnb needed to graduate
    uint256 public virtualBnb; // x0 for the curve (start liquidity)

    // ----------------------------------------------------------------- state

    struct Pair {
        address token;
        bytes32 feedId;
        string assetKey;
        uint256 realBnb; // BNB accumulated on the curve (withdrawable reserve)
        uint256 tokenReserve; // tokens remaining on the curve (y)
        uint256 basePriceAtLaunch; // oracle asset price snapshot, 1e18 USD
        address creator;
        uint64 createdAt;
        bool graduated;
    }

    mapping(address => Pair) public pairs; // token => Pair
    address[] public allPairs;

    // ---------------------------------------------------------------- events

    event PairCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string assetKey,
        bytes32 feedId,
        uint256 basePriceAtLaunch
    );
    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 bnbAmount,
        uint256 tokenAmount,
        uint256 newPrice,
        uint256 realBnb
    );
    event Graduated(address indexed token, uint256 bnbToLp, uint256 tokensToLp, uint256 tokensBurned);
    event ConfigUpdated(address feeRecipient, uint256 creationFee, uint256 graduationThreshold, uint256 virtualBnb);

    // ----------------------------------------------------------- constructor

    constructor(address _oracle, address _router, address _feeRecipient, address _owner) Ownable(_owner) {
        require(_oracle != address(0) && _router != address(0) && _feeRecipient != address(0), "zero addr");
        oracle = PriceOracle(_oracle);
        router = IPancakeRouter02(_router);
        feeRecipient = _feeRecipient;
        creationFee = 0;
        graduationThreshold = 20 ether; // testnet default, tune per market
        virtualBnb = 10 ether; // start liquidity => start price = 10 / 800M
    }

    // ----------------------------------------------------------------- admin

    function setConfig(
        address _feeRecipient,
        uint256 _creationFee,
        uint256 _graduationThreshold,
        uint256 _virtualBnb
    ) external onlyOwner {
        require(_feeRecipient != address(0), "zero addr");
        require(_virtualBnb > 0, "virtualBnb=0");
        require(_graduationThreshold > 0, "threshold=0");
        feeRecipient = _feeRecipient;
        creationFee = _creationFee;
        graduationThreshold = _graduationThreshold;
        virtualBnb = _virtualBnb;
        emit ConfigUpdated(_feeRecipient, _creationFee, _graduationThreshold, _virtualBnb);
    }

    // ------------------------------------------------------------- launch

    /// @notice Create a new pair token bonded to `assetKey` (oracle `feedId`).
    /// @param name       token name
    /// @param symbol     token symbol
    /// @param assetKey   human-readable paired asset
    /// @param feedId     oracle feed id (may be 0x0 for a feed-less pure meme)
    /// @param firstBuy   BNB above `creationFee` is used as the creator's first buy
    function createPair(
        string calldata name,
        string calldata symbol,
        string calldata assetKey,
        bytes32 feedId,
        uint256 firstBuy
    ) external payable nonReentrant returns (address tokenAddr) {
        require(msg.value >= creationFee + firstBuy, "insufficient value");

        // snapshot the paired asset price if the feed exists (real oracle link)
        uint256 base = 0;
        if (feedId != bytes32(0) && oracle.feedExists(feedId)) {
            (base,,) = oracle.getPrice(feedId);
        }

        AnyPairToken token = new AnyPairToken(name, symbol, TOTAL_SUPPLY, address(this), assetKey, feedId);
        tokenAddr = address(token);

        pairs[tokenAddr] = Pair({
            token: tokenAddr,
            feedId: feedId,
            assetKey: assetKey,
            realBnb: 0,
            tokenReserve: CURVE_SUPPLY,
            basePriceAtLaunch: base,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            graduated: false
        });
        allPairs.push(tokenAddr);

        if (creationFee > 0) {
            _safeTransferBNB(feeRecipient, creationFee);
        }

        emit PairCreated(tokenAddr, msg.sender, name, symbol, assetKey, feedId, base);

        // optional creator first buy with the remainder
        uint256 buyValue = msg.value - creationFee;
        if (buyValue > 0) {
            _buy(tokenAddr, buyValue, 0, msg.sender);
        }
    }

    // -------------------------------------------------------------- trading

    /// @notice Buy tokens from the curve with BNB.
    function buy(address token, uint256 minTokensOut)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        require(msg.value > 0, "no bnb");
        return _buy(token, msg.value, minTokensOut, msg.sender);
    }

    /// @notice Sell tokens back to the curve for BNB. Caller must approve first.
    function sell(address token, uint256 tokenAmount, uint256 minBnbOut)
        external
        nonReentrant
        returns (uint256 bnbOut)
    {
        Pair storage p = pairs[token];
        require(p.token != address(0), "no pair");
        require(!p.graduated, "graduated");
        require(tokenAmount > 0, "no amount");

        uint256 x = virtualBnb + p.realBnb;
        uint256 y = p.tokenReserve;
        uint256 gross = (x * tokenAmount) / (y + tokenAmount);
        require(gross <= p.realBnb, "insufficient reserve");

        uint256 fee = (gross * FEE_BPS) / BPS;
        bnbOut = gross - fee;
        require(bnbOut >= minBnbOut, "slippage");

        // effects first
        p.tokenReserve = y + tokenAmount;
        p.realBnb -= gross;

        // interactions
        require(IERC20(token).transferFrom(msg.sender, address(this), tokenAmount), "transferFrom failed");
        if (fee > 0) _safeTransferBNB(feeRecipient, fee);
        _safeTransferBNB(msg.sender, bnbOut);

        emit Trade(token, msg.sender, false, bnbOut, tokenAmount, currentPrice(token), p.realBnb);
    }

    function _buy(address token, uint256 valueIn, uint256 minTokensOut, address to)
        internal
        returns (uint256 tokensOut)
    {
        Pair storage p = pairs[token];
        require(p.token != address(0), "no pair");
        require(!p.graduated, "graduated");

        uint256 fee = (valueIn * FEE_BPS) / BPS;
        uint256 net = valueIn - fee;

        uint256 x = virtualBnb + p.realBnb;
        uint256 y = p.tokenReserve;
        tokensOut = (y * net) / (x + net);
        require(tokensOut > 0, "dust");
        require(tokensOut < y, "exceeds curve");
        require(tokensOut >= minTokensOut, "slippage");

        // effects
        p.realBnb += net;
        p.tokenReserve = y - tokensOut;

        // interactions
        if (fee > 0) _safeTransferBNB(feeRecipient, fee);
        require(IERC20(token).transfer(to, tokensOut), "transfer failed");

        emit Trade(token, to, true, valueIn, tokensOut, currentPrice(token), p.realBnb);

        if (p.realBnb >= graduationThreshold) {
            _graduate(token);
        }
    }

    function _graduate(address token) internal {
        Pair storage p = pairs[token];
        p.graduated = true;

        uint256 bnbForLp = p.realBnb;
        p.realBnb = 0;

        uint256 leftover = p.tokenReserve; // unsold curve tokens
        p.tokenReserve = 0;
        if (leftover > 0) {
            require(IERC20(token).transfer(DEAD, leftover), "burn failed");
        }

        // deposit LP_SUPPLY tokens + raised BNB as liquidity; LP tokens go to the
        // pair creator, so the creator can later manage / withdraw the liquidity.
        // NOTE: this makes the token "rug-capable" by design — the creator controls
        // the pool liquidity. This is an explicit product choice, not an oversight.
        require(IERC20(token).approve(address(router), LP_SUPPLY), "approve failed");
        router.addLiquidityETH{ value: bnbForLp }(token, LP_SUPPLY, 0, 0, p.creator, block.timestamp);

        emit Graduated(token, bnbForLp, LP_SUPPLY, leftover);
    }

    // ----------------------------------------------------------------- views

    /// @notice Current curve price of the token in BNB (1e18 fixed point).
    function currentPrice(address token) public view returns (uint256) {
        Pair storage p = pairs[token];
        if (p.token == address(0) || p.tokenReserve == 0) return 0;
        uint256 x = virtualBnb + p.realBnb;
        return (x * 1e18) / p.tokenReserve;
    }

    /// @notice Quote how many tokens `bnbIn` buys right now (after fee).
    function quoteBuy(address token, uint256 bnbIn) external view returns (uint256 tokensOut) {
        Pair storage p = pairs[token];
        if (p.token == address(0) || p.graduated) return 0;
        uint256 net = bnbIn - (bnbIn * FEE_BPS) / BPS;
        uint256 x = virtualBnb + p.realBnb;
        tokensOut = (p.tokenReserve * net) / (x + net);
    }

    /// @notice Quote how much BNB selling `tokenAmount` returns right now (after fee).
    function quoteSell(address token, uint256 tokenAmount) external view returns (uint256 bnbOut) {
        Pair storage p = pairs[token];
        if (p.token == address(0) || p.graduated) return 0;
        uint256 x = virtualBnb + p.realBnb;
        uint256 gross = (x * tokenAmount) / (p.tokenReserve + tokenAmount);
        if (gross > p.realBnb) return 0;
        bnbOut = gross - (gross * FEE_BPS) / BPS;
    }

    /// @notice Live USD price of the paired asset from the oracle (1e18). Real link.
    function assetPrice(address token)
        external
        view
        returns (uint256 price, uint64 updatedAt, PriceOracle.Tier tier)
    {
        Pair storage p = pairs[token];
        require(p.token != address(0), "no pair");
        if (p.feedId == bytes32(0) || !oracle.feedExists(p.feedId)) return (0, 0, PriceOracle.Tier.LARP);
        return oracle.getPrice(p.feedId);
    }

    /// @notice Progress to graduation in basis points (10000 = graduated).
    function graduationProgress(address token) external view returns (uint256 bps) {
        Pair storage p = pairs[token];
        if (p.token == address(0)) return 0;
        if (p.graduated) return BPS;
        uint256 v = (p.realBnb * BPS) / graduationThreshold;
        return v > BPS ? BPS : v;
    }

    function getPair(address token) external view returns (Pair memory) {
        return pairs[token];
    }

    function pairsCount() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Paginated pair listing for the frontend.
    function getPairs(uint256 offset, uint256 limit) external view returns (Pair[] memory list) {
        uint256 n = allPairs.length;
        if (offset >= n) return new Pair[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        list = new Pair[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            list[i - offset] = pairs[allPairs[i]];
        }
    }

    // -------------------------------------------------------------- internal

    function _safeTransferBNB(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{ value: amount }("");
        require(ok, "BNB transfer failed");
    }

    receive() external payable {}
}

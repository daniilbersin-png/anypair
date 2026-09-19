// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PriceOracle
/// @notice On-chain price registry for the assets that AnyPair tokens are paired to.
///         An off-chain updater service pushes real prices (CS skins, commodities, TCG
///         cards, ...) here. Each feed declares its trust TIER so the frontend can show
///         honestly where the number comes from.
///
///         Price is stored as USD price of ONE unit of the asset, in 1e18 fixed point.
///         e.g. Dragon Lore at $8,432.50  ->  8432_500000000000000000
contract PriceOracle is Ownable {
    enum Tier {
        REAL, // real market feed (Steam, TCGplayer, commodity APIs, Chainlink)
        INDEX, // community / DAO managed index (no single market)
        LARP // no real price exists — deterministic pseudo feed, flagged
    }

    struct Feed {
        uint256 price; // USD, 1e18 fixed point
        uint64 updatedAt; // block timestamp of last push
        Tier tier;
        bool exists;
        string description; // human readable, e.g. "CS2 | Dragon Lore (Factory New)"
    }

    mapping(bytes32 => Feed) public feeds;
    mapping(address => bool) public updaters;
    bytes32[] public feedIds;

    /// @notice Informational max staleness (seconds). Consumers may enforce it.
    uint256 public maxStale = 1 hours;

    event FeedRegistered(bytes32 indexed id, Tier tier, string description);
    event PriceUpdated(bytes32 indexed id, uint256 price, uint64 updatedAt);
    event UpdaterSet(address indexed updater, bool allowed);
    event MaxStaleSet(uint256 maxStale);

    modifier onlyUpdater() {
        require(updaters[msg.sender] || msg.sender == owner(), "PriceOracle: not updater");
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        updaters[initialOwner] = true;
        emit UpdaterSet(initialOwner, true);
    }

    // ---------------------------------------------------------------- admin

    function setUpdater(address updater, bool allowed) external onlyOwner {
        updaters[updater] = allowed;
        emit UpdaterSet(updater, allowed);
    }

    function setMaxStale(uint256 seconds_) external onlyOwner {
        maxStale = seconds_;
        emit MaxStaleSet(seconds_);
    }

    // -------------------------------------------------------------- mutating

    /// @notice Register a new asset feed. `id` is a stable key (see `makeFeedId`).
    function registerFeed(bytes32 id, Tier tier, string calldata description) external onlyUpdater {
        require(!feeds[id].exists, "PriceOracle: feed exists");
        feeds[id] = Feed({ price: 0, updatedAt: 0, tier: tier, exists: true, description: description });
        feedIds.push(id);
        emit FeedRegistered(id, tier, description);
    }

    /// @notice Push a single price update.
    function pushPrice(bytes32 id, uint256 price) public onlyUpdater {
        Feed storage f = feeds[id];
        require(f.exists, "PriceOracle: no feed");
        f.price = price;
        f.updatedAt = uint64(block.timestamp);
        emit PriceUpdated(id, price, f.updatedAt);
    }

    /// @notice Batch price update (gas efficient for the updater service).
    function pushPrices(bytes32[] calldata ids, uint256[] calldata prices) external onlyUpdater {
        require(ids.length == prices.length, "PriceOracle: length mismatch");
        for (uint256 i; i < ids.length; ++i) {
            pushPrice(ids[i], prices[i]);
        }
    }

    // ----------------------------------------------------------------- views

    /// @notice Read a price. Reverts if the feed does not exist.
    function getPrice(bytes32 id) external view returns (uint256 price, uint64 updatedAt, Tier tier) {
        Feed storage f = feeds[id];
        require(f.exists, "PriceOracle: no feed");
        return (f.price, f.updatedAt, f.tier);
    }

    /// @notice True if the feed exists and is not older than `maxStale`.
    function isFresh(bytes32 id) external view returns (bool) {
        Feed storage f = feeds[id];
        if (!f.exists || f.updatedAt == 0) return false;
        return block.timestamp - f.updatedAt <= maxStale;
    }

    function feedExists(bytes32 id) external view returns (bool) {
        return feeds[id].exists;
    }

    function feedCount() external view returns (uint256) {
        return feedIds.length;
    }

    /// @notice Deterministic feed id from a human key, e.g. "cs2:dragon-lore-fn".
    function makeFeedId(string calldata key) external pure returns (bytes32) {
        return keccak256(bytes(key));
    }
}

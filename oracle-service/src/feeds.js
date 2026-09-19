// Feed registry for the AnyPair oracle service.
//
// Each feed has:
//   key         stable string id -> keccak256(key) is the on-chain feedId
//   tier        "REAL" | "INDEX" | "LARP"  (matches PriceOracle.Tier)
//   description human readable
//   fetch()     async () => number   USD price of ONE unit of the asset
//
// REAL feeds hit live public endpoints. INDEX feeds are managed values with
// light drift (a real product would replace these with a DAO vote / aggregator).
// LARP feeds are deterministic pseudo prices — clearly flagged, never faked as real.

const TIER = { REAL: 0, INDEX: 1, LARP: 2 };

// ---- helpers ----------------------------------------------------------------

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": "AnyPair-Oracle/0.1", Accept: "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Parse Steam money strings like "$5,432.10" -> 5432.10
function parseMoney(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// deterministic pseudo price from a seed + slow time drift (for LARP feeds)
function larpPrice(seed, base, amplitude) {
  const t = Math.floor(Date.now() / 60000); // changes each minute
  let h = seed ^ t;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
  const r = ((h ^ (h >>> 14)) >>> 0) / 4294967296; // 0..1
  return base * (1 + (r - 0.5) * amplitude);
}

// ---- REAL: CS2 skins via Steam Community Market -----------------------------
// Public endpoint, no key. appid 730 = CS2. currency 1 = USD.
function steamSkin(marketHashName) {
  return async () => {
    const url =
      "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=" +
      encodeURIComponent(marketHashName);
    const j = await fetchJson(url);
    if (!j || j.success !== true) throw new Error("steam: no data");
    const price = parseMoney(j.median_price || j.lowest_price);
    if (price == null) throw new Error("steam: no active listings to price");
    return price;
  };
}

// ---- REAL: crypto/commodity proxy via Coinbase (public, no key) --------------
// Uses a Coinbase spot pair as a live price source (e.g. PAXG-USD for gold).
// Coinbase is used instead of Binance because Binance geo-blocks some hosts (451).
function coinbaseSpot(pair) {
  return async () => {
    const j = await fetchJson(`https://api.coinbase.com/v2/prices/${pair}/spot`);
    const price = Number(j?.data?.amount);
    if (!Number.isFinite(price)) throw new Error("coinbase: bad price");
    return price;
  };
}

// ---- INDEX: managed value with light drift ----------------------------------
function managedIndex(base, driftPct = 0.03) {
  return async () => base * (1 + (Math.random() - 0.5) * driftPct);
}

// -----------------------------------------------------------------------------

export const FEEDS = [
  {
    key: "cs2:dragon-lore-ft",
    tier: TIER.REAL,
    description: "CS2 | AWP Dragon Lore (Field-Tested)",
    fetch: steamSkin("AWP | Dragon Lore (Field-Tested)"),
  },
  {
    key: "cs2:ak-redline-ft",
    tier: TIER.REAL,
    description: "CS2 | AK-47 Redline (Field-Tested)",
    fetch: steamSkin("AK-47 | Redline (Field-Tested)"),
  },
  {
    key: "cs2:awp-asiimov-ft",
    tier: TIER.REAL,
    description: "CS2 | AWP Asiimov (Field-Tested)",
    fetch: steamSkin("AWP | Asiimov (Field-Tested)"),
  },
  {
    key: "cs2:karambit-doppler-fn",
    tier: TIER.REAL,
    description: "CS2 | ★ Karambit Doppler (Factory New)",
    fetch: steamSkin("★ Karambit | Doppler (Factory New)"),
  },
  {
    key: "commodity:gold-oz",
    tier: TIER.REAL,
    description: "Gold (PAXG proxy, per oz)",
    fetch: coinbaseSpot("PAXG-USD"),
  },
  {
    key: "commodity:eggs",
    tier: TIER.INDEX,
    description: "Chicken eggs (wholesale index, per dozen)",
    fetch: managedIndex(3.1),
  },
  {
    key: "commodity:coal",
    tier: TIER.INDEX,
    description: "Thermal coal (index, per ton)",
    fetch: managedIndex(120),
  },
  {
    key: "energy:solar-kwh",
    tier: TIER.INDEX,
    description: "Solar energy (kWh index)",
    fetch: managedIndex(0.12),
  },
  {
    key: "meme:volga-level",
    tier: TIER.LARP,
    description: "Volga river water level (LARP)",
    fetch: async () => larpPrice(55, 1.0, 0.4),
  },
  {
    key: "meme:market-vibe",
    tier: TIER.LARP,
    description: "Market vibe index (LARP)",
    fetch: async () => larpPrice(88, 42.0, 0.6),
  },
];

export { TIER };

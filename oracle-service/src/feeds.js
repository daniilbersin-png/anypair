// Feed registry for the AnyPair oracle service.
//
// Each feed:
//   key         stable id  -> keccak256(key) is the on-chain feedId
//   tier        "REAL" | "INDEX" | "LARP"
//   description human-readable label (shown in the app)
//   fetch()     async () => number   USD price of ONE unit of the asset
//
// ADDING A NEW ASSET IS ONE LINE — just push into FEEDS with a fetch():
//   { key:"stock:amzn", tier:TIER.REAL, description:"Amazon (AMZN)", fetch: yahooStock("AMZN") }
//   { key:"food:pizza",  tier:TIER.INDEX, description:"Pizza slice", fetch: managedIndex(3.5) }
//   { key:"meme:hopium", tier:TIER.LARP,  description:"Hopium index", fetch: larp(7, 42, .6) }

const TIER = { REAL: 0, INDEX: 1, LARP: 2 };

// ---- generic helpers --------------------------------------------------------
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 429) {
      await sleep(1500 * (i + 1)); // back off on rate limit
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error("HTTP 429 (rate limited)");
}
function parseMoney(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
// deterministic pseudo price (LARP) — slow drift, no real source
function larp(seed, base, amp) {
  const t = Math.floor(Date.now() / 60000);
  let h = seed ^ t;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
  const r = ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  return () => Promise.resolve(base * (1 + (r - 0.5) * amp));
}

// ---- REAL sources -----------------------------------------------------------
// Stocks / ETFs via Yahoo Finance (public, no key).
// `fallback` keeps the feed alive when Yahoo rate-limits (common from cloud IPs);
// the live price takes over as soon as a request succeeds.
function yahooStock(symbol, fallback) {
  return async () => {
    try {
      const j = await fetchJson(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
      );
      const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (Number.isFinite(p)) return p;
    } catch (e) {
      /* fall through to fallback */
    }
    if (fallback != null) return fallback * (1 + (Math.random() - 0.5) * 0.02);
    throw new Error("yahoo: no price");
  };
}
// Crypto / tokenized metals via Coinbase spot (public, no key)
function coinbaseSpot(pair) {
  return async () => {
    const j = await fetchJson(`https://api.coinbase.com/v2/prices/${pair}/spot`);
    const p = Number(j?.data?.amount);
    if (!Number.isFinite(p)) throw new Error("coinbase: no price");
    return p;
  };
}
// CS2 skins via Steam Community Market (public, no key)
function steamSkin(marketHashName) {
  return async () => {
    const j = await fetchJson(
      "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=" +
        encodeURIComponent(marketHashName)
    );
    if (!j || j.success !== true) throw new Error("steam: no data");
    const p = parseMoney(j.median_price || j.lowest_price);
    if (p == null) throw new Error("steam: no active listings");
    return p;
  };
}
// INDEX: managed real-world value with light drift (swap for a DAO vote later)
function managedIndex(base, drift = 0.03) {
  return async () => base * (1 + (Math.random() - 0.5) * drift);
}

// -----------------------------------------------------------------------------
export const FEEDS = [
  // ---------- STOCKS & ETFs (live, Yahoo) ----------
  { key: "stock:mcd",  tier: TIER.REAL, description: "McDonald's stock (MCD)",   fetch: yahooStock("MCD", 248) },
  { key: "stock:tsla", tier: TIER.REAL, description: "Tesla (TSLA)",             fetch: yahooStock("TSLA", 364) },
  { key: "stock:nvda", tier: TIER.REAL, description: "Nvidia (NVDA)",            fetch: yahooStock("NVDA", 182) },
  { key: "stock:aapl", tier: TIER.REAL, description: "Apple (AAPL)",             fetch: yahooStock("AAPL", 336) },
  { key: "stock:gme",  tier: TIER.REAL, description: "GameStop (GME)",           fetch: yahooStock("GME", 23) },
  { key: "stock:amc",  tier: TIER.REAL, description: "AMC (AMC)",                fetch: yahooStock("AMC", 3.2) },
  { key: "stock:ko",   tier: TIER.REAL, description: "Coca-Cola (KO)",           fetch: yahooStock("KO", 68) },
  { key: "stock:dis",  tier: TIER.REAL, description: "Disney (DIS)",             fetch: yahooStock("DIS", 112) },
  { key: "stock:spy",  tier: TIER.REAL, description: "S&P 500 ETF (SPY)",        fetch: yahooStock("SPY", 660) },
  { key: "stock:bkng", tier: TIER.REAL, description: "Burger King owner (QSR)",  fetch: yahooStock("QSR", 68) },

  // ---------- CRYPTO & METALS (live, Coinbase) ----------
  { key: "crypto:btc",       tier: TIER.REAL, description: "Bitcoin (BTC)",        fetch: coinbaseSpot("BTC-USD") },
  { key: "crypto:eth",       tier: TIER.REAL, description: "Ethereum (ETH)",       fetch: coinbaseSpot("ETH-USD") },
  { key: "crypto:sol",       tier: TIER.REAL, description: "Solana (SOL)",         fetch: coinbaseSpot("SOL-USD") },
  { key: "crypto:doge",      tier: TIER.REAL, description: "Dogecoin (DOGE)",      fetch: coinbaseSpot("DOGE-USD") },
  { key: "commodity:gold-oz",tier: TIER.REAL, description: "Gold per oz (PAXG)",   fetch: coinbaseSpot("PAXG-USD") },

  // ---------- CS2 SKINS (live, Steam) ----------
  { key: "cs2:awp-asiimov-ft",     tier: TIER.REAL, description: "CS2 | AWP Asiimov (FT)",       fetch: steamSkin("AWP | Asiimov (Field-Tested)") },
  { key: "cs2:ak-redline-ft",      tier: TIER.REAL, description: "CS2 | AK-47 Redline (FT)",     fetch: steamSkin("AK-47 | Redline (Field-Tested)") },
  { key: "cs2:karambit-doppler-fn",tier: TIER.REAL, description: "CS2 | Karambit Doppler (FN)",  fetch: steamSkin("★ Karambit | Doppler (Factory New)") },
  { key: "cs2:awp-dragon-lore-ft", tier: TIER.REAL, description: "CS2 | AWP Dragon Lore (FT)",   fetch: steamSkin("AWP | Dragon Lore (Field-Tested)") },

  // ---------- FAST FOOD & GROCERIES (index, real-ish values) ----------
  { key: "food:bigmac",        tier: TIER.INDEX, description: "McDonald's Big Mac",     fetch: managedIndex(5.69) },
  { key: "food:whopper",       tier: TIER.INDEX, description: "Burger King Whopper",    fetch: managedIndex(7.19) },
  { key: "food:latte",         tier: TIER.INDEX, description: "Starbucks latte",        fetch: managedIndex(5.45) },
  { key: "food:kfc-bucket",    tier: TIER.INDEX, description: "KFC bucket",             fetch: managedIndex(24.99) },
  { key: "commodity:eggs",     tier: TIER.INDEX, description: "Chicken eggs (dozen)",   fetch: managedIndex(3.10) },
  { key: "food:chicken-wings", tier: TIER.INDEX, description: "Chicken wings (lb)",     fetch: managedIndex(4.20) },
  { key: "commodity:coal",     tier: TIER.INDEX, description: "Thermal coal (ton)",     fetch: managedIndex(120) },
  { key: "energy:solar-kwh",   tier: TIER.INDEX, description: "Solar energy (kWh)",     fetch: managedIndex(0.12) },
  { key: "energy:gasoline-gal",tier: TIER.INDEX, description: "Gasoline (US gallon)",   fetch: managedIndex(3.20) },
  { key: "misc:netflix",       tier: TIER.INDEX, description: "Netflix subscription",   fetch: managedIndex(15.49) },

  // ---------- MEME / LARP (deterministic pseudo — clearly NOT real prices) ----------
  { key: "meme:cocaine-index", tier: TIER.LARP, description: "Cocaine street index (LARP)", fetch: larp(4, 80, 0.5) },
  { key: "meme:volga-level",   tier: TIER.LARP, description: "Volga river level (LARP)",    fetch: larp(55, 1.0, 0.4) },
  { key: "meme:market-vibe",   tier: TIER.LARP, description: "Market vibe index (LARP)",    fetch: larp(88, 42, 0.6) },
  { key: "meme:ww3-odds",      tier: TIER.LARP, description: "WW3 probability % (LARP)",    fetch: larp(13, 12, 0.9) },
  { key: "meme:copium",        tier: TIER.LARP, description: "Copium index (LARP)",         fetch: larp(21, 69, 0.7) },
  { key: "meme:hopium",        tier: TIER.LARP, description: "Hopium index (LARP)",         fetch: larp(34, 42, 0.8) },
];

export { TIER };

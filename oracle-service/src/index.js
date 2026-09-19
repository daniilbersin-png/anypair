// AnyPair oracle updater service.
//
// Fetches live asset prices (see feeds.js) and pushes them into the on-chain
// PriceOracle in a single batched transaction. Registers any missing feeds first.
//
// Env:
//   RPC_URL                 BSC (testnet) RPC endpoint
//   ORACLE_ADDRESS          deployed PriceOracle address
//   UPDATER_PRIVATE_KEY     wallet allowed to push (owner or setUpdater'd)
//   INTERVAL_MS             loop interval (default 60000)
//   ONCE=1                  run one cycle then exit
//   DRY_RUN=1               fetch + log, never send a tx (no wallet needed)

import "dotenv/config";
import { ethers } from "ethers";
import { FEEDS } from "./feeds.js";

const ORACLE_ABI = [
  "function registerFeed(bytes32 id, uint8 tier, string description)",
  "function pushPrices(bytes32[] ids, uint256[] prices)",
  "function feedExists(bytes32 id) view returns (bool)",
  "function makeFeedId(string key) pure returns (bytes32)",
];

const DRY_RUN = process.env.DRY_RUN === "1";
const ONCE = process.env.ONCE === "1";
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 60000);

function feedId(key) {
  return ethers.keccak256(ethers.toUtf8Bytes(key));
}

function toWei(usd) {
  // clamp to 18 decimals of precision
  return ethers.parseEther(usd.toFixed(18));
}

async function fetchAll() {
  const out = [];
  for (const f of FEEDS) {
    try {
      const price = await f.fetch();
      if (!Number.isFinite(price) || price <= 0) throw new Error("bad price " + price);
      out.push({ ...f, price });
      console.log(`  ✓ ${f.key.padEnd(24)} $${price.toLocaleString("en-US", { maximumFractionDigits: 4 })}`);
    } catch (e) {
      console.warn(`  ✗ ${f.key.padEnd(24)} ${e.message}`);
    }
  }
  return out;
}

async function cycle(oracle) {
  console.log(`\n[${new Date().toISOString()}] fetching ${FEEDS.length} feeds...`);
  const results = await fetchAll();
  if (results.length === 0) {
    console.warn("no prices fetched, skipping push");
    return;
  }

  if (DRY_RUN || !oracle) {
    console.log(`DRY_RUN: would push ${results.length} prices on-chain.`);
    return;
  }

  // register any feed that doesn't exist yet
  for (const r of results) {
    const id = feedId(r.key);
    const exists = await oracle.feedExists(id);
    if (!exists) {
      console.log(`  registering feed ${r.key} (tier ${r.tier})`);
      const tx = await oracle.registerFeed(id, r.tier, r.description);
      await tx.wait();
    }
  }

  const ids = results.map((r) => feedId(r.key));
  const prices = results.map((r) => toWei(r.price));
  const tx = await oracle.pushPrices(ids, prices);
  console.log(`  pushPrices tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`  confirmed in block ${rc.blockNumber}, gas ${rc.gasUsed}`);
}

async function main() {
  let oracle = null;

  if (!DRY_RUN) {
    const { RPC_URL, ORACLE_ADDRESS, UPDATER_PRIVATE_KEY } = process.env;
    if (!RPC_URL || !ORACLE_ADDRESS || !UPDATER_PRIVATE_KEY) {
      console.error("Missing env: RPC_URL, ORACLE_ADDRESS, UPDATER_PRIVATE_KEY (or set DRY_RUN=1)");
      process.exit(1);
    }
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(UPDATER_PRIVATE_KEY, provider);
    // NonceManager keeps sequential nonces correct even when the node mines instantly
    const signer = new ethers.NonceManager(wallet);
    oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, signer);
    console.log(`updater: ${wallet.address}`);
    console.log(`oracle:  ${ORACLE_ADDRESS}`);
  } else {
    console.log("DRY_RUN mode — no chain connection, no wallet needed.");
  }

  await cycle(oracle);
  if (ONCE) return;

  console.log(`\nlooping every ${INTERVAL_MS / 1000}s (Ctrl+C to stop)`);
  setInterval(() => cycle(oracle).catch((e) => console.error("cycle error:", e.message)), INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

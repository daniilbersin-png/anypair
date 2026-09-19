# AnyPair — launchpad on BNB Chain where a token is paired to *anything*

Launch a meme token whose price is anchored, via an on-chain oracle, to an arbitrary
real-world asset: a CS2 skin, a Pokémon/TCG card, gold, coal, chicken eggs, solar
energy — or a pure meme. Trading runs on a self-contained bonding curve (pump.fun
style) and graduates to PancakeSwap.

> **Status:** backend complete and tested (contracts + oracle service). Frontend is
> the next phase. **Not audited — BSC Testnet only until a professional audit.**

## Repository

```
contracts/        Solidity (Foundry) — the on-chain core
  src/
    PriceOracle.sol        on-chain price registry (REAL / INDEX / LARP tiers)
    AnyPairToken.sol       fixed-supply ERC20 minted per launch
    AnyPairLaunchpad.sol   factory + bonding curve + graduation to PancakeSwap
    interfaces/IPancakeRouter02.sol
  test/                    12 passing tests (curve, oracle link, graduation, solvency)
  script/Deploy.s.sol      BSC testnet deploy + starter feeds
oracle-service/   Node.js — fetches live prices and pushes them on-chain
  src/feeds.js             feed registry (Steam Market, Coinbase, index, larp)
  src/index.js             batched updater loop (supports DRY_RUN)
web/              (frontend — later)
prototype.html    the visual concept prototype (Phase 1)
```

## How it works

1. **Create** a pair: name, ticker, paired asset + its oracle feed. The whole token
   supply (1B) is minted to the launchpad; 800M sells via the curve, 200M is reserved
   for DEX liquidity.
2. **Trade** on a constant-product bonding curve with virtual reserves. It holds real
   BNB and is **always solvent** — you can never extract more BNB than was put in.
3. **Oracle link** is genuinely on-chain: the paired asset's price is snapshotted at
   launch and stays queryable live (`assetPrice(token)`), so the app shows real
   token-vs-asset tracking. Every feed's trust tier is always visible.
4. **Graduate**: once the curve raises `graduationThreshold` BNB, the raised BNB + the
   reserved tokens are deposited as PancakeSwap liquidity and the **LP is burned**
   (locked forever).

### The honest bit about the oracle

Fully paying out an external asset's price 1:1 on redemption is **not solvent** without
collateral/a counterparty — if the oracle says the asset x10'd, the pool won't have the
BNB to cover it. So v1 keeps **trading on the solvent bonding curve** and uses the
oracle as a **real on-chain reference/index** (seeds launch price, drives live tracking).
A full synthetic peg with a collateral model is v2, and the contracts are structured to
extend toward it.

## Run it

### Contracts (Foundry)

```bash
cd contracts
forge test -vv          # compile + run the suite (12 tests)
```

Deploy to BSC Testnet (needs a funded testnet wallet — get tBNB from a faucet):

```bash
cp ../.env.example ../.env      # fill PRIVATE_KEY, BSC_TESTNET_RPC, BSCSCAN_API_KEY
forge script script/Deploy.s.sol --rpc-url bsc_testnet --broadcast --verify
```

### Oracle service (Node)

```bash
cd oracle-service
npm install
npm run dry                     # fetch live prices, print them, send nothing
# then, against a deployed oracle:
#   RPC_URL, ORACLE_ADDRESS, UPDATER_PRIVATE_KEY in .env
npm start                       # loop: fetch + push on-chain every 60s
```

`npm run dry` pulls real prices right now (CS2 skins via Steam Market, gold via
Coinbase, plus index/larp feeds) — no wallet or deployment needed.

## Security notes

- Contracts are **unaudited**. Deploy to testnet only. Get a professional audit before
  touching mainnet or real funds.
- The token has no owner, no mint/burn hooks, no hidden minting — nothing rug-shaped in
  the token itself. Liquidity is burned at graduation.
- The oracle updater key can move prices; in production, restrict updaters and consider
  multiple sources / medianization per feed.

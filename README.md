# Anything

A BNB Chain launchpad for asset-inspired tokens. Create a token, trade on its bonding curve, and graduate to PancakeSwap. External and on-chain asset prices are references; they do not back tokens or control the trading price.

Live site: https://anypair.vercel.app/

## Current deployment

- Network: BNB Chain, chain ID 56.
- Launchpad: `0xd860536cff34829f4d3Fdb678E81bD1C8A81785E`.
- Oracle: `0xCd880c37Df6BA0889F5Cf2398D2F25B9b7bF6011`.
- Router: canonical PancakeSwap V2 `0x10ED43C718714eb63d5aA57B78B54704E256024E`.
- Token supply: 1 billion. 800 million on the curve; 200 million reserved for the DEX.
- At graduation, unsold curve tokens go to the burn address. **LP tokens go to the creator and can be withdrawn.**
- Curve fee: 1% per buy/sell. Creation fee, virtual BNB and graduation threshold are owner-configurable and read from the contract by the UI.

The deployed contracts are not audited. This frontend update does not deploy or alter them, change their configuration, operate the oracle updater, or send real-money transactions.

## Frontend

The English terminal includes EIP-6963 wallet selection with injected-wallet fallback, chain/account checks before transactions, a creation review with gas estimate, explicit 0.5% / 1% / 3% minimum-output protection for curve trades, exact sell allowances, pending transaction recovery, current oracle timestamps, session-only observed charts, and post-graduation pool prices/links.

Token metadata is untrusted: all dynamic HTML values are escaped. RPC errors are rendered as text. Decimal inputs and transaction amounts use bigint, without floating-point conversions. The bundled ethers library avoids depending on a third-party script CDN at signing time.

Quotes are valid in the UI for 30 seconds; creation reviews for two minutes. The deployed contract has no transaction deadline or first-buy minimum-output parameter. The UI rechecks quotes/settings before sending; ordinary trades enforce minimum output on-chain. A wallet can still alter or delay a transaction. No mainnet automatic trading is performed.

The market monitor loads the latest 200 tokens in pages and refreshes all current state every 15 seconds. The graph consists only of observations collected while the page is open. It is not historical OHLC data. Market-cap estimates exclude the burn-address balance after graduation and are shown in BNB, avoiding a hard-coded USD conversion.

## Asset catalogue

The Anything frontend offers 76 references in nine filter categories, with search, custom references, per-item launch buttons and a compact expandable My tokens panel. My tokens shows creations by the connected wallet among the latest 200 scanned launches, not wallet holdings. Browse all explicitly opens the public market list.

`lib/assets.mjs` is the shared allowlist. New references are stored as `anything:<asset-id>` in the existing contract’s `assetKey`, so they remain identifiable on other devices. Custom names use `Custom: <name>`. Quotes are display-only; they do not change the deployed bonding curve. Existing direct oracle feeds retain their feed IDs where units match. Coal is explicitly per kilogram, using the manual per-tonne index divided by 1,000.

The read-only `/api/quotes` Vercel function retrieves Coinbase USD spot quotes, Yahoo Finance latest market/futures quotes, and The Economist’s published Big Mac survey. It validates known IDs, caps batches at eight, times out providers, and caches responses. No API key or signing key is used. Yahoo values quoted in US cents are converted to USD, and indices are labelled in points. Public endpoints may be delayed, rate-limited or unavailable; they are not an execution-price service. Production-scale data use may require appropriate provider licensing.

Whopper, rare collectibles and unusual ideas without a reliable universal feed remain selectable but show **No verified quote**. The EUDA entry links only to public historical research; no current illicit-market price or supplier is provided. Unavailable data never becomes a fabricated price. Source brands identify references and do not imply affiliation.

Big Mac source data: [The Economist](https://github.com/TheEconomist/big-mac-data), MIT licence, included in `assets/big-mac-data-LICENSE.txt`.

## Oracle limits

REAL / INDEX / LARP are feed categories, not verification of source accuracy. The deployment script seeded prices manually. At the handoff check, all eight feeds still carried their deployment timestamp. The UI now shows the timestamp and flags prices past the oracle's configured `maxStale` interval. A fresh timestamp alone does not prove a live market feed.

The `oracle-service` directory is separate from this static Vercel site. Some INDEX/LARP feeds are simulated. It has not been started or given a signing key by this update. Automatic real-world price updates require a separately operated updater and suitable data sources; Vercel static hosting does not run its loop.

## Build and validation

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:fork
pnpm dev:qa
```

The build copies only public frontend assets into `public/`. Vercel publishes that directory and builds the root `api/quotes.js` serverless function. `main` is connected to the existing Vercel project, so pushed changes trigger production deployment.

`test:fork` and `dev:qa` require Foundry's Anvil (`~/.foundry/bin/anvil`, or `ANVIL_BIN`). They fork BNB state with read-only public RPC calls and use randomly generated local accounts. **All transaction writes go to Anvil on a loopback port.** Anvil is needed because the fee-recipient account uses EIP-7702 delegation, unsupported by older local simulators.

The browser QA URL is `http://127.0.0.1:4184/?qa=1`. The test server verifies Host/Origin and exposes its local RPC only on loopback. Neither that server nor its RPC endpoints are part of the production build. No `.env`, private keys or wallet secrets are needed for these checks.

Validation on 19 September 2026:

- 12 unit checks, including reference persistence, creator filtering, CSV parsing, quote units and API input validation; plus: decimal precision, output minimums, fee/curve math, reserve bounds, feed freshness, HTML escaping and metadata validation.
- Deployed AnyPair contract on a disposable fork at block **122828686**: creation, curve buy/sell, minimum-output rejection, exact approval, graduation, creator LP ownership and PancakeSwap purchase passed.
- No real mainnet transactions were sent by these checks.

Original Solidity tests are in `contracts/test`; the pinned dependency revisions are in `contracts/foundry.lock`.

## Project copy and terminal listing

English project copy is in [docs/project-description.md](docs/project-description.md), and the site has an About dialog and metadata. No GMGN profile has been submitted or edited. A link to a token page does not prove indexing. The project's official meme-coin address has not been identified in this handoff.

Sources: [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), [PancakeSwap V2](https://developer.pancakeswap.finance/contracts/v2/addresses), [DEX Screener listing](https://docs.dexscreener.com/token-listing).

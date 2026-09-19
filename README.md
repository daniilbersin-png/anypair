# Anything

Anything is an English-language BNB Chain launchpad for asset-inspired tokens. Choose a published-price reference, add an avatar and X profile, launch, trade, and optionally fund a USDT staking campaign. Reference prices provide context; they do not back tokens, peg their price, or create redemption rights.

Live site: https://anypair.vercel.app/ · X: https://x.com/anythingonbnb

## New launches through Flap

New creation uses Flap's `newTokenV7` standard non-tax TokenV3 path. The Anything gateway records the original creator and product reference, forwards first-buy tokens and refunds to that creator, and enforces the reviewed token address. It has no owner, upgrade mechanism, withdrawal function, or additional launch fee. The external Flap protocol retains its own controls and fees.

- BNB Chain (56), Flap Portal: `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`.
- Flap salt reservation fee is read live. At the integration check it was **0.01 BNB**, plus network fees. The fee is not a liquidity deposit.
- A first buy is optional. Virtual reserves determine the curve price; real reserves come from buyers. Flap handles migration to PancakeSwap Infinity CL.
- The current V7 configuration uses Flap's BNB dividend mode for pool fees, with a 10,000-token eligibility threshold. This is separate from Anything's creator-funded USDT staking campaigns.
- Flap's `TokenCreated.creator` is the gateway factory. Anything's registry records the original user wallet as creator, and the new rewards vault uses that registry for funding permissions.
- Token avatar, description and X profile are published through Flap's documented IPFS upload service before the launch review. Profiles are public. Flap/terminal indexing remains external and can be delayed; a link does not prove successful indexing.

Flap was activated on 19 September 2026 with these verified BNB Chain contracts:

- Deployment: `0x84F90BACc537EFE6B5B745731Be2b28E48eb3E63`.
- Gateway: `0x19E095ec220860F20e3E59d53AcB157628C4cC95`.
- USDT rewards: `0x1cd788E2B8a06F45822a321F4C25278bcF514662`.

Runtime bytecode, the Flap Portal, USDT and the vault's registry binding were checked against the published build. A read-only mainnet simulation through the deployed gateway successfully created a standard Flap token at its predicted address with no first buy; no transaction was sent by that check. Activation itself does not launch tokens or fund reward campaigns.

`/flap-setup.html` is the one-time deployment page and now reports that the gateway is already configured. Do not redeploy it to create a token: use Create your token on the terminal.

## Existing tokens and rewards

Existing contracts are unchanged:

- Original launchpad: `0xd860536cff34829f4d3Fdb678E81bD1C8A81785E`.
- Original oracle: `0xCd880c37Df6BA0889F5Cf2398D2F25B9b7bF6011`.
- Original rewards: `0x642DDE407BA98C483ED80A10C2ae4FeF44338988`.
- BNB-chain USDT: `0x55d398326f99059ff775485246999027b3197955`.

Old tokens cannot become Flap tokens at their existing addresses. Their original curve trades and rewards continue on the old contracts. Old PancakeSwap V2 pool creation still depends on their configured graduation threshold; old LP tokens belong to the creator and can be withdrawn. Hidden launches stay out of listings. Existing deposits, claims and eligible refunds remain accessible by entering a hidden token's contract address; new funding/deposits for hidden tokens are disabled.

## USDT rewards

The creator separately approves and deposits a USDT budget after launch. Holders deposit tokens, receive their proportional share of emissions over time, claim USDT and withdraw tokens without a lock period. Campaign funds, committed rewards and unused emissions follow `AnyPairRewards.sol`; no change was made to its accounting for the Flap integration.

A product “coupon” is an informational estimate of a USDT entitlement divided by the current usable reference price and USDT/USD conversion. It is not a physical voucher or an extra token. A quote outage does not block USDT claims or token withdrawals. New and legacy token registries route to separate vaults, including contract-address lookup beyond the latest listings.

## Asset catalogue and frontend

`lib/assets.mjs` contains the allowlisted source-backed references. The UI only offers entries with usable positive prices, with sources and dates. Fictional and unpriced references were removed. Quotes come from Coinbase, Yahoo Finance, The Economist's published Big Mac survey and eligible existing oracle feeds. Quote endpoints are read-only, bounded and cached. They are display data, not execution prices or a continuously operated oracle. Big Mac source data is MIT-licensed; its notice is in `assets/big-mac-data-LICENSE.txt`.

The separate `oracle-service` is not run by Vercel. Its historical manually seeded or simulated feeds are not made live by this integration.

Wallet support uses EIP-6963 and injected-wallet fallback, with chain/account checks before signatures. Trades enforce a minimum output on-chain; exact token allowances are requested. Launch reviews expire after two minutes, trade quotes after 30 seconds. First-buy execution follows Flap's launch rules; no minimum output parameter exists in its launch call. A wallet can alter or delay a transaction. All token/profile text is untrusted and rendered safely.

The terminal scans the latest 200 tokens per engine, and supports a Flap token deep link outside that window. My tokens identifies creators, not wallet holdings. Charts are observations collected during the current session, not historical OHLC. Full charts and indexing are provided by external terminals. There is no guarantee of inclusion on every terminal.

## Build, testing and deployment

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build:flap
pnpm test:flap
pnpm build
pnpm dev:flap
```

Flap contract checks use Foundry/Anvil. Set `ANVIL_BIN` if it is not at `~/.foundry/bin/anvil`; optionally set `FORK_RPC_URL` to a BNB read endpoint. All writes use randomly generated local test accounts on a loopback-only Anvil fork. Public RPCs are read-only. Public endpoints may prune old state quickly; restart a stale QA fork or use an archive RPC.

The browser QA URL is `http://127.0.0.1:4184/?qa=1`. It uses disposable test BNB and mock USDT. QA RPC endpoints, test scripts and wallet secrets are not included in production. The production build copies public files to `public/`; Vercel builds the root quote and Flap upload functions. Pushing `main` triggers the connected Vercel deployment.

Validation includes 30 Node unit checks, the existing Solidity suite, and a disposable mainnet fork exercising actual Flap V7 creation without a first buy, event/metadata/creator mapping, curve buy/sell, rejected fee/address/duplicate cases, creator-only USDT funding, staking, accrual, claiming and withdrawal. Browser QA additionally checks avatar upload and the launch-to-funding flow. Tests are not an independent audit. No real mainnet launch or terminal-indexing success is claimed by the local checks.

Contract and UI setup: `contracts/src/AnythingFlapGateway.sol`, `flap-setup.html`. Sources: [Flap launch documentation](https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal), [Flap deployed addresses](https://docs.flap.sh/flap/developers/deployed-contract-addresses).

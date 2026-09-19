# Token profiles and creator-funded liquidity

New launches can include an avatar, a description (400 characters) and an X profile. PNG/JPEG/WebP files up to 5 MB are cropped into a square and compressed to WebP, at most 2 KB, in the browser. No image-hosting service or storage credentials are required.

The existing launchpad accepts an arbitrary `assetKey` string. Optional profile data uses `anything:profile:v1:` followed by JSON containing `ref`, `description`, `x` and `avatar`. Both the launchpad pair and the token store this value. Legacy `anything:<reference-id>` values continue working. The reference decoder is shared by the catalogue and reward valuation. Public profile data is immutable after launch and adds storage gas, which is included in the pre-launch estimate. Existing tokens cannot be retrofitted with these fields. GMGN and other external services manage their own metadata; this encoding does not automatically update them.

X links accept only a profile username or HTTPS profile path on x.com/twitter.com. Avatar decoding allows bounded inline WebP data only, not remote URLs or SVG. Descriptions and URLs use text/attribute escaping in the UI.

## Immediate liquidity

The new launch-mode selector uses the existing `createPair` first-buy and graduation paths; it does not change the deployed contracts or owner settings. The creator supplies BNB, receives tokens from the curve, and the trade fee is deducted. If the remaining BNB meets the current graduation threshold, the same transaction creates a PancakeSwap V2 pool with that BNB and the reserved 200 million tokens. Unsold curve tokens are sent to the burn address, and LP tokens go to the creator (withdrawable, not locked).

Threshold and fees are read from the chain and checked again before submission. At the checked production settings on 2026-09-19, the threshold was 0.02 BNB, the first-buy fee 1%, and the minimum calculated input was 0.020202020202020203 BNB plus network fees. The UI calculates from the actual current settings rather than hardcoding this amount. A larger first buy contributes more BNB; a minimum pool is not a promised dollar amount of liquidity or guaranteed terminal indexing. The optional USDT reward campaign is separate from the pool.

## Validation

- `npm test`: 27 passing unit tests, including profile validation, old reference compatibility and integer liquidity calculations.
- `npm run test:profile-launch`: disposable local BNB mainnet fork; maximum avatar storage, profile readback, immediate graduation into actual PancakeSwap contracts, exact pool reserves, LP ownership and a DEX purchase. No public-chain transactions.
- Browser QA: upload an image, review fees/profile, launch with immediate liquidity, reload and verify avatar/description/X/pool as a disconnected visitor.

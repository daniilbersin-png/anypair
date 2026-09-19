# Creator-funded rewards

Status: website implementation complete; production requires a separately deployed rewards contract and its verified address in `config.js`. Until then, `REWARDS: null` disables deposits and funding. No production reward campaign exists merely because the website is published.

## User flow

1. Create a token (or choose an existing launchpad token).
2. Its registered creator selects a USDT budget and a duration. New campaigns start on funding confirmation. The UI offers 7, 30, 90 or 365 days; the contract accepts 1 hour–365 days.
3. Approve the exact budget and fund the rewards contract. Creating a token and funding rewards are separate transactions. A failed or declined funding transaction does not reverse token creation.
4. Holders approve and deposit launchpad tokens. Rewards are streamed from the prepaid budget and shared in proportion to each account's deposited balance over time.
5. `Claim` transfers USDT. `Withdraw` returns deposited tokens without requiring a USDT transfer. Accrued USDT remains claimable after withdrawal and after the campaign ends.

The creator can top up an active campaign without extending its deadline. After it ends, they can recover emissions from intervals with no deposits. They cannot recover allocated holder rewards. A later campaign preserves existing deposits and claims; users who leave deposits in the contract participate in the later campaign too. There is no owner, upgrade, administrator withdrawal or rescue function. Direct token donations and rounding dust cannot be recovered. Funding/claims are distinct from DEX liquidity and have no effect on a token's trading price.

## Coupon meaning

The on-chain entitlement is always USDT, with 18 decimals for BSC Binance-Peg USDT (`0x55d398326f99059ff775485246999027b3197955`). Product coupons are a display estimate:

`coupon units = claimable USDT × USDT/USD quote ÷ product USD reference quote`

For example, 6 USDT at 1 USD/USDT and a 3 USD product reference displays approximately 2 coupons. A quote change changes this estimate, not the amount of USDT owed. Coupons are not NFTs, transferable vouchers, physical redemption rights, or token price pegs.

Only usable USD quotes are converted. Fictional/missing references, managed INDEX/LARP oracle tiers, stale feeds, index points and non-USD prices do not produce invented coupon quantities. Published food surveys are explicitly shown as dated published-price estimates, not live menu prices. Price sources and dates appear alongside the estimate. Quote outages do not block monetary operations. USDT/USD comes from the public Coinbase spot endpoint; its quote is informational and does not guarantee the peg or account for execution fees.

## Contracts and build

- Existing BNB launchpad: `0xd860536cff34829f4d3Fdb678E81bD1C8A81785E`.
- New source: `contracts/src/AnyPairRewards.sol`.
- Solidity 0.8.24, optimizer 200, via-IR, Paris output; dependency versions pinned in `contracts/foundry.lock` (OpenZeppelin 5.1.0, forge-std 1.9.4).
- Run `forge build --root contracts`, then `node scripts/build-rewards.mjs` to export the tested ABI/bytecode to `assets/rewards-artifact.json`. This committed artifact is included in the Vercel static build; Vercel does not compile Solidity.
- Frontend verification checks runtime bytecode, consistency of immutable substitutions, expected launchpad and USDT addresses, version, symbol and decimals before allowing reward transactions.
- Exact approvals are used. Existing insufficient nonzero allowances are reset before approving the requested amount. Wallet identity and chain are rechecked after each approval and before signing the action.
- The UI pads estimated reward-action gas by 30% plus 100,000 gas: accrual can add storage writes between estimation and mining. Unused gas is not spent. Integration tests deliberately advance chain time after estimation.
- All state-changing reward functions use `ReentrancyGuard`; transfers use `SafeERC20`, incoming balance differences are checked, and tax-on-transfer assets are rejected. There is no operator-controlled oracle in reward accounting.

## Activation

Open `/rewards-setup.html` using a browser with a BNB wallet. Review the fixed constructor addresses and estimated maximum gas cost. Deployment is a separate wallet-signed transaction and transfers no USDT. The page records the transaction hash and verifies the confirmed runtime. It does **not** automatically change the official site configuration.

After receiving the address, verify its bytecode/immutables with `verifyRewards`, set only `REWARDS` in `config.js`, build and publish through the existing GitHub → Vercel integration. Confirm the live UI verifies the contract before any real funding. The deployer has no privileged role in the rewards contract. BscScan source verification is an additional publication step after obtaining the deployed address; do not claim it has happened before then.

No private keys are needed by the website or its quote API. No mainnet transactions were sent during implementation/testing. Automated and manual tests do not constitute an independent security audit.

## Verification

- `forge test --root contracts --fuzz-runs 1024`: contract scenarios plus randomized distributions and 32-action sequences checking principal conservation, funded-reserve accounting and maximum liabilities.
- `node --test tests/*.test.mjs`: existing app tests plus coupon precision, FX changes, unavailable/stale quotes, funding input, emission deadlines and runtime-verification rejection cases.
- `node scripts/test-rewards.mjs`: isolated local chain integration with two accounts.
- `node scripts/test-rewards.mjs --fork`: local copy of the actual BNB launchpad and actual BSC USDT, using test-only balances set in Anvil. Public RPC is read-only; all transactions go to a loopback server.
- `node scripts/qa.mjs --rewards`: local browser QA, including token creation with a pending reward budget, funding, deposit, claim and withdrawal. The test server enforces loopback Host/Origin and is never included in the published build.

Real mainnet deployment, wallet-provider approval/cancellation, live campaign funding and subsequent real claims remain activation checks; do not describe them as completed by local tests.

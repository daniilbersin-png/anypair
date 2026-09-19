// AnyPair Terminal — PRODUCTION config (BSC mainnet).
// No private keys here: the app connects the visitor's MetaMask for signing.
// Reads use a public RPC; writes go through the connected wallet.
window.ANYPAIR_CONFIG = {
  RPC_URL: "https://bsc-dataseed.bnbchain.org", // public read RPC
  CHAIN_ID: 56,
  CHAIN_HEX: "0x38",
  CHAIN_NAME: "BNB Smart Chain",
  EXPLORER: "https://bscscan.com",
  // Deployed on BSC mainnet via script/DeployApp.s.sol :
  LAUNCHPAD: "0xd860536cff34829f4d3Fdb678E81bD1C8A81785E",
  REWARDS: null, // Set only after verified wallet deployment.
  USDT: "0x55d398326f99059ff775485246999027b3197955", // BSC Binance-Peg USDT, 18 decimals
  ORACLE: "0xCd880c37Df6BA0889F5Cf2398D2F25B9b7bF6011",
};

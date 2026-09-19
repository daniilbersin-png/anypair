// Source: https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal
export const FLAP_PORTAL='0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';
export const FLAP_IMPLEMENTATION='0x88881b6f03090462a969eC7f48385744Eeb63333';
export const FLAP_STATE='(uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId)';
export const FLAP_ABI=[
 'function SALT_LOCK_FEE() view returns(uint256)',
 'function version() view returns(string)',
 'function getFeeRate() view returns(uint256 buyFeeRate,uint256 sellFeeRate)',
 `function getTokenV8Safe(address) view returns(${FLAP_STATE})`,
 'function quoteExactInput((address inputToken,address outputToken,uint256 inputAmount)) returns(uint256)',
 'function swapExactInput((address inputToken,address outputToken,uint256 inputAmount,uint256 minOutputAmount,bytes permitData)) payable returns(uint256)',
 'function getSaltLock(bytes32) view returns((address locker,uint8 tokenVersion,bool isUsed))',
 'event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)',
 'event TokenBought(uint256 ts,address token,address buyer,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)',
 'event TokenSold(uint256 ts,address token,address seller,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)'
];
export const GATEWAY_ABI=[
 'function portal() view returns(address)','function VERSION() view returns(string)',
 'function createPair(string,string,string,string,bytes32,address,uint256) payable returns(address)',
 'event PairCreated(address indexed token,address indexed creator,string assetKey,string meta)'
];
export function ipfsURL(cid){
 const clean=String(cid||'').replace(/^ipfs:\/\//,'');
 if(!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/.test(clean))throw Error('Invalid IPFS identifier.');
 return 'https://flap.mypinata.cloud/ipfs/'+clean;
}
export async function findFlapSalt(E,{portal=FLAP_PORTAL,implementation=FLAP_IMPLEMENTATION,progress=()=>{}}={}){
 const initHash=E.keccak256('0x3d602d80600a3d3981f3363d3d373d3d3d363d73'+implementation.slice(2).toLowerCase()+'5af43d82803e903d91602b57fd5bf3');
 let salt=E.hexlify(E.randomBytes(32));
 for(let i=0;i<2_000_000;i++){
  const hash=E.keccak256('0xff'+portal.slice(2).toLowerCase()+salt.slice(2)+initHash.slice(2));
  if(hash.endsWith('8888'))return {salt,address:E.getAddress('0x'+hash.slice(-40))};
  salt=E.keccak256(salt);
  if(i%2048===0){progress(i);await new Promise(resolve=>setTimeout(resolve,0));}
 }
 throw Error('Address preparation timed out. Review the launch again.');
}

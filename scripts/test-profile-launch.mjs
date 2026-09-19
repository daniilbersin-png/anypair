// All transactions are sent to a disposable loopback fork, never BNB mainnet.
import {Contract,ZeroHash,parseEther,MaxUint256} from 'ethers';import assert from 'node:assert/strict';
import {createFork,PAD,ROUTER} from './fork.mjs';import {PAIR_ABI} from '../lib/rewards.mjs';
import {encodeProfile,decodeProfile,MAX_AVATAR_BYTES} from '../lib/profile.mjs';import {assetFromKey} from '../lib/assets.mjs';import {minimumPoolBuy,launchLiquidity} from '../lib/liquidity.mjs';
const f=await createFork(),p=f.provider;
try{
 const signer=await p.getSigner(),owner=await signer.getAddress(),pad=new Contract(PAD,[...PAIR_ABI,'function pairsCount() view returns(uint256)','function allPairs(uint256) view returns(address)','function graduationThreshold() view returns(uint256)','function FEE_BPS() view returns(uint256)','function creationFee() view returns(uint256)','function createPair(string,string,string,bytes32,uint256) payable returns(address)'],signer);
 const [n,threshold,bps,fee]=await Promise.all([pad.pairsCount(),pad.graduationThreshold(),pad.FEE_BPS(),pad.creationFee()]);
 const payload=Buffer.alloc(MAX_AVATAR_BYTES,65);payload.write('RIFF',0);payload.write('WEBP',8);
 const profile={description:'A burger token. '.repeat(20),x:'https://x.com/anypair',avatar:'data:image/webp;base64,'+payload.toString('base64')};
 const key=encodeProfile('bigmac-usa',profile),amount=minimumPoolBuy(threshold,bps),args=['Profile QA','PROFILE',key,ZeroHash,amount],value=fee+amount;
 const gas=await pad.createPair.estimateGas(...args,{value});const receipt=await(await pad.createPair(...args,{value,gasLimit:gas*125n/100n})).wait();
 const address=await pad.allPairs(n),pair=await pad.getPair(address);assert.ok(pair.graduated);assert.equal(pair.assetKey,key);assert.equal(assetFromKey(pair.assetKey).id,'bigmac-usa');assert.deepEqual(decodeProfile(pair.assetKey),{ref:'bigmac-usa',...profile,description:profile.description.trim()});
 const token=new Contract(address,['function assetKey() view returns(string)','function balanceOf(address) view returns(uint256)'],p);assert.equal(await token.assetKey(),key);assert.ok(await token.balanceOf(owner)>0n);
 const router=new Contract(ROUTER,['function factory() view returns(address)','function WETH() view returns(address)','function getAmountsOut(uint256,address[]) view returns(uint256[])','function swapExactETHForTokens(uint256,address[],address,uint256) payable returns(uint256[])'],signer),wrapped=await router.WETH();
 const factory=new Contract(await router.factory(),['function getPair(address,address) view returns(address)'],p),pool=new Contract(await factory.getPair(address,wrapped),['function balanceOf(address) view returns(uint256)','function getReserves() view returns(uint112,uint112,uint32)','function token0() view returns(address)'],p);
 const reserves=await pool.getReserves(),tokenFirst=(await pool.token0()).toLowerCase()===address.toLowerCase();assert.equal(reserves[tokenFirst?1:0],launchLiquidity(amount,threshold,bps).net);assert.equal(reserves[tokenFirst?0:1],parseEther('200000000'));assert.ok(await pool.balanceOf(owner)>0n);
 const before=await token.balanceOf(owner),route=[wrapped,address],buy=parseEther('0.001'),quote=await router.getAmountsOut(buy,route);await(await router.swapExactETHForTokens(quote[1]*99n/100n,route,owner,MaxUint256,{value:buy})).wait();assert.ok(await token.balanceOf(owner)>before);
 console.log(JSON.stringify({result:'PASS',forkBlock:f.blockNumber,gasUsed:String(receipt.gasUsed),profileBytes:Buffer.byteLength(key),checks:['maximum avatar storage','profile roundtrip in launchpad and token','asset reference resolution','immediate PancakeSwap creation','exact BNB and token reserves','LP to creator','DEX buy'],realMainnetTransactions:0}));
}finally{await f.close();}

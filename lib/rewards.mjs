import {parseAmount} from './market.mjs';
export const USDT='0x55d398326f99059ff775485246999027b3197955';
export const REWARD_ABI=[
 'function VERSION() view returns(string)','function launchpad() view returns(address)','function rewardToken() view returns(address)',
 'function reservedRewards() view returns(uint256)',
 'function getPool(address) view returns(tuple(uint256 totalStaked,uint256 rewardPerTokenStored,uint256 funded,uint256 allocated,uint256 claimed,uint256 idle,uint256 refunded,uint256 epochBudget,uint256 epochReleased,uint64 start,uint64 finish))',
 'function staked(address,address) view returns(uint256)','function earned(address,address) view returns(uint256)',
 'function fund(address,uint256,uint256)','function topUp(address,uint256)','function stake(address,uint256)',
 'function withdraw(address,uint256)','function claim(address) returns(uint256)','function refundIdle(address) returns(uint256)',
 'error NotCreator()','error CampaignActive()','error CampaignEnded()','error NothingToClaim()','error InsufficientStake()','error InvalidAmount()','error UnsupportedTransfer()'
];
export const TOKEN_ABI=['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'];
export const PAIR_ABI=['function getPair(address) view returns(tuple(address token,bytes32 feedId,string assetKey,uint256 realBnb,uint256 tokenReserve,uint256 basePriceAtLaunch,address creator,uint64 createdAt,bool graduated))'];
// Emission checkpoints may write new storage between estimation and mining.
export function rewardGasLimit(estimate){return (estimate*130n+99n)/100n+100000n;}
export function fundingInput(amount,days){const budget=parseAmount(amount);const duration=Number(days)*86400;if(budget>10n**30n)throw Error('Maximum campaign budget is 1 trillion USDT.');if(!Number.isSafeInteger(duration)||duration<3600||duration>31536000)throw Error('Choose a duration from 1 hour to 365 days.');return{budget,duration};}
export function emitted(pool,now){if(!pool.finish)return 0n;const time=BigInt(Math.min(now,Number(pool.finish)));return time<=pool.start?0n:pool.epochBudget*(time-pool.start)/(pool.finish-pool.start);}
function quoteUnits(value){const [mantissa,exp='0']=String(value).split('e');const [whole,fraction='']=mantissa.split('.');const digits=BigInt(whole+fraction),scale=18+Number(exp)-fraction.length;return scale>=0?digits*10n**BigInt(scale):digits/10n**BigInt(-scale);}
// Display only: never use an external quote to calculate the USDT entitlement.
export function couponEquivalent(earned,asset,quote,usdRate,now=Date.now()){
 if(!asset||['meme','manual'].includes(asset.provider)||!quote||quote.currency!=='USD'||!Number.isFinite(quote.value)||quote.value<=0)return null;
 if(asset.provider==='oracle'&&quote.tier!==0)return null;
 const time=Date.parse(quote.asOf),rateTime=Date.parse(usdRate?.asOf);
 if(!Number.isFinite(time)||time>now+60000||/STALE|INVALID|NO PRICE|unavailable/i.test(quote.status||''))return null;
 const survey=quote.status==='published survey';
 const maxAge=asset.provider==='coinbase'?600000:asset.provider==='oracle'?3600000:7*86400000;
 if(!survey&&now-time>maxAge)return null;
 if(!usdRate||usdRate.currency!=='USD'||!Number.isFinite(usdRate.value)||usdRate.value<=0||!Number.isFinite(rateTime)||rateTime>now+60000||now-rateTime>600000)return null;
 // Quotes are informational numbers. Round into 18-decimal integers before division.
 const price=quoteUnits(quote.value),rate=quoteUnits(usdRate.value);
 if(price<=0n||rate<=0n)return null;
 return{units:earned*rate/price,survey};
}
export function runtimeMatches(actual,artifact){
 let expected=artifact.deployedBytecode.toLowerCase(),code=actual.toLowerCase();
 if(code.length!==expected.length)return false;
 for(const refs of Object.values(artifact.immutableReferences)){let value;for(const {start,length} of refs){const a=2+start*2,b=a+length*2,current=code.slice(a,b);if(value!==undefined&&value!==current)return false;value=current;expected=expected.slice(0,a)+'0'.repeat(length*2)+expected.slice(b);code=code.slice(0,a)+'0'.repeat(length*2)+code.slice(b);}}
 return code===expected;
}
export async function verifyRewards(E,rpc,config,artifact){
 if(!config.REWARDS)throw Error('Rewards are awaiting one-time activation.');
 const contract=new E.Contract(config.REWARDS,REWARD_ABI,rpc),usd=new E.Contract(config.USDT,TOKEN_ABI,rpc);
 const [code,pad,reward,version,decimals,symbol]=await Promise.all([rpc.getCode(config.REWARDS),contract.launchpad(),contract.rewardToken(),contract.VERSION(),usd.decimals(),usd.symbol()]);
 if(!runtimeMatches(code,artifact)||pad.toLowerCase()!==config.LAUNCHPAD.toLowerCase()||reward.toLowerCase()!==config.USDT.toLowerCase()||version!=='AnythingRewards/1'||decimals!==18n||symbol!=='USDT')throw Error('Rewards contract verification failed. Transactions disabled.');
 return contract;
}

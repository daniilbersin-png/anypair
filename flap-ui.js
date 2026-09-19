import {FLAP_PORTAL,FLAP_ABI,GATEWAY_ABI,findFlapSalt,ipfsURL} from './lib/flap.mjs';
import {PAIR_ABI} from './lib/rewards.mjs';
import {assetFromKey} from './lib/assets.mjs';
import {normalizeX} from './lib/profile.mjs';
import {parseAmount,validTokenFields,minOutput} from './lib/market.mjs';
import {requirePricedReference} from './catalog.js';
export function initFlap(ctx){
 const E=window.ethers,$=s=>document.querySelector(s),fmt=E.formatEther,metaCache=new Map(),registered=new Set();let review,fee;
 const portal=()=>new E.Contract(FLAP_PORTAL,FLAP_ABI,ctx.get().rpc);
 const gateway=(runner=ctx.get().rpc)=>new E.Contract(ctx.get().C.FLAP_GATEWAY,[...GATEWAY_ABI,...PAIR_ABI,'function pairsCount() view returns(uint256)',`function getPairs(uint256,uint256) view returns((address token,bytes32 feedId,string assetKey,uint256 realBnb,uint256 tokenReserve,uint256 basePriceAtLaunch,address creator,uint64 createdAt,bool graduated)[])`],runner);
 function invalidate(){review=null;$('#launch-review').hidden=true;$('#f-confirm').hidden=true;}
 function detail(){const {C}=ctx.get();$('#f-liquidity-note').textContent=C.FLAP_GATEWAY?'Launch on Flap without adding a liquidity pool. First buy is optional. '+(fee===undefined?'The Flap launch fee is checked before signing.':'Flap address reservation: '+fmt(fee)+' BNB.')+' Network fees are additional. Virtual reserves determine the curve price; actual BNB comes from buyers.':'Flap launches are awaiting one-time activation. Existing tokens and rewards remain accessible.';}
 async function ready(){if(!ctx.get().C.FLAP_GATEWAY){detail();return;}fee=await portal().SALT_LOCK_FEE();if((await gateway().portal()).toLowerCase()!==FLAP_PORTAL.toLowerCase())throw Error('Flap gateway mismatch.');detail();}
 async function resolve(address){
  if(!ctx.get().C.FLAP_GATEWAY||!E.isAddress(address||''))return false;
  if(registered.has(address.toLowerCase()))return true;
  const p=await gateway().getPair(address);if(p.token.toLowerCase()!==address.toLowerCase())return false;registered.add(address.toLowerCase());return true;
 }
 async function lookup(address){if(!await resolve(address))return null;return read(await gateway().getPair(address));}
 async function read(p){
  registered.add(p.token.toLowerCase());
  const {rpc}=ctx.get(),t=new E.Contract(p.token,['function name() view returns(string)','function symbol() view returns(string)','function metaURI() view returns(string)','function totalSupply() view returns(uint256)'],rpc);
  const [state,name,sym,supply]=await Promise.all([portal().getTokenV8Safe(p.token),t.name(),t.symbol(),t.totalSupply()]);
  if(state.status===0n||state.quoteTokenAddress!==E.ZeroAddress)throw Error('Unsupported Flap token state.');
  let profile=metaCache.get(p.token);
  if(!profile){try{const cid=await t.metaURI(),r=await fetch(ipfsURL(cid),{signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error();const m=await r.json();let x='';try{x=normalizeX(m.twitter||'')}catch{}profile={description:String(m.description||'').slice(0,1600),avatar:ipfsURL(m.image),x};metaCache.set(p.token,profile);}catch{profile={};}}
  const reference=assetFromKey(p.assetKey);return {backend:'flap',token:p.token,name,sym,creator:p.creator,reference,asset:reference?.name||'Asset reference',profile,feedId:E.ZeroHash,realBnb:state.reserve,tokenReserve:0n,price:state.price,supply,graduated:state.status===4n,pool:state.pool,poolBnb:state.reserve,grad:Number(state.progress*10000n/10n**18n),virtualBnb:state.r};
 }
 async function list(){if(!ctx.get().C.FLAP_GATEWAY)return[];const g=gateway(),count=Number(await g.pairsCount()),rows=[];for(let i=Math.max(0,count-200);i<count;i+=30)rows.push(...await g.getPairs(i,Math.min(30,count-i)));const result=[];for(let i=0;i<rows.length;i+=5)result.push(...await Promise.all(rows.slice(i,i+5).map(read)));return result;}
 async function prepare(){
  const c=ctx.get();if(!c.C.FLAP_GATEWAY){$('#f-status').textContent='Flap is not activated yet. The project owner must complete the one-time setup.';return;}if(!c.me){ctx.openWallet();return;}if(c.busy||c.pendingHash)return;
  invalidate();ctx.setBusy(true);
  try{
   await ctx.verifyWallet();const fields=validTokenFields($('#f-name').value,$('#f-ticker').value.trim().toUpperCase()),reference=$('#f-feed').value;await requirePricedReference(reference);
   const profile=ctx.profile.read();if(!profile.avatar)throw Error('Choose a token avatar before launching.');
   const firstBuy=parseAmount($('#f-buy').value.trim()||'0',{allowZero:true}),rewardIntent=await ctx.rewards.launchIntent();
   $('#f-status').textContent='Preparing your token address…';const salt=await findFlapSalt(E);
   if(await c.rpc.getCode(salt.address)!=='0x')throw Error('Token address already used. Review again.');
   fee=await portal().SALT_LOCK_FEE();const value=fee+firstBuy;
   $('#f-status').textContent='Publishing your avatar and public profile to Flap / IPFS…';
   const response=await fetch('/api/flap-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,creator:c.me,token:salt.address,reference}),signal:AbortSignal.timeout(30000)}),data=await response.json();if(!response.ok)throw Error(data.error||'Profile upload failed.');ipfsURL(data.cid);
   await ctx.verifyWallet();if(ctx.get().me!==c.me)throw Error('Wallet changed. Review again.');
   const args=[fields.name,fields.symbol,'anything:'+reference,data.cid,salt.salt,salt.address,firstBuy],writer=gateway(c.signer),gas=await writer.createPair.estimateGas(...args,{value}),fees=await c.browserProvider.getFeeData();if(!fees.gasPrice)throw Error('Network gas price unavailable.');
   const gasLimit=(gas*130n+99n)/100n,cost=gasLimit*fees.gasPrice;if(await c.rpc.getBalance(c.me,'pending')<value+cost)throw Error('Need up to '+fmt(value+cost)+' BNB including network fees.');
   review={args,value,fee,firstBuy,gasLimit,gasPrice:fees.gasPrice,owner:c.me,expires:Date.now()+120000,address:salt.address,fields,rewardIntent,reference};
   $('#launch-review').replaceChildren();for(const text of [fields.name+' / '+fields.symbol,'Network: '+(c.LOCAL?'LOCAL FORK · TEST FUNDS':'BNB Chain · MAINNET'),'Token: '+salt.address,'Your creator wallet: '+c.me,'Engine: Flap · zero token transfer tax','Flap address reservation: '+fmt(fee)+' BNB (protocol fee, not liquidity)','Optional first buy: '+fmt(firstBuy)+' BNB','Maximum network fee at this gas price: '+fmt(cost)+' BNB','Maximum total: '+fmt(value+cost)+' BNB','No initial pool deposit is required. Buyers supply the actual curve reserve; Flap handles migration to PancakeSwap.','Flap pool fees use its BNB dividend mode. Our creator-funded USDT rewards are a separate campaign.','The Anything gateway appears as the factory in Flap events; your wallet is recorded as the creator for Anything rewards.','Avatar and X profile are published using Flap metadata. Terminal indexing can take time.',...(rewardIntent?['After launch: separately approve and fund '+rewardIntent.amount+' USDT for '+rewardIntent.days+' days.']:[])]){const p=document.createElement('p');p.textContent=text;$('#launch-review').append(p);}
   $('#launch-review').hidden=false;$('#f-confirm').hidden=false;$('#f-status').textContent='Review valid for two minutes. No token transaction has been sent.';
  }catch(e){if(c.LOCAL)console.error('Local Flap review',e);$('#f-status').textContent=ctx.errorText(e);}finally{ctx.setBusy(false);detail();}
 }
 async function confirm(){const c=ctx.get(),r=review;if(c.busy||c.pendingHash||!r)return;ctx.setBusy(true);try{
  await ctx.verifyWallet();if(c.me!==r.owner||r.expires<Date.now())throw Error('Review expired or wallet changed. Review again.');await requirePricedReference(r.reference);if(await portal().SALT_LOCK_FEE()!==r.fee)throw Error('Flap fee changed. Review again.');
  const writer=gateway(c.signer);await writer.createPair.staticCall(...r.args,{value:r.value});$('#f-status').textContent='Confirm the Flap token launch in your wallet.';
  const tx=await writer.createPair(...r.args,{value:r.value,gasLimit:r.gasLimit,gasPrice:r.gasPrice}),receipt=await ctx.waitMined(tx,'launch-flap',r.address);
  const event=receipt.logs.filter(l=>l.address.toLowerCase()===c.C.FLAP_GATEWAY.toLowerCase()).map(l=>{try{return writer.interface.parseLog(l)}catch{return null}}).find(e=>e?.name==='PairCreated'&&e.args.creator.toLowerCase()===r.owner.toLowerCase());
  if(!event||event.args.token.toLowerCase()!==r.address.toLowerCase())throw Error('Launch receipt did not match the reviewed token. Check the transaction.');
  invalidate();ctx.profile.reset();await ctx.created(r.address,r.rewardIntent,receipt.hash);
 }catch(e){$('#f-status').textContent=ctx.errorText(e);ctx.status(ctx.errorText(e),ctx.get().pendingHash||undefined);invalidate();}finally{ctx.setBusy(false);}}
 async function quote(token,side,input,bps){const params=side==='buy'?[E.ZeroAddress,token,input]:[token,E.ZeroAddress,input],output=await portal().quoteExactInput.staticCall(params);if(output<=0n)throw Error('No tradable quote available.');return{backend:'flap',token,side,input,output,min:minOutput(output,bps),expires:Date.now()+30000,bps};}
 async function trade(q){const c=ctx.get(),writer=new E.Contract(FLAP_PORTAL,FLAP_ABI,c.signer);await ctx.verifyWallet();if(q.expires<Date.now())throw Error('Quote expired. Review a new quote.');
  if(q.side==='sell'){const t=new E.Contract(q.token,['function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'],c.signer);if(await t.allowance(c.me,FLAP_PORTAL)<q.input){ctx.status('Approve this token amount for Flap.');await ctx.waitMined(await t.approve(FLAP_PORTAL,q.input),'flap-approval',q.token);}}
  await ctx.verifyWallet();if(ctx.get().me!==c.me)throw Error('Wallet changed.');const fresh=await quote(q.token,q.side,q.input,q.bps);if(fresh.output<q.min)throw Error('Price moved beyond your tolerance. Review again.');
  const params=[q.side==='buy'?E.ZeroAddress:q.token,q.side==='buy'?q.token:E.ZeroAddress,q.input,q.min,'0x'],value=q.side==='buy'?q.input:0n;await writer.swapExactInput.staticCall(params,{value});const gas=await writer.swapExactInput.estimateGas(params,{value});
  ctx.status('Confirm the '+q.side+' with Flap in your wallet.');const tx=await writer.swapExactInput(params,{value,gasLimit:gas*130n/100n});await ctx.waitMined(tx,'flap-'+q.side,q.token);ctx.status('FLAP '+q.side.toUpperCase()+' CONFIRMED',tx.hash);
 }
 return{ready,detail,invalidate,list,lookup,resolve,has:address=>registered.has(String(address).toLowerCase()),prepare,confirm,quote,trade};
}

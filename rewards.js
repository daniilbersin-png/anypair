import {englishDateTime} from './lib/language.mjs';
import {isHiddenToken,visibleListings} from './lib/listings.mjs';
import {assetFromKey} from './lib/assets.mjs';
import {parseAmount} from './lib/market.mjs';
import {REWARD_ABI,TOKEN_ABI,PAIR_ABI,fundingInput,emitted,couponEquivalent,verifyRewards,rewardGasLimit} from './lib/rewards.mjs';

export function initRewards(ctx){
 const E=window.ethers,$=s=>document.querySelector(s),fmt=E.formatEther;
 const human=n=>Number(fmt(n)).toLocaleString('en-US',{maximumSignificantDigits:8});
 let vault,artifact,verified='',data,token='',loading=false,acting=false,rate,rateUntil=0,seq=0;
 const dialog=document.createElement('dialog');dialog.id='rewards-dialog';
 dialog.innerHTML=`<div class="mh">REWARDS <button id="rw-close" aria-label="Close rewards">[X]</button></div><div class="mb rewards-body">
 <p id="rw-environment" class="rw-notice" hidden>LOCAL TEST NETWORK · These funds have no real value.</p><div class="rw-intro"><span class="rw-kicker">HOLD AN IDEA. EARN ITS EQUIVALENT.</span><h1>Stake tokens. Collect coupons.</h1><p>Creators fund campaigns with USDT. Your share of the deposited tokens earns a share of that budget over time. Withdraw your tokens whenever you want.</p></div>
 <div id="rw-activation" class="rw-notice" hidden>Rewards are awaiting one-time contract activation on BNB Chain. No rewards are accruing yet. <a href="flap-setup.html">Project setup ↗</a></div>
 <label for="rw-token">TOKEN · LATEST LAUNCHES</label><select id="rw-token"><option value="">Select a token</option></select>
 <details><summary>Find a token by contract address</summary><div class="rw-row"><input id="rw-address" aria-label="Token contract address" placeholder="0x…"><button id="rw-load">Load</button></div></details>
 <div id="rw-contract" class="note"></div><p id="rw-state" role="status" aria-live="polite">Choose a token to see its campaign.</p>
 <section id="rw-content" hidden>
 <div class="rw-row rw-heading"><h2 id="rw-title"></h2><button id="rw-refresh">Refresh</button></div><p id="rw-campaign" class="note"></p>
 <div class="rw-stats"><div><span>YOUR DEPOSIT</span><strong id="rw-staked">—</strong></div><div><span>CLAIMABLE USDT</span><strong id="rw-earned">—</strong></div><div class="rw-coupon"><span>PRODUCT COUPON EQUIVALENT</span><strong id="rw-coupons">—</strong><small id="rw-product"></small></div></div>
 <p id="rw-quote" class="note"></p><p class="note">Coupons are a changing reference estimate of your USDT reward, not a separate token or a physical voucher. Claim pays USDT. Quote outages never prevent withdrawals or claims.</p>
 <button id="rw-connect">CONNECT WALLET</button>
 <div class="rw-actions"><section><h3>Deposit tokens</h3><p id="rw-wallet" class="note"></p><label for="rw-deposit">TOKEN AMOUNT</label><div class="rw-row"><input id="rw-deposit" inputmode="decimal" placeholder="0.0"><button id="rw-max-deposit">Max</button></div><button id="rw-stake" class="rw-primary">APPROVE & DEPOSIT</button></section>
 <section><h3>Withdraw tokens</h3><p class="note">No lock period. Accrued USDT stays claimable.</p><label for="rw-withdraw">TOKEN AMOUNT</label><div class="rw-row"><input id="rw-withdraw" inputmode="decimal" placeholder="0.0"><button id="rw-max-withdraw">Max</button></div><button id="rw-unstake">WITHDRAW TOKENS</button></section></div>
 <button id="rw-claim" class="rw-primary">CLAIM USDT</button>
 <section id="rw-creator" class="rw-creator" hidden><h2>Creator funding</h2><p id="rw-fund-note" class="note"></p><div class="rw-actions"><div><label for="rw-budget">USDT TO ADD</label><input id="rw-budget" inputmode="decimal" placeholder="100"></div><div><label for="rw-days">CAMPAIGN DURATION</label><select id="rw-days"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></select></div></div><button id="rw-fund" class="rw-primary">APPROVE & FUND CAMPAIGN</button><p class="note">The campaign starts when funding confirms. Funding is committed for its duration. Only emissions from periods with no stakers can be refunded after the campaign ends. Allocated rewards cannot be taken back.</p><button id="rw-refund">REFUND UNUSED EMISSIONS</button></section>
 <p id="rw-read-at" class="note"></p></section>
 <p class="note">Each transaction needs BNB for network fees. Rewards depend on the funded budget, your share and time deposited; no fixed yield is promised. This new contract has not had an independent audit.</p></div>`;
 document.body.append(dialog);
 const notify=message=>{$('#rw-state').textContent=message;};
 function controls(){
  const c=ctx.get(token),locked=acting||c.busy||!!c.pendingHash||loading,ready=!!data&&!!vault,connected=!!c.me;
  for(const el of dialog.querySelectorAll('input,select,button'))el.disabled=locked;
  $('#rw-close').disabled=acting;
  $('#rw-connect').hidden=connected;$('#rw-creator').hidden=!ready||!connected||data.creator.toLowerCase()!==c.me.toLowerCase();
  for(const id of ['rw-stake','rw-unstake','rw-claim','rw-fund','rw-refund','rw-max-deposit','rw-max-withdraw'])$('#'+id).disabled=locked||!ready||!connected;
  if(ready){const archived=isHiddenToken(data.token);$('#rw-stake').disabled||=!data.active||archived;$('#rw-max-deposit').disabled||=!data.active||archived;$('#rw-fund').disabled||=archived;$('#rw-unstake').disabled||=data.staked===0n;$('#rw-claim').disabled||=data.earned===0n;$('#rw-refund').disabled||=data.active||data.refundable===0n;$('#rw-days').disabled=locked||data.active||archived;}
 }
 async function contract(target=token){
  const {rpc,C}=ctx.get(target);if(!rpc)throw Error('Connecting to BNB Chain. Try again shortly.');
  if(!C.REWARDS){vault=null;return null;}
  if(verified===C.REWARDS&&vault)return vault;
  if(!artifact){const r=await fetch('/assets/rewards-artifact.json');if(!r.ok)throw Error('Contract artifact unavailable.');artifact=await r.json();}
  vault=await verifyRewards(E,rpc,C,artifact);verified=C.REWARDS;return vault;
 }
 function options(explicitAddress=false){
  const {secs,selected}=ctx.get(token),select=$('#rw-token');const candidate=token||selected||'',previous=isHiddenToken(candidate)&&!explicitAddress?'':candidate;
  select.replaceChildren(new Option('Select a token',''));
  for(const s of visibleListings(secs))select.add(new Option(s.sym+' · '+s.name+' · '+s.token.slice(0,6)+'…'+s.token.slice(-4),s.token));
  if(previous&&!Array.from(select.options).some(o=>o.value.toLowerCase()===previous.toLowerCase()))select.add(new Option(previous,previous));
  select.value=Array.from(select.options).find(o=>o.value.toLowerCase()===previous.toLowerCase())?.value||'';token=select.value;
 }
 async function readQuote(snapshot){
  const c=ctx.get(token),asset=snapshot.asset;let q;
  try{if(asset)q=await ctx.quote(asset);if(rateUntil<Date.now()){const r=await fetch('/api/usdt-quote',{signal:AbortSignal.timeout(9000)});rate=r.ok?await r.json():undefined;rateUntil=Date.now()+60000;}}catch{rate=undefined;}
  if(data!==snapshot||c.me!==ctx.get(token).me)return;
  const equivalent=couponEquivalent(snapshot.earned,asset,q,rate);
  $('#rw-coupons').textContent=equivalent?'≈ '+human(equivalent.units):'Quote unavailable';
  $('#rw-product').textContent=asset?asset.name+' · '+asset.unit:'No product reference';
  $('#rw-quote').replaceChildren(document.createTextNode(equivalent?(equivalent.survey?'Published-price estimate':'Reference estimate')+': $'+q.value+' / '+asset.unit+' · '+q.asOf+'. USDT/USD '+rate.value+' · '+rate.asOf+'. ':'No usable USD product quote and USDT/USD conversion. Your USDT reward is still claimable.'));
  if(asset?.url){const a=document.createElement('a');a.href=asset.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Product source ↗';$('#rw-quote').append(a);}
  if(equivalent){const a=document.createElement('a');a.href=rate.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=' USDT/USD source ↗';$('#rw-quote').append(a);}
 }
 function render(){
  const c=ctx.get(token),d=data,p=d.pool;$('#rw-content').hidden=false;$('#rw-title').textContent=d.name+' / '+d.symbol;
  $('#rw-campaign').textContent=(d.active?'ACTIVE · ends '+englishDateTime(new Date(Number(p.finish)*1000)):p.finish?'ENDED · deposits paused':'NOT FUNDED')+' · Total deposited: '+human(p.totalStaked)+' '+d.symbol+' · Lifetime funding: '+human(p.funded)+' USDT · Scheduled remaining: '+human(p.epochBudget-emitted(p,d.now))+' USDT';
  $('#rw-staked').textContent=human(d.staked)+' '+d.symbol;$('#rw-earned').textContent=fmt(d.earned);$('#rw-wallet').textContent='Wallet: '+human(d.balance)+' '+d.symbol;
  $('#rw-fund-note').textContent='Your balance: '+human(d.usdtBalance)+' USDT. '+(d.active?'A top-up increases the remaining budget and keeps the same end date.':'Start a new funded campaign. Existing deposits and unclaimed rewards are preserved.');
  $('#rw-fund').textContent=d.active?'APPROVE & TOP UP USDT':'APPROVE & FUND CAMPAIGN';$('#rw-refund').textContent='REFUND UNUSED EMISSIONS · '+human(d.refundable)+' USDT';
  $('#rw-read-at').textContent='On-chain snapshot: block '+d.block+' · '+englishDateTime(new Date(d.now*1000))+'. Updates every 15 seconds while open.';
  $('#rw-coupons').textContent='Checking reference…';$('#rw-product').textContent=d.asset?.name||'No product reference';$('#rw-quote').textContent='';
  controls();void readQuote(d);
 }
 async function refresh({message=true}={}){
  if(loading||acting)return;const version=++seq;loading=true;data=undefined;controls();$('#rw-content').hidden=true;
  const chosen=token;
  try{
   await ctx.resolve?.(chosen);if(version!==seq||chosen!==token)return;const c=ctx.get(chosen);$('#rw-activation').hidden=!!c.C.REWARDS;$('#rw-environment').hidden=!c.LOCAL;
   const v=await contract();$('#rw-contract').replaceChildren();
   if(!v){notify('The rewards contract is not activated. Funding and deposits are disabled.');return;}
   const a=document.createElement('a');a.href=c.C.EXPLORER+'/address/'+c.C.REWARDS;a.textContent='Verified rewards contract: '+c.C.REWARDS;a.target='_blank';a.rel='noopener noreferrer';$('#rw-contract').append(a);
   if(!E.isAddress(chosen)){notify('Choose a token to see its campaign.');return;}
   if(message)notify('Reading campaign and balances…');
   const block=await c.rpc.getBlock('latest'),at={blockTag:block.number},t=new E.Contract(chosen,TOKEN_ABI,c.rpc),pad=new E.Contract(c.C.LAUNCHPAD,PAIR_ABI,c.rpc);
   const [pair,pool,name,symbol,staked,earned,balance,usdtBalance]=await Promise.all([pad.getPair(chosen,at),v.getPool(chosen,at),t.name(at),t.symbol(at),c.me?v.staked(chosen,c.me,at):0n,c.me?v.earned(chosen,c.me,at):0n,c.me?t.balanceOf(c.me,at):0n,c.me?new E.Contract(c.C.USDT,TOKEN_ABI,c.rpc).balanceOf(c.me,at):0n]);
   if(version!==seq||chosen!==token||c.me!==ctx.get(token).me)return;
   if(pair.token.toLowerCase()!==chosen.toLowerCase())throw Error('This token was not created on this launchpad.');
   const active=BigInt(block.timestamp)<pool.finish,additional=pool.totalStaked===0n?emitted(pool,block.timestamp)-pool.epochReleased:0n;
   data={token:chosen,owner:c.me,creator:pair.creator,pool,name,symbol,asset:assetFromKey(pair.assetKey),staked,earned,balance,usdtBalance,active,refundable:pool.idle+additional-pool.refunded,now:block.timestamp,readAt:Date.now(),block:block.number};
   render();if(message)notify(isHiddenToken(chosen)?'This token is hidden from listings. Existing withdrawals, claims and eligible refunds remain accessible by contract address. New deposits and funding are disabled.':c.pendingHash?'A transaction is pending. Use the terminal Refresh button to check confirmation.':'Rewards come only from the creator’s deposited USDT.');
  }catch(e){vault=null;verified='';notify(ctx.errorText(e)+' Displayed balances are unavailable; transactions are disabled.');}
  finally{loading=false;controls();}
 }
 async function approve(address,amount,c){
  const t=new E.Contract(address,TOKEN_ABI,c.signer),allowance=await t.allowance(c.me,c.C.REWARDS);
  if(allowance>=amount)return;
  if(allowance>0n){notify('Reset the previous allowance in your wallet.');await ctx.waitMined(await t.approve(c.C.REWARDS,0),'reward-allowance-reset',token);await check(c);}
  notify('Approve exactly '+fmt(amount)+(address.toLowerCase()===c.C.USDT.toLowerCase()?' USDT':' tokens')+' for the rewards contract.');await ctx.waitMined(await t.approve(c.C.REWARDS,amount),'reward-approval',token);await check(c);
 }
 async function check(c){await ctx.verifyWallet();if(ctx.get(token).me!==c.me||ctx.get(token).C.REWARDS!==c.C.REWARDS)throw Error('Wallet or rewards configuration changed. Review again.');}
 async function action(kind){
  const c=ctx.get(token),d=data;if(acting||loading||c.busy||c.pendingHash||!vault||!d)return;if(!c.me){ctx.openWallet();return;}
  let amount,duration;
  try{
   if(isHiddenToken(d.token)&&['stake','fund'].includes(kind))throw Error('This token is hidden. Only withdrawals, claims and eligible refunds remain available.');
   if(d.owner!==c.me||Date.now()-d.readAt>90000)throw Error('Balance snapshot changed or expired. Refresh before continuing.');
   if(kind==='stake'||kind==='withdraw')amount=parseAmount($('#rw-'+(kind==='stake'?'deposit':'withdraw')).value);
   if(kind==='fund'){const input=fundingInput($('#rw-budget').value,$('#rw-days').value);amount=input.budget;duration=input.duration;}
   if(kind==='stake'&&amount>d.balance)throw Error('Insufficient token balance.');if(kind==='withdraw'&&amount>d.staked)throw Error('Amount exceeds your deposit.');if(kind==='fund'&&amount>d.usdtBalance)throw Error('Insufficient USDT balance.');
   acting=true;ctx.setBusy(true);controls();await check(c);const writer=new E.Contract(c.C.REWARDS,REWARD_ABI,c.signer);
   if(kind==='stake')await approve(d.token,amount,c);if(kind==='fund')await approve(c.C.USDT,amount,c);
   await check(c);let method,args;
   if(kind==='fund'){
    const fresh=await vault.getPool(d.token),now=await c.rpc.getBlock('latest');if((BigInt(now.timestamp)<fresh.finish)!==d.active)throw Error('Campaign state changed. Approval completed; refresh and review funding again.');
    method=d.active?'topUp':'fund';args=d.active?[d.token,amount]:[d.token,amount,duration];
   }else{method=kind==='refund'?'refundIdle':kind;args=amount!==undefined?[d.token,amount]:[d.token];}
   notify('Confirm '+(kind==='fund'?fmt(amount)+' USDT funding'+(d.active?' until the existing deadline':' for '+duration/86400+' days'):kind==='claim'?'USDT claim':kind==='refund'?'unused-emission refund':fmt(amount)+' '+d.symbol+' '+kind)+' in your wallet.');
   await writer[method].staticCall(...args);const gasLimit=rewardGasLimit(await writer[method].estimateGas(...args));await check(c);
   const tx=await writer[method](...args,{gasLimit});await ctx.waitMined(tx,'rewards-'+method,d.token);
   ctx.status('Rewards transaction confirmed: '+method,tx.hash);notify('Confirmed: '+method+'.');
   if(kind==='fund'){try{localStorage.removeItem(intentKey(c,d.token));}catch{}}
  }catch(e){notify(ctx.errorText(e));ctx.status(ctx.errorText(e),ctx.get(token).pendingHash||undefined);}
  finally{if(acting){acting=false;ctx.setBusy(false);await refresh({message:false});}controls();}
 }
 const intentKey=(c,t)=>'anything:reward-intent:'+c.C.CHAIN_ID+':'+c.me.toLowerCase()+':'+t.toLowerCase();
 async function open(address,intent){if(ctx.get(token).busy)return;token=address||ctx.get(token).selected||token;options();dialog.showModal();await refresh();const c=ctx.get(token);let saved=intent;try{saved||=JSON.parse(localStorage.getItem(intentKey(c,token))||'null')}catch{}if(saved){$('#rw-budget').value=saved.amount;$('#rw-days').value=String(saved.days);notify('Token created. Complete the USDT funding to start rewards.');}}
 $('#rw-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(acting)e.preventDefault();});
 $('#rw-token').onchange=()=>{token=$('#rw-token').value;refresh();};$('#rw-load').onclick=()=>{if(!E.isAddress($('#rw-address').value.trim()))return notify('Enter a valid BNB token contract address.');token=E.getAddress($('#rw-address').value.trim());options(true);refresh();};
 $('#rw-connect').onclick=ctx.openWallet;$('#rw-refresh').onclick=()=>refresh();
 $('#rw-max-deposit').onclick=()=>{$('#rw-deposit').value=fmt(data.balance);};$('#rw-max-withdraw').onclick=()=>{$('#rw-withdraw').value=fmt(data.staked);};
 for(const [id,kind] of [['rw-stake','stake'],['rw-unstake','withdraw'],['rw-claim','claim'],['rw-fund','fund'],['rw-refund','refund']])$('#'+id).onclick=()=>action(kind);
 $('#fk-rewards').onclick=()=>open();$('#selected-rewards').onclick=()=>open();
 const timer=setInterval(()=>{if(dialog.open)refresh({message:false});},15000);window.addEventListener('pagehide',()=>clearInterval(timer));
 return{open,changed:()=>{if(dialog.open&&!acting)refresh();},
  async launchIntent(){if(!$('#f-rewards').checked)return null;const c=ctx.get('new');await contract('new');if(!vault)throw Error('Rewards are not activated.');const {budget}=fundingInput($('#f-reward-budget').value,$('#f-reward-days').value);if(await new E.Contract(c.C.USDT,TOKEN_ABI,c.rpc).balanceOf(c.me)<budget)throw Error('Insufficient USDT for the reward budget.');return{amount:fmt(budget),days:Number($('#f-reward-days').value)};},
  created(address,intent){if(!intent)return;try{localStorage.setItem(intentKey(ctx.get(token),address),JSON.stringify(intent));}catch{}void open(address,intent);},
  ready(){const enabled=!!ctx.get('new').C.REWARDS;$('#f-rewards').disabled=!enabled;$('#f-rewards-note').textContent=enabled?'After token creation, approve and fund the USDT campaign. These are separate transactions; rewards start only after funding confirms.':'Rewards for new Flap launches are awaiting activation. Existing campaigns remain available.';}
 };
}

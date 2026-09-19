import {ASSETS,BY_ID,CATEGORIES} from './lib/assets.mjs';
import {filterAssets,hasReferencePrice} from './lib/catalog.mjs';
import {priceText} from './lib/quotes.mjs';
import {escapeHTML as esc} from './lib/market.mjs';
const $=s=>document.querySelector(s),quotes=new Map(),pending=new Map();
let page=0,category='All',search='',options,choiceSignature='';
export function assetQuote(id){return quotes.get(id)?.data;}
export function displayQuote(q){return priceText(q);}
export async function requestQuotes(ids){
 const now=Date.now(),requested=[...new Set(ids)],wanted=requested.filter(id=>{const a=BY_ID.get(id);return a&&['yahoo','coinbase','bigmac'].includes(a.provider)&&!pending.has(id)&&(!quotes.has(id)||quotes.get(id).until<now);});
 const batches=[];for(let start=0;start<wanted.length;start+=8)batches.push(wanted.slice(start,start+8));
 // Two source batches at a time, with duplicate requests sharing the same promise.
 const jobs=[];let previous=[Promise.resolve(),Promise.resolve()];
 for(let i=0;i<batches.length;i++){
  const batch=batches[i],job=previous[i%2].then(async()=>{
   try{
    const r=await fetch('/api/quotes?ids='+batch.join(','),{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Quote service unavailable');
    const body=await r.json();for(const id of batch){const q=(body.quotes||[]).find(q=>q.id===id)||{id,status:'unavailable'};quotes.set(id,{data:q,until:Date.now()+(q.value?300000:60000)});}
   }catch{for(const id of batch)quotes.set(id,{data:{id,status:'unavailable'},until:Date.now()+60000});}
   finally{batch.forEach(id=>pending.delete(id));renderCatalogue();options?.onQuotes?.();}
  });
  previous[i%2]=job;batch.forEach(id=>pending.set(id,job));jobs.push(job);
 }
 if(wanted.length)renderCatalogue();
 await Promise.all([...jobs,...requested.map(id=>pending.get(id)).filter(Boolean)]);
}
function qFor(a){return a.provider==='oracle'?options?.oracleQuote?.(a):assetQuote(a.id);}
const available=()=>ASSETS.filter(a=>hasReferencePrice(a,qFor(a)));
export async function requirePricedReference(id){
 const a=BY_ID.get(id);if(!a)throw Error('Choose an asset with an available price.');
 await requestQuotes([id]);if(!hasReferencePrice(a,qFor(a)))throw Error('The reference price is unavailable or stale. Choose another priced asset or try again later.');
 return a;
}
export function referenceText(id){
 const a=BY_ID.get(id);if(!a)return 'Choose an asset with an available price. References do not set the token’s trading price.';
 const q=qFor(a),text=hasReferencePrice(a,q)?priceText(q)+' / '+a.unit+' · '+q.status+' · '+q.asOf:'Price unavailable; this reference cannot be used for a new launch right now';
 return a.name+' · '+text+'. '+a.note+' Reference only; it does not set the token’s trading price.';
}
export function updateReferenceDetail(id){
 const a=BY_ID.get(id),box=$('#feed-detail');box.replaceChildren(document.createTextNode(referenceText(id)));
 if(a?.url){const link=document.createElement('a');link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=' View source ↗';box.append(link);}
 if(a)void requestQuotes([id]);
}
function renderChoices(priced){
 if(options?.isBusy?.())return;
 const signature=priced.map(a=>a.id).join(',');if(signature===choiceSignature)return;choiceSignature=signature;
 const select=$('#f-feed'),previous=select.value;select.replaceChildren(new Option(priced.length?'Choose a priced asset':'Checking price sources…',''));
 for(const category of CATEGORIES.slice(1)){const list=priced.filter(a=>a.category===category);if(!list.length)continue;const group=document.createElement('optgroup');group.label=category;for(const a of list)group.append(new Option(a.name,a.id));select.append(group);}
 select.value=priced.some(a=>a.id===previous)?previous:'';if(previous!==select.value)options?.onSelectionChange?.();
}
function renderCatalogue(){
 if(!options)return;
 const priced=available(),ids=new Set(priced.map(a=>a.id)),all=filterAssets({category,search}).filter(a=>ids.has(a.id)),max=Math.max(1,Math.ceil(all.length/8));
 page=Math.min(page,max-1);const list=all.slice(page*8,page*8+8);
 $('#catalog-total').textContent=String(priced.length);$('#catalog-count').textContent=all.length+' PRICED REFERENCES';
 $('#catalog-status').textContent=pending.size?'Checking prices… '+pending.size+' references remaining.':'Only references with available prices are shown. Sources and dates are listed below.';
 $('#catalog-page').textContent=(page+1)+' / '+max;$('#catalog-prev').disabled=page===0;$('#catalog-next').disabled=page>=max-1;
 const markup=list.map(a=>{const q=qFor(a);return '<article class="asset-card"><div class="asset-top"><span>'+esc(a.category)+'</span><span>'+esc(a.symbol||a.unit)+'</span></div><h3>'+esc(a.name)+'</h3><div class="asset-price">'+esc(priceText(q))+' <small>/ '+esc(a.unit)+'</small></div><div class="asset-date">'+esc(q.status+' · '+q.asOf)+'</div><p>'+esc(a.note)+'</p><div class="asset-actions"><button type="button" data-asset="'+a.id+'">Create token ↗</button><a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">Source ↗</a></div></article>';}).join('')||'<p class="catalog-empty">'+(pending.size?'Checking available prices…':'No priced references match this filter. Try another search or refresh prices.')+'</p>';
 const box=$('#asset-grid');if(box.innerHTML!==markup){box.innerHTML=markup;box.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>{if(!options.isBusy?.())options.onChoose(b.dataset.asset);});}
 renderChoices(priced);
}
export function refreshCatalogue(){renderCatalogue();void requestQuotes(ASSETS.map(a=>a.id));}
export function initCatalogue(opts){
 options=opts;$('#catalog-categories').innerHTML=CATEGORIES.map((c,i)=>'<button type="button" aria-pressed="'+!i+'" data-category="'+c+'">'+c+'</button>').join('');
 $('#catalog-categories').querySelectorAll('button').forEach(b=>b.onclick=()=>{category=b.dataset.category;page=0;$('#catalog-categories').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderCatalogue();});
 $('#asset-search').oninput=e=>{search=e.target.value;page=0;renderCatalogue();};
 $('#catalog-prev').onclick=()=>{page--;renderCatalogue();};$('#catalog-next').onclick=()=>{page++;renderCatalogue();};
 $('#catalog-refresh').onclick=()=>{for(const [id,q] of quotes)if(q.until<Date.now())quotes.delete(id);refreshCatalogue();};
 // Populate the initial placeholder even when no quotes have loaded yet.
 choiceSignature='initial';refreshCatalogue();
}

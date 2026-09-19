import {ASSETS,BY_ID,CATEGORIES} from './lib/assets.mjs';
import {MEME_THEMES} from './lib/meme-assets.mjs';
import {filterAssets} from './lib/catalog.mjs';
import {priceText} from './lib/quotes.mjs';
import {escapeHTML as esc} from './lib/market.mjs';
const $=s=>document.querySelector(s),quotes=new Map(),pending=new Set();
let page=0,category='All',theme='All themes',search='',options,lastSurprise='';
export function assetQuote(id){return quotes.get(id)?.data}
export function displayQuote(q){return priceText(q)}
export async function requestQuotes(ids){
  const now=Date.now(),wanted=[...new Set(ids)].filter(id=>{const a=BY_ID.get(id);return a&&['yahoo','coinbase','bigmac'].includes(a.provider)&&!pending.has(id)&&(!quotes.has(id)||quotes.get(id).until<now)});
  if(!wanted.length)return;
  wanted.forEach(id=>pending.add(id));
  for(let start=0;start<wanted.length;start+=8){
    const batch=wanted.slice(start,start+8);
    try{
      const r=await fetch('/api/quotes?ids='+batch.join(','),{signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Error('Quote service unavailable');
      const body=await r.json();
      for(const q of body.quotes||[])if(batch.includes(q.id))quotes.set(q.id,{data:q,until:Date.now()+(q.value?300000:60000)});
    }catch{for(const id of batch)quotes.set(id,{data:{id,status:'unavailable'},until:Date.now()+60000})}
    finally{batch.forEach(id=>pending.delete(id))}
  }
  renderCards(false);options?.onQuotes?.();
}
function qFor(a){return a.provider==='oracle'?options?.oracleQuote?.(a):assetQuote(a.id)}
export function referenceText(id){
  const a=BY_ID.get(id);if(!a)return 'No asset reference.';
  if(a.provider==='meme')return a.name+' · Fictional meme reference, with no underlying market quote. '+a.note+' Your token trades independently on its bonding curve.';
  const q=qFor(a),quote=q?.value!==undefined?priceText(q)+' / '+a.unit+' · '+q.status+' · '+q.asOf:'No verified quote available';
  return a.name+' · '+quote+'. '+a.note+' Reference only; it does not set the token’s trading price.';
}
export function updateReferenceDetail(id){
  const a=BY_ID.get(id),box=$('#feed-detail');box.replaceChildren(document.createTextNode(referenceText(id)));
  if(a?.url){const link=document.createElement('a');link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=' View source ↗';box.append(link)}
  if(a)requestQuotes([id]);
}
function renderCards(fetchPrices=true){
  if(!options)return;
  const all=filterAssets({category,theme,search}),max=Math.max(1,Math.ceil(all.length/8));
  page=Math.min(page,max-1);const list=all.slice(page*8,page*8+8);
  $('#catalog-count').textContent=all.length+' REFERENCES';$('#catalog-page').textContent=(page+1)+' / '+max;
  $('#catalog-prev').disabled=page===0;$('#catalog-next').disabled=page>=max-1;
  const markup=list.map(a=>{
    const q=qFor(a),has=Number.isFinite(q?.value),meme=a.provider==='meme',automated=['yahoo','coinbase','bigmac'].includes(a.provider);
    const price=meme?'MEME':has?esc(priceText(q)):'—';
    const state=meme?'Fictional reference · no market quote':has?q.status+' · '+q.asOf:automated&&!q?'Fetching quote…':a.provider==='oracle'&&!q?'Reading on-chain reference…':'No verified quote';
    return '<article class="asset-card'+(meme?' meme-card':'')+'"><div class="asset-top"><span>'+esc(meme?a.theme:a.category)+'</span><span>'+esc(meme?'MEME':a.symbol||a.unit)+'</span></div><h3>'+esc(a.name)+'</h3><div class="asset-price">'+price+' <small>/ '+esc(a.unit)+'</small></div><div class="asset-date">'+esc(state)+'</div><p>'+esc(a.note)+'</p><div class="asset-actions"><button type="button" data-asset="'+a.id+'">Create token ↗</button>'+(a.url?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">Source ↗</a>':'<span>'+(meme?'Meme concept':'Concept')+'</span>')+'</div></article>';
  }).join('')||'<p class="catalog-empty">No matching references. Try another search or create your own.</p>';
  // Preserve focus while periodic price refreshes leave these cards unchanged.
  const box=$('#asset-grid');
  if(box.innerHTML!==markup){box.innerHTML=markup;box.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>{if(!options.isBusy?.())options.onChoose(b.dataset.asset)})}
  if(fetchPrices)requestQuotes(list.map(a=>a.id));
}
export function refreshCatalogue(){renderCards()}
export function initCatalogue(opts){
  options=opts;$('#catalog-total').textContent=String(ASSETS.length);
  $('#catalog-categories').innerHTML=CATEGORIES.map((c,i)=>'<button type="button" aria-pressed="'+!i+'" data-category="'+c+'">'+c+'</button>').join('');
  $('#catalog-categories').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    category=b.dataset.category;page=0;theme='All themes';$('#meme-theme').value=theme;$('#meme-theme-wrap').hidden=category!=='Memes';
    $('#catalog-categories').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderCards();
  });
  for(const name of ['All themes',...MEME_THEMES]){const o=document.createElement('option');o.value=o.textContent=name;$('#meme-theme').append(o)}
  $('#meme-theme').onchange=e=>{theme=e.target.value;page=0;renderCards()};
  $('#catalog-surprise').onclick=()=>{
    if(options.isBusy?.())return;
    const ideas=ASSETS.filter(a=>a.provider==='meme'&&a.id!==lastSurprise&&(category!=='Memes'||theme==='All themes'||a.theme===theme));
    const pick=ideas[Math.floor(Math.random()*ideas.length)];if(pick){lastSurprise=pick.id;options.onChoose(pick.id)}
  };
  $('#asset-search').oninput=e=>{search=e.target.value;page=0;renderCards()};
  $('#catalog-prev').onclick=()=>{page--;renderCards()};$('#catalog-next').onclick=()=>{page++;renderCards()};
  const select=$('#f-feed');select.replaceChildren();
  const none=document.createElement('option');none.value='';none.textContent='No reference · pure meme';select.append(none);
  const addGroup=(label,list)=>{const group=document.createElement('optgroup');group.label=label;for(const asset of list){const opt=document.createElement('option');opt.value=asset.id;opt.textContent=asset.name;group.append(opt)}select.append(group)};
  for(const category of CATEGORIES.slice(1)){
    if(category==='Memes')for(const theme of MEME_THEMES)addGroup('Memes · '+theme,ASSETS.filter(a=>a.category==='Memes'&&a.theme===theme));
    else addGroup(category,ASSETS.filter(a=>a.category===category));
  }
  renderCards();
}

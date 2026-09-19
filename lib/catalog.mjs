import {ASSETS,BY_ID} from './assets.mjs';
export const FEATURED=['gold','bigmac-usa','btc','aapl','silver','eth','nvda','oil-wti'];
export const normalizeSearch=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function filterAssets({category='All',search=''}={}){
 const terms=normalizeSearch(search.trim()).split(/\s+/).filter(Boolean);
 const ordered=category==='All'&&!terms.length?[...FEATURED.map(id=>BY_ID.get(id)),...ASSETS.filter(a=>!FEATURED.includes(a.id))]:ASSETS;
 return ordered.filter(a=>{
  if(category!=='All'&&a.category!==category)return false;
  const haystack=normalizeSearch([a.name,a.symbol,a.category,a.unit,a.provider==='bigmac'?'McDonalds burger':''].filter(Boolean).join(' '));
  return terms.every(term=>haystack.includes(term));
 });
}
// A reference appears in the catalogue/launch picker only while its source has a usable quote.
// Published surveys keep their date; an INDEX/LARP oracle value is never a market quote.
export function hasReferencePrice(asset,quote,now=Date.now()){
 if(!asset||!['yahoo','coinbase','bigmac','oracle'].includes(asset.provider)||!quote||!Number.isFinite(quote.value)||quote.value<=0)return false;
 if(!/^([A-Z]{3}|POINTS)$/.test(quote.currency||'')||/STALE|INVALID|NO PRICE|unavailable/i.test(quote.status||''))return false;
 if(asset.provider==='oracle'&&quote.tier!==0)return false;
 const asOf=Date.parse(quote.asOf);if(!Number.isFinite(asOf)||asOf>now+60000)return false;
 const age=asset.provider==='bigmac'?400*86400000:asset.provider==='coinbase'?600000:asset.provider==='oracle'?3600000:7*86400000;
 return now-asOf<=age;
}

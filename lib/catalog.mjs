import {ASSETS,BY_ID} from './assets.mjs';
export const FEATURED=['meme-fly-share','meme-cloud-rent','bigmac-usa','meme-npc-salary','meme-bottled-air','gold','meme-luck-reserve','meme-mosquito-ipo'];
export const normalizeSearch=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function filterAssets({category='All',theme='All themes',search=''}={}){
  const terms=normalizeSearch(search.trim()).split(/\s+/).filter(Boolean);
  const ordered=category==='All'&&!terms.length?[...FEATURED.map(id=>BY_ID.get(id)),...ASSETS.filter(a=>!FEATURED.includes(a.id))]:ASSETS;
  return ordered.filter(a=>{
    if(category!=='All'&&a.category!==category)return false;
    if(category==='Memes'&&theme!=='All themes'&&a.theme!==theme)return false;
    const haystack=normalizeSearch([a.name,a.symbol,a.category,a.unit,a.theme,a.aliases,a.provider==='bigmac'?'McDonalds burger':'',['charizard','pikachu'].includes(a.id)?'Pokemon Pokémon':'',a.id==='cocaine-index'?'кокаин кокаина':''].filter(Boolean).join(' '));
    return terms.every(term=>haystack.includes(term));
  });
}

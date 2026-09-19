export const PROFILE_PREFIX='anything:profile:v1:';
export const MAX_AVATAR_BYTES=2048;
const bytes=s=>new TextEncoder().encode(s).length;
export function normalizeX(value=''){
 const raw=value.trim();if(!raw)return '';
 let handle=raw.replace(/^@/,'');
 if(/^https:\/\//i.test(raw)){
  let url;try{url=new URL(raw);}catch{throw Error('Enter an X username or profile URL.');}
  if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(url.hostname)||url.username||url.password||url.port||url.search||url.hash)throw Error('Use an x.com profile link or @username.');
  handle=url.pathname.replace(/^\//,'').replace(/\/$/,'');
 }
 if(!/^[a-zA-Z0-9_]{1,15}$/.test(handle)||['home','explore','search','intent','share','settings','i'].includes(handle.toLowerCase()))throw Error('Enter a valid X profile username, up to 15 characters.');
 return 'https://x.com/'+handle;
}
export function normalizeProfile(value={}){
 const description=String(value.description||'').trim();
 if(description.length>400||bytes(description)>1600)throw Error('Description must be at most 400 characters.');
 const avatar=String(value.avatar||'');
 if(avatar){
  if(!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar))throw Error('Choose a PNG, JPEG or WebP image to prepare the avatar.');
  let decoded;try{decoded=atob(avatar.split(',')[1]);}catch{throw Error('Invalid avatar image.');}
  if(decoded.length>MAX_AVATAR_BYTES||decoded.slice(0,4)!=='RIFF'||decoded.slice(8,12)!=='WEBP')throw Error('Avatar must be a prepared WebP image under 2 KB.');
 }
 return {description,x:normalizeX(String(value.x||'')),avatar};
}
export function encodeProfile(reference,profile={}){
 if(!/^[a-z0-9-]{1,64}$/.test(reference))throw Error('Invalid reference identifier.');
 const clean=normalizeProfile(profile);
 if(!clean.description&&!clean.x&&!clean.avatar)return 'anything:'+reference;
 return PROFILE_PREFIX+JSON.stringify({ref:reference,...clean});
}
export function decodeProfile(key){
 if(typeof key!=='string'||bytes(key)>6500||!key.startsWith(PROFILE_PREFIX))return null;
 try{const raw=JSON.parse(key.slice(PROFILE_PREFIX.length));if(!raw||typeof raw!=='object'||! /^[a-z0-9-]{1,64}$/.test(raw.ref))return null;return {ref:raw.ref,...normalizeProfile(raw)};}catch{return null;}
}
export function referenceId(key){return decodeProfile(key)?.ref||(typeof key==='string'&&/^anything:[a-z0-9-]{1,64}$/.test(key)?key.slice(9):'');}

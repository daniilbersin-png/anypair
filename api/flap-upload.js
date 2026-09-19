import {normalizeProfile} from '../lib/profile.mjs';
import {BY_ID} from '../lib/assets.mjs';
import {ipfsURL} from '../lib/flap.mjs';

export function createUploadHandler(upstream=fetch){return async function handler(req,res){
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.statusCode=405;res.setHeader('Allow','POST');return res.end(JSON.stringify({error:'POST required'}));}
 let profile,creator,token,reference;
 try{
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('JSON required.');
  let body=req.body;if(!body){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)throw Error('Request too large.');}body=JSON.parse(raw);}
  if(JSON.stringify(body).length>12000)throw Error('Request too large.');
  ({creator,token,reference}=body);
  if(!/^0x[\da-f]{40}$/i.test(creator||'')||!/^0x[\da-f]{40}$/i.test(token||''))throw Error('Invalid wallet or token address.');
  if(!BY_ID.has(reference))throw Error('Choose a supported reference.');
  profile=normalizeProfile(body.profile);if(!profile.avatar)throw Error('Choose a token avatar before launching.');
 }catch(e){res.statusCode=400;return res.end(JSON.stringify({error:e.message}));}
 try{
  const asset=BY_ID.get(reference),form=new FormData();
  const meta={creator,description:[profile.description,'Asset reference: '+asset.name+' ('+asset.unit+'). Reference only; no price peg or redemption guarantee.'].filter(Boolean).join('\n\n'),twitter:profile.x||null,telegram:null,website:'https://anythingpad.tech/?token='+token+'&reference='+reference};
  form.append('operations',JSON.stringify({query:'mutation Create($file: Upload!, $meta: MetadataInput!) { create(file: $file, meta: $meta) }',variables:{file:null,meta}}));
  form.append('map',JSON.stringify({'0':['variables.file']}));form.append('0',new Blob([Buffer.from(profile.avatar.split(',')[1],'base64')],{type:'image/webp'}),'avatar.webp');
  const response=await upstream('https://funcs.flap.sh/api/upload',{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Metadata upload unavailable. Try again later.');
  const data=await response.json();const cid=data?.data?.create;ipfsURL(cid);
  res.end(JSON.stringify({cid,url:ipfsURL(cid)}));
 }catch{res.statusCode=502;res.end(JSON.stringify({error:'Flap could not store the token profile. No token transaction has been sent. Please try again.'}));}
};}
export default createUploadHandler();

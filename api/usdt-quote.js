let cached,until=0;
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json');
 if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');return res.end(JSON.stringify({error:'GET required'}));}
 try{
  if(!cached||until<Date.now()){
   const r=await fetch('https://api.coinbase.com/v2/prices/USDT-USD/spot',{signal:AbortSignal.timeout(6500)});
   if(!r.ok)throw Error('Quote unavailable');const data=await r.json(),value=Number(data?.data?.amount);
   if(!Number.isFinite(value)||value<=0||data.data.currency!=='USD')throw Error('Invalid quote');
   cached={value,currency:'USD',asOf:new Date().toISOString(),source:'Coinbase USDT/USD spot',url:'https://api.coinbase.com/v2/prices/USDT-USD/spot'};until=Date.now()+60000;
  }
  res.setHeader('Cache-Control','public, s-maxage=60');res.end(JSON.stringify(cached));
 }catch{res.statusCode=503;res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'USDT/USD quote unavailable'}));}
}

export const WAD=10n**18n;
export function parseAmount(value,{allowZero=false}={}){
 const s=String(value).trim();
 if(!/^\d{1,30}(\.\d{1,18})?$/.test(s))throw Error('Enter a decimal amount with up to 18 decimal places.');
 const [whole,part='']=s.split('.'),n=BigInt(whole)*WAD+BigInt(part.padEnd(18,'0'));
 if(!allowZero&&n===0n)throw Error('Amount must be greater than zero.');
 return n;
}
export function minOutput(quote,bps){if(quote<=0n)throw Error('No executable quote.');if(!Number.isInteger(bps)||bps<1||bps>500)throw Error('Invalid slippage tolerance.');const min=quote*BigInt(10000-bps)/10000n;if(min===0n)throw Error('Amount is too small.');return min;}
export function curveQuote({side,input,virtualBnb,realBnb,tokenReserve,feeBps}){
 if(input<=0n||virtualBnb<=0n||tokenReserve<=0n)throw Error('This curve cannot quote the order.');
 const x=virtualBnb+realBnb,y=tokenReserve;
 if(side==='buy'){const fee=input*feeBps/10000n,net=input-fee,out=y*net/(x+net);return{out,fee,impact:out?Math.max(0,(Number(net)*Number(y)/(Number(out)*Number(x))-1)*100):0};}
 if(side!=='sell')throw Error('Invalid side');
 const gross=x*input/(y+input);if(gross>realBnb)throw Error('The curve has insufficient BNB reserves for this sale.');
 const fee=gross*feeBps/10000n;return{out:gross-fee,fee,impact:Math.max(0,(1-Number(gross)*Number(y)/(Number(input)*Number(x)))*100)};
}
export function feedStatus(updatedAt,maxStale,nowSeconds=Math.floor(Date.now()/1000)){
 if(!updatedAt)return 'NO PRICE';if(updatedAt>nowSeconds)return 'INVALID TIME';return nowSeconds-updatedAt>maxStale?'STALE':'RECENT';
}
export function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function validTokenFields(name,symbol){if(!name.trim()||new TextEncoder().encode(name.trim()).length>64)throw Error('Name is required (maximum 64 UTF-8 bytes).');if(!/^[A-Z0-9]{2,10}$/.test(symbol))throw Error('Ticker must contain 2–10 letters or digits.');return{name:name.trim(),symbol};}

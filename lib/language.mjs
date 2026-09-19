// Keep application messages in English even when a wallet/browser uses another language.
export function englishError(error,fallback='The request could not be completed. Check your wallet or connection and try again.'){
 const code=error?.code??error?.info?.error?.code??error?.error?.code;
 if(code==='ACTION_REJECTED'||code===4001)return 'Request declined in wallet.';
 if(code===-32002)return 'A wallet request is already open. Complete it in your wallet.';
 if(code==='INSUFFICIENT_FUNDS')return 'Insufficient BNB for the amount and network fee.';
 if(code==='NETWORK_ERROR')return 'Network connection failed. Check your connection and try again.';
 if(code==='TIMEOUT')return 'The request timed out. Check its status before trying again.';
 const message=String(error?.reason||error?.shortMessage||error?.message||error||'');
 return !message||message==='[object Object]'||/\p{Script=Cyrillic}/u.test(message)?fallback:message.slice(0,350);
}
export function englishDateTime(date){
 return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(date);
}

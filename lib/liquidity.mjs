const BPS=10000n;
export function minimumPoolBuy(threshold,feeBps){
 if(threshold<=0n||feeBps<0n||feeBps>=BPS)throw Error('Liquidity settings unavailable.');
 return (threshold*BPS+BPS-feeBps-1n)/(BPS-feeBps);
}
export function launchLiquidity(firstBuy,threshold,feeBps){
 minimumPoolBuy(threshold,feeBps);
 if(firstBuy<0n)throw Error('BNB amount cannot be negative.');
 const fee=firstBuy*feeBps/BPS,net=firstBuy-fee;
 return {fee,net,createsPool:net>=threshold};
}

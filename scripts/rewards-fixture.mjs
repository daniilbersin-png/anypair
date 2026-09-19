import fs from 'node:fs';import {Contract,ContractFactory,parseEther,ZeroHash,keccak256,AbiCoder,toBeHex} from 'ethers';
export const artifact=(file,name)=>JSON.parse(fs.readFileSync(new URL('../contracts/out/'+file+'/'+name+'.json',import.meta.url)));
export async function deployFixture(f,{livePad}={}){
 const p=f.provider,signer=await p.getSigner(),owner=await signer.getAddress();
 const deploy=async(file,name,args=[])=>{const a=artifact(file,name),c=await new ContractFactory(a.abi,a.bytecode.object,signer).deploy(...args);await c.waitForDeployment();return c;};
 let pad,oracle,router;
 if(livePad)pad=new Contract(livePad,artifact('AnyPairLaunchpad.sol','AnyPairLaunchpad').abi,signer);
 else{oracle=await deploy('PriceOracle.sol','PriceOracle',[owner]);router=await deploy('RewardsQA.sol','RewardsQARouter');pad=await deploy('AnyPairLaunchpad.sol','AnyPairLaunchpad',[oracle.target,router.target,owner,owner]);await(await pad.setConfig(owner,0,parseEther('20'),parseEther('0.05'))).wait();}
 const usd=livePad?new Contract('0x55d398326f99059ff775485246999027b3197955',artifact('RewardsQA.sol','RewardsQAUSD').abi,signer):await deploy('RewardsQA.sol','RewardsQAUSD');
 const vault=await deploy('AnyPairRewards.sol','AnyPairRewards',[pad.target,usd.target]);
 if(livePad){
  // Alter the disposable local fork only, never the remote BNB state.
  let found=false;
  for(let slot=0;slot<16;slot++){
   const snap=await p.send('evm_snapshot',[]),key=keccak256(AbiCoder.defaultAbiCoder().encode(['address','uint256'],[owner,slot]));
   await p.send('anvil_setStorageAt',[usd.target,key,toBeHex(parseEther('10000'),32)]);
   if(await usd.balanceOf(owner)===parseEther('10000')){found=true;break;}
   await p.send('evm_revert',[snap]);
  }
  if(!found)throw Error('Could not provision local fork USDT balance.');
 }else await(await usd.mint(owner,parseEther('10000'))).wait();
 const n=await pad.pairsCount();await(await pad.createPair('Rewards QA Burger','QABURGER','anything:bigmac-usa',ZeroHash,parseEther('0.005'),{value:parseEther('0.005')})).wait();
 const token=new Contract(await pad.allPairs(n),artifact('AnyPairToken.sol','AnyPairToken').abi,signer);
 return {pad,oracle,router,usd,vault,token,signer,owner};
}

import assert from 'node:assert/strict';import fs from 'node:fs';import * as E from 'ethers';
import {createFork,PAD} from './fork.mjs';import {deployFixture} from './rewards-fixture.mjs';import {verifyRewards,rewardGasLimit} from '../lib/rewards.mjs';
const live=process.argv.includes('--fork'),f=await createFork({localOnly:!live}),W=E.parseEther;
try{
 const {pad,usd,vault,token,signer,owner}=await deployFixture(f,{livePad:live?PAD:undefined}),p=f.provider;
 const send=async(method,args)=>{const gasLimit=rewardGasLimit(await method.estimateGas(...args));await p.send('evm_increaseTime',[1]);await p.send('evm_mine',[]);return(await method(...args,{gasLimit})).wait();};
 const art=JSON.parse(fs.readFileSync(new URL('../assets/rewards-artifact.json',import.meta.url)));
 await verifyRewards(E,p,{LAUNCHPAD:pad.target,USDT:usd.target,REWARDS:vault.target},art);
 await assert.rejects(verifyRewards(E,p,{LAUNCHPAD:token.target,USDT:usd.target,REWARDS:vault.target},art));
 const holder=await p.getSigner(1),holderAddress=await holder.getAddress(),amount=W('1000');
 await(await token.transfer(holderAddress,amount)).wait();
 await(await usd.approve(vault.target,W('100'))).wait();await send(vault.fund,[token.target,W('100'),86400]);assert.equal(await usd.allowance(owner,vault.target),0n);
 await(await token.connect(holder).approve(vault.target,amount)).wait();await send(vault.connect(holder).stake,[token.target,amount]);assert.equal(await vault.staked(token.target,holderAddress),amount);assert.equal(await token.allowance(holderAddress,vault.target),0n);
 await p.send('evm_increaseTime',[43200]);await p.send('evm_mine',[]);
 const owed=await vault.earned(token.target,holderAddress);assert.ok(owed>W('49')&&owed<=W('51'));
 await(await usd.approve(vault.target,W('50'))).wait();const oldFinish=(await vault.getPool(token.target)).finish;await send(vault.topUp,[token.target,W('50')]);assert.equal((await vault.getPool(token.target)).finish,oldFinish);
 await assert.rejects(vault.connect(holder).fund.staticCall(token.target,W('1'),86400));await assert.rejects(vault.refundIdle.staticCall(token.target));
 await send(vault.connect(holder).claim,[token.target]);assert.ok(await usd.balanceOf(holderAddress)>=owed);
 await send(vault.connect(holder).withdraw,[token.target,amount]);assert.equal(await token.balanceOf(holderAddress),amount);assert.equal(await vault.staked(token.target,holderAddress),0n);
 await p.send('evm_increaseTime',[86400]);await p.send('evm_mine',[]);await send(vault.refundIdle,[token.target]);
 const leftover=await vault.earned(token.target,holderAddress);if(leftover>0n)await send(vault.connect(holder).claim,[token.target]);
 assert.equal(await usd.balanceOf(vault.target),await vault.reservedRewards());assert.ok(await vault.reservedRewards()<1000000000000n);
 await assert.rejects(vault.connect(holder).claim.staticCall(token.target));
 console.log(JSON.stringify({result:'PASS',network:live?'LOCAL MAINNET FORK':'DISPOSABLE LOCAL CHAIN',forkBlock:f.blockNumber,checks:[live?'actual BSC USDT contract on local fork':'local test USDT','tested deployment bytecode','immutable address mismatch rejected','real launchpad registration','creator-only funding','gas cushion across elapsed-time checkpoints','exact USDT approval','holder deposits','time-weighted accrual','top-up preserves deadline','USDT claim','full principal withdrawal','idle emission refund','reserve conservation','double claim rejected'],realMainnetTransactions:0}));
}finally{await f.close();}

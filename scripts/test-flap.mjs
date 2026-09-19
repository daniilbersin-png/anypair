// Disposable BNB fork only. No mainnet signatures or transactions.
import * as E from 'ethers';import fs from 'node:fs';import assert from 'node:assert/strict';
import {createFork} from './fork.mjs';import {FLAP_PORTAL,FLAP_ABI,findFlapSalt} from '../lib/flap.mjs';
const artifact=name=>JSON.parse(fs.readFileSync('contracts/out/AnythingFlapGateway.sol/'+name+'.json'));
const reward=JSON.parse(fs.readFileSync('contracts/out/AnyPairRewards.sol/AnyPairRewards.json'));
const usdArtifact=JSON.parse(fs.readFileSync('contracts/out/RewardsQA.sol/RewardsQAUSD.json'));
const f=await createFork();
try{
 const p=f.provider,owner=await p.getSigner(),other=await p.getSigner(1),creator=await owner.getAddress();
 const a=artifact('AnythingFlapDeployment'),usd=await new E.ContractFactory(usdArtifact.abi,usdArtifact.bytecode.object,owner).deploy();await usd.waitForDeployment();
 const deployment=await new E.ContractFactory(a.abi,a.bytecode.object,owner).deploy(FLAP_PORTAL,usd.target);await deployment.waitForDeployment();
 const gateway=new E.Contract(await deployment.gateway(),artifact('AnythingFlapGateway').abi,owner),vault=new E.Contract(await deployment.rewards(),reward.abi,owner),portal=new E.Contract(FLAP_PORTAL,FLAP_ABI,owner);
 const meta='bafkreieepx7lh6zcpqsneo2jdeqmcgxjg7facam34w5ezh4myajjauuc24';
 const fee=await portal.SALT_LOCK_FEE();const salt=await findFlapSalt(E);const tx=await gateway.createPair('Anything Flap QA','AFQA','anything:bigmac-usa',meta,salt.salt,salt.address,0,{value:fee});const receipt=await tx.wait();
 const token=new E.Contract(salt.address,['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function metaURI() view returns(string)','function totalSupply() view returns(uint256)'],owner);
 assert.equal(await token.metaURI(),meta);assert.equal((await gateway.getPair(token.target)).creator,creator);assert.equal(await gateway.pairsCount(),1n);
 await assert.rejects(gateway.createPair.staticCall('No Fee','NO','anything:gold',meta,E.ZeroHash,E.ZeroAddress,0,{value:0}));
 await assert.rejects(gateway.createPair.staticCall('Duplicate','DUP','anything:gold',meta,salt.salt,salt.address,0,{value:fee}));
 assert.equal(await gateway.pairsCount(),1n);
 assert.equal((await gateway.getPair(await other.getAddress())).token,E.ZeroAddress);
 const state=await portal.getTokenV8Safe(token.target);assert.equal(state.status,1n);assert.equal(state.reserve,0n);assert.ok(state.price>0n);assert.ok(state.r>0n);assert.equal(state.buyTaxRate,0n);assert.equal(state.sellTaxRate,0n);
 const created=receipt.logs.filter(l=>l.address.toLowerCase()===FLAP_PORTAL.toLowerCase()).map(l=>{try{return portal.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='TokenCreated');assert.equal(created.args.token,token.target);assert.equal(created.args.creator,gateway.target);
 const buy=E.parseEther('0.01'),quote=await portal.quoteExactInput.staticCall([E.ZeroAddress,token.target,buy]);await(await portal.swapExactInput([E.ZeroAddress,token.target,buy,quote*99n/100n,'0x'],{value:buy})).wait();const balance=await token.balanceOf(creator);assert.ok(balance>0n);
 await(await usd.mint(creator,E.parseEther('100'))).wait();await(await usd.approve(vault.target,E.parseEther('100'))).wait();await(await vault.fund(token.target,E.parseEther('100'),86400)).wait();await assert.rejects(vault.connect(other).fund(token.target,1,86400));
 await(await token.approve(vault.target,balance/2n)).wait();await(await vault.stake(token.target,balance/2n)).wait();await p.send('evm_increaseTime',[3600]);await p.send('evm_mine',[]);assert.ok(await vault.earned(token.target,creator)>0n);
 await(await vault.claim(token.target,{gasLimit:400000})).wait();assert.ok(await usd.balanceOf(creator)>0n);await(await vault.withdraw(token.target,balance/2n,{gasLimit:400000})).wait();assert.equal(await token.balanceOf(creator),balance);
 const sell=balance/2n;await(await token.approve(FLAP_PORTAL,sell)).wait();const output=await portal.quoteExactInput.staticCall([token.target,E.ZeroAddress,sell]);assert.ok(output>0n);await(await portal.swapExactInput([token.target,E.ZeroAddress,sell,output*99n/100n,'0x'])).wait();
 const salt2=await findFlapSalt(E);await assert.rejects(gateway.createPair.staticCall('Wrong address','WRONG','anything:gold',meta,salt2.salt,E.ZeroAddress,0,{value:fee}));assert.equal((await portal.getSaltLock(salt2.salt)).locker,E.ZeroAddress);await(await gateway.createPair('First Buy QA','BUYQA','anything:gold',meta,salt2.salt,salt2.address,buy,{value:buy+fee})).wait();const token2=new E.Contract(salt2.address,token.interface,owner);assert.ok(await token2.balanceOf(creator)>0n);assert.equal(await token2.balanceOf(gateway.target),0n);assert.equal(await p.getBalance(gateway.target),0n);
 console.log(JSON.stringify({result:'PASS',forkBlock:f.blockNumber,portalVersion:await portal.version(),gateway:gateway.target,rewards:vault.target,launchGas:String(receipt.gasUsed),virtualBNB:E.formatEther(state.r),checks:['zero-first-buy Flap launch','Flap TokenCreated event','correct creator registry','missing fee and duplicate launch rejection','unexpected token address reverts atomically','unknown token is not registered','metadata CID','nonzero curve price without reserve','buy and sell','creator-only USDT funding','stake, accrue, claim and withdraw','first buy forwarded to creator','no retained BNB or token balance'],realMainnetTransactions:0}));
}finally{await f.close()}

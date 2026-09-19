import {ContractFactory,Contract,parseEther} from 'ethers';import fs from 'node:fs';import {FLAP_PORTAL} from '../lib/flap.mjs';
export async function deployFlapFixture(f){
 const signer=await f.provider.getSigner(),owner=await signer.getAddress(),a=JSON.parse(fs.readFileSync('assets/flap-artifacts.json')),u=JSON.parse(fs.readFileSync('contracts/out/RewardsQA.sol/RewardsQAUSD.json'));
 const usd=await new ContractFactory(u.abi,u.bytecode.object,signer).deploy();await usd.waitForDeployment();await(await usd.mint(owner,parseEther('10000'))).wait();
 const deployment=await new ContractFactory(a.deployment.abi,a.deployment.bytecode,signer).deploy(FLAP_PORTAL,usd.target);await deployment.waitForDeployment();
 return {usd,gateway:new Contract(await deployment.gateway(),a.gateway.abi,signer),vault:new Contract(await deployment.rewards(),a.rewards.abi,signer)};
}

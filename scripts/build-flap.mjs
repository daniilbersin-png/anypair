import fs from 'node:fs';import {keccak256} from 'ethers';
const read=(file,name)=>{const a=JSON.parse(fs.readFileSync('contracts/out/'+file+'.sol/'+name+'.json'));return {abi:a.abi,bytecode:a.bytecode.object,deployedBytecode:a.deployedBytecode.object,immutableReferences:a.deployedBytecode.immutableReferences,bytecodeHash:keccak256(a.bytecode.object)};};
fs.writeFileSync('assets/flap-artifacts.json',JSON.stringify({deployment:read('AnythingFlapGateway','AnythingFlapDeployment'),gateway:read('AnythingFlapGateway','AnythingFlapGateway'),rewards:read('AnyPairRewards','AnyPairRewards')}));
console.log('Exported Flap gateway and rewards deployment build.');

import fs from 'node:fs';
import {keccak256} from 'ethers';
const file=new URL('../contracts/out/AnyPairRewards.sol/AnyPairRewards.json',import.meta.url),a=JSON.parse(fs.readFileSync(file));
const out={contract:'AnyPairRewards',version:'AnythingRewards/1',compiler:'0.8.24',abi:a.abi,bytecode:a.bytecode.object,deployedBytecode:a.deployedBytecode.object,immutableReferences:a.deployedBytecode.immutableReferences,bytecodeHash:keccak256(a.bytecode.object)};
fs.writeFileSync(new URL('../assets/rewards-artifact.json',import.meta.url),JSON.stringify(out));
console.log('Exported tested rewards bytecode: '+out.bytecodeHash);

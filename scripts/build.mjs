import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'public');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const name of ['index.html','app.js','app.css','catalog.js','catalog.css','config.js','assets','lib'])fs.cpSync(path.join(root,name),path.join(out,name),{recursive:true});
console.log('Built static terminal. No server keys or test RPC are included.');

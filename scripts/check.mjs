import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const dir of ['public','scripts','tests'])for(const f of fs.readdirSync(dir,{recursive:true}))if(/\.(mjs|js)$/.test(f))execFileSync(process.execPath,['--check',dir+'/'+f],{stdio:'inherit'});
console.log('JavaScript syntax checks passed');

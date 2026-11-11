import { readFile } from 'node:fs/promises';
import { createGame } from './harness.mjs';
import { runSuite } from './suite.mjs';
const html=await readFile('index.html','utf8');
const results=await runSuite(createGame,html);
for(const r of results) console.log((r.pass?'PASS ':'FAIL ')+r.name+(r.error?' — '+r.error:''));
console.log(results.filter(r=>r.pass).length+'/'+results.length+' passed');
if(results.some(r=>!r.pass))process.exitCode=1;

import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
const liveUrl='https://hall-pass-git.pages.dev/';
const sourceCommit='f69e6424ae149ba8c110f0f4fe834d555270234d';
const expected=await readFile('index.html','utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
await mkdir('test-results',{recursive:true});
const evidence={sourceCommit,expectedSha256:sha(expected),attempts:[],browsers:[]};
let matches=false;
for(let attempt=0;attempt<30;attempt++){
 try{
  const r=await fetch(liveUrl,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  const body=await r.text();
  const result={at:new Date().toISOString(),status:r.status,sha256:sha(body),matches:body===expected,frameOptions:r.headers.get('x-frame-options'),csp:r.headers.get('content-security-policy')};
  evidence.attempts.push(result);console.log('LIVE VERSION '+JSON.stringify(result));
  if(r.status===200&&result.matches){matches=true;break;}
 }catch(e){evidence.attempts.push({error:e.message});console.log('LIVE FETCH '+e.message);}
 await new Promise(r=>setTimeout(r,10000));
}
await writeFile('test-results/live-verification.json',JSON.stringify(evidence,null,2));
assert.ok(matches,'Production must match the merged index.html byte for byte');
for(const [name,type] of Object.entries({chromium,firefox,webkit})){
 let browser;
 try{
  browser=await type.launch({headless:true});
  for(const touch of [false,true]){
   const label=name+' '+(touch?'touch':'desktop');
   const result={label,checks:[],errors:[]};evidence.browsers.push(result);
   const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1280,height:900},hasTouch:touch});
   try{
    await context.addInitScript(()=>{
     if(!localStorage.getItem('live-check-setup')){
      localStorage.setItem('hallpass.tut','1');
      localStorage.setItem('hallpass.opts',JSON.stringify({haptics:false,vol:0}));
      localStorage.setItem('hallpass.insane','1');
      localStorage.setItem('live-check-setup','1');
     }
    });
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',e=>result.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&m.text().includes('frame error'))result.errors.push(m.text());});
    const response=await page.goto(liveUrl,{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(response.status(),200);
    assert.equal(sha(await response.text()),sha(expected),'browser document matches merged source');
    await page.waitForFunction(()=>window.HallPassDebug?.state==='title');
    const run=code=>page.evaluate(code=>{const d=window.HallPassDebug;return eval(code);},code);
    const state=s=>page.waitForFunction(s=>window.HallPassDebug.state===s,s);
    const click=async(x,y)=>{
     await page.locator('#screen').scrollIntoViewIfNeeded();
     const box=await page.locator('#screen').boundingBox();
     const position={x:box.width*x/512,y:box.height*y/288};
     await page.locator('#screen')[touch?'tap':'click']({position});
    };
    const confirm=()=>touch?click(256,100):page.keyboard.press('Enter');
    await confirm();await state('card');await page.waitForTimeout(800);await confirm();await state('play');
    result.checks.push('Live boot and real input start');
    if(!touch){
     const x=await run('d.pos.x');
     await page.keyboard.down('ArrowRight');await page.waitForTimeout(250);await page.keyboard.up('ArrowRight');
     assert.ok(await run('d.pos.x')>x,'right key moves player');
     await page.keyboard.down('a');await page.keyboard.down('ArrowLeft');await page.keyboard.up('a');
     assert.equal(await run('d.held.left'),true);await page.keyboard.up('ArrowLeft');
     await page.keyboard.down('e');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
     assert.equal(await run('d.held.grab'),false);await page.keyboard.up('e');
     result.checks.push('Movement, independent key aliases, blur release');
    }else{
     if(!await page.locator('#pad').evaluate(e=>e.classList.contains('on')))await page.locator('#padBtn').click();
     await page.locator('[data-key="jump"]').tap();
     result.checks.push('Real touch jump input');
    }
    await run('d.completeNow()');await state('clear');
    const paid=await run('({score:d.score,clout:d.clout,lives:d.lives})');
    await page.keyboard.press('h');await state('title');
    assert.equal(await run('d.prog.save.phase'),'clear');
    await page.reload({waitUntil:'domcontentloaded'});await state('title');
    await page.waitForTimeout(100);await click(256,236);await state('clear');
    assert.deepEqual(await run('({score:d.score,clout:d.clout,lives:d.lives})'),paid);
    result.checks.push('Saved clear survives reload and Continue without duplicated rewards');
    await page.waitForTimeout(1100);await confirm();await state('pickcard');
    await page.keyboard.press('ArrowRight');
    const offer=await run('d.deal');
    await page.keyboard.press('h');await state('title');
    assert.equal(await run('d.prog.save.dealSel'),1);
    await page.reload({waitUntil:'domcontentloaded'});await state('title');
    await page.waitForTimeout(100);await click(256,236);await state('pickcard');
    assert.deepEqual(await run('d.deal'),offer);
    if(touch){
     if(!await page.locator('#pad').evaluate(e=>e.classList.contains('on')))await page.locator('#padBtn').click();
     await page.locator('[data-key="jump"]').tap();
    }else await page.keyboard.press('Enter');
    await state('card');
    assert.equal(await run('d.stage'),1);
    assert.ok((await run('d.mods')).includes(offer[1]));
    result.checks.push('Card offer and selection survive reload; real input applies selected card');
    for(const teacher of [false,true]){
     await run('d.setSide('+teacher+');d.setMode("classic");d.setDiff(1);d.begin2(7);d.play();d.safe(true)');
     const cp=await run('d.checks.at(-1)');assert.ok(cp,'Period 8 checkpoint exists');
     await run('d.put('+cp.tx+','+(cp.row-2)+');d.simFrames(20,{})');
     await page.waitForFunction(()=>window.HallPassDebug.checkAt!==null);
     await page.keyboard.press('h');await state('title');
     const saved=await run('d.prog.save');
     await click(256,236);await state('card');
     assert.equal(await run('d.stage'),7);
     assert.equal(await run('d.checkAt.n'),saved.check.n);
     assert.equal(await run('d.pinkGate.open'),true);
     assert.equal(await run('d.meta.runT'),saved.period.runT);
     assert.equal(await run('d.dmg'),saved.period.damage);
     assert.equal(await run('d.ghost.rec'),0);
     result.checks.push((teacher?'Teacher':'Student')+' live Period 8 checkpoint and return path');
    }
    await run('d.setSide(false);d.setMode("classic");d.setDiff(0);d.begin();d.play()');
    await page.waitForTimeout(100);
    const pixels=await page.locator('#screen').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0));
    assert.ok(pixels);
    await page.screenshot({path:'test-results/live-'+name+(touch?'-touch':'-desktop')+'.png',fullPage:true});
    assert.deepEqual(result.errors,[]);
    result.pass=true;console.log('PASS LIVE '+label+' '+JSON.stringify(result.checks));
   }catch(e){result.pass=false;result.failure=e.stack;console.log('FAIL LIVE '+label+' '+e.stack);}
   finally{await context.close();await writeFile('test-results/live-verification.json',JSON.stringify(evidence,null,2));}
  }
 }catch(e){evidence.browsers.push({label:name,pass:false,failure:e.stack});console.log('FAIL LAUNCH '+name+' '+e.stack);}
 finally{if(browser)await browser.close();}
}
evidence.completedAt=new Date().toISOString();
await writeFile('test-results/live-verification.json',JSON.stringify(evidence,null,2));
assert.equal(evidence.browsers.length,6);
assert.ok(evidence.browsers.every(r=>r.pass),'All live browser checks must pass');
console.log('VERIFIED LIVE '+JSON.stringify({url:liveUrl,sourceCommit,sha256:sha(expected),browsers:6,at:evidence.completedAt}));

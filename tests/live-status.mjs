import {chromium,firefox,webkit} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const expected=await readFile('index.html','utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const url='https://hall-pass-git.pages.dev/';
const result={at:new Date().toISOString(),expectedSha256:sha(expected),sourceCommit:'f69e6424ae149ba8c110f0f4fe834d555270234d',responses:[],browsers:[]};
await mkdir('test-results',{recursive:true});
for(const path of ['', '?verify='+Date.now(), 'index.html?verify='+Date.now()]){
 try{
  const r=await fetch(url+path,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});const body=await r.text();
  const d={url:url+path,status:r.status,sha256:sha(body),matchesMerged:body===expected,build:body.match(/const BUILD = ([^;]+);/)?.[1],headers:Object.fromEntries([...r.headers].filter(([k])=>['etag','last-modified','cf-cache-status','age','server','cf-ray','cache-control'].includes(k)))};
  result.responses.push(d);console.log('PUBLIC VERSION '+JSON.stringify(d));
 }catch(e){result.responses.push({url:url+path,error:e.message});}
}
for(const [name,type] of Object.entries({chromium,firefox,webkit})){
 let browser;
 try{
  browser=await type.launch({headless:true});
  for(const touch of [false,true]){
   const errors=[];const r={browser:name,touch};result.browsers.push(r);
   const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1280,height:900},hasTouch:touch});
   try{
    await context.addInitScript(()=>{localStorage.setItem('hallpass.tut','1');localStorage.setItem('hallpass.opts',JSON.stringify({haptics:false,vol:0}));});
    const page=await context.newPage();page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('frame error'))errors.push(m.text());});
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});assert.equal(response.status(),200);
    r.sha256=sha(await response.text());r.matchesMerged=r.sha256===sha(expected);
    await page.waitForFunction(()=>window.HallPassDebug?.state==='title');
    const confirm=async()=>{
     if(touch){const b=await page.locator('#screen').boundingBox();await page.locator('#screen').tap({position:{x:b.width/2,y:b.height*100/288}});}
     else await page.keyboard.press('Enter');
    };
    await confirm();await page.waitForFunction(()=>window.HallPassDebug.state==='card');
    await page.waitForTimeout(800);await confirm();await page.waitForFunction(()=>window.HallPassDebug.state==='play');
    if(!touch){
     const x=await page.evaluate(()=>window.HallPassDebug.pos.x);
     await page.keyboard.down('ArrowRight');await page.waitForTimeout(250);await page.keyboard.up('ArrowRight');
     assert.ok(await page.evaluate(()=>window.HallPassDebug.pos.x)>x);
    }else{
     if(!await page.locator('#pad').evaluate(e=>e.classList.contains('on')))await page.locator('#padBtn').click();
     await page.locator('[data-key="jump"]').tap();
    }
    assert.deepEqual(errors,[]);r.pass=true;
    await page.screenshot({path:'test-results/current-'+name+(touch?'-touch':'-desktop')+'.png',fullPage:true});
    console.log('LIVE SMOKE '+JSON.stringify(r));
   }catch(e){r.pass=false;r.error=e.stack;console.log('LIVE SMOKE '+JSON.stringify(r));}
   finally{await context.close();}
  }
 }catch(e){result.browsers.push({browser:name,pass:false,error:e.message});}
 finally{if(browser)await browser.close();}
}
result.completedAt=new Date().toISOString();
await writeFile('test-results/current-production.json',JSON.stringify(result,null,2));
console.log('PRODUCTION DIAGNOSIS '+JSON.stringify(result));
assert.ok(result.responses.every(r=>r.status===200));
assert.equal(result.browsers.length,6);
assert.ok(result.browsers.every(r=>r.pass));

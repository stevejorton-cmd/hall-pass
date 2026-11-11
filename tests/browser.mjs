import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium, firefox, webkit } from 'playwright';

const html=await readFile('index.html','utf8');
const instrumented=html.replace('/* ---------- boot ---------- */','window.__test = code => eval(code);\n/* ---------- boot ---------- */');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/test'?instrumented:html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const failures=[];
await mkdir('test-results',{recursive:true});
try {
 for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
  let browser;
  try {
   browser=await engine.launch();
   for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,...(name!=='firefox'?{isMobile:mobile}:{})});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error'&&m.text().includes('frame error'))errors.push(m.text());});
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());
    await page.goto(url+'/test');
    await page.waitForFunction(()=>window.HallPassDebug?.state==='title');
    const run=code=>page.evaluate(c=>window.__test(c),code);
    await run("OPTS.haptics=false;insaneKey=true;audio.setMuted(true)");
    if(!mobile){
     await page.keyboard.down('a');await page.keyboard.down('ArrowLeft');await page.keyboard.up('a');
     assert.equal(await run('held.left'),true);await page.keyboard.up('ArrowLeft');
     await page.keyboard.down('e');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
     assert.equal(await run('held.grab'),false);await page.keyboard.up('e');
    }else{
     await run("setPad(true);state='pickcard';deal=MODS.slice(0,3).map(m=>m.id);dealSel=1;");
     const chosen=await run('deal[1]');
     await page.locator('[data-key="jump"]').tap();
     assert.equal(await run('mods.has('+JSON.stringify(chosen)+')'),true);
    }
    for(const teacher of [false,true]){
     await run('TEACHER='+teacher);
     for(let d=0;d<4;d++)for(let p=0;p<9;p++){
      await run("MODE='classic';setDiff("+d+");loadStage("+p+");state='play';paused=false;for(let n=0;n<20;n++)update();draw();");
      assert.equal(await run('Number.isFinite(player.x)&&Number.isFinite(player.y)'),true);
     }
    }
    for(const mode of ['endless','boss']){
     for(let p=0;p<(mode==='boss'?4:9);p++){
      await run("MODE="+JSON.stringify(mode)+";wave="+p+";loadStage("+p+");state='play';for(let n=0;n<20;n++)update();draw();");
     }
    }
    await run("TEACHER=false;MODE='classic';setDiff(0);startGame();state='play';draw();");
    const pixels=await page.evaluate(()=>{const c=document.querySelector('canvas');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);});
    assert.equal(pixels,true,'canvas should contain rendered pixels');
    assert.deepEqual(errors,[],name+' browser errors');
    await page.screenshot({path:'test-results/'+name+(mobile?'-touch':'-desktop')+'.png',fullPage:true});
    console.log('PASS '+name+' '+(mobile?'touch 390x844':'desktop 1280x900')+'; 72 classic configurations + 13 special stages rendered');
    await context.close();
   }
  }catch(e){failures.push(name+': '+e.stack);}
  finally{if(browser)await browser.close();}
 }
 const sha=s=>createHash('sha256').update(s).digest('hex');
 try{
  const [live,base]=await Promise.all([
   fetch('https://hall-pass-git.pages.dev/').then(async r=>({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()})),
   fetch('https://raw.githubusercontent.com/stevejorton-cmd/hall-pass/248e476e2f5c83f3d614b7a53b1b413cde903fc3/index.html').then(r=>r.text())
  ]);
  const evidence={liveUrl:'https://hall-pass-git.pages.dev/',status:live.status,liveSha256:sha(live.body),baseSha256:sha(base),matchesPinnedBase:live.body===base,sourceCommit:'248e476e2f5c83f3d614b7a53b1b413cde903fc3',frameOptions:live.headers['x-frame-options']||null,csp:live.headers['content-security-policy']||null};
  console.log('LIVE COMPARISON '+JSON.stringify(evidence));await writeFile('test-results/live-version.json',JSON.stringify(evidence,null,2));
 }catch(e){console.log('LIVE COMPARISON unavailable: '+e.message);}
}finally{server.close();}
if(failures.length)throw Error(failures.join('\n'));

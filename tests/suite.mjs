export async function runSuite(createGame, html) {
 const results=[];
 const eq=(a,b,msg='')=>{if(a!==b)throw Error(msg+' expected '+JSON.stringify(b)+', got '+JSON.stringify(a));};
 const ok=(a,msg)=>{if(!a)throw Error(msg||'assertion failed');};
 const test=async(name,fn)=>{try{await fn(createGame(html));results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:String(e)});}};
 await test('keyboard aliases remain held until the final key releases',g=>{
  g.dispatch('keydown',{code:'KeyA'});g.dispatch('keydown',{code:'ArrowLeft'});g.dispatch('keyup',{code:'KeyA'});
  eq(g.debug.held.left,true);g.dispatch('keyup',{code:'ArrowLeft'});eq(g.debug.held.left,false);
 });
 await test('gamepad release does not cancel a held keyboard direction',g=>{
  g.dispatch('keydown',{code:'KeyD'});g.pads([{connected:true,axes:[1,0],buttons:[]}]);g.run('pollGamepad()');
  g.pads([{connected:true,axes:[0,0],buttons:[]}]);g.run('pollGamepad()');eq(g.debug.held.right,true);
 });
 await test('disconnected controller releases its input',g=>{
  g.pads([{connected:true,axes:[1,0],buttons:[]}]);g.run('pollGamepad()');eq(g.debug.held.right,true);
  g.pads([]);g.run('pollGamepad()');eq(g.debug.held.right,false);
 });
 await test('blur clears grab, use, action queues and mouse holds',g=>{
  g.run("state='play'");g.dispatch('keydown',{code:'KeyE'});g.dispatch('keydown',{code:'KeyV'});
  g.run('mouse.jump=true;jumpQueued=6;shoutQueued=9');g.dispatch('blur');
  ok(Object.values(g.debug.held).every(v=>!v));eq(g.run('pend.use || pend.bomb || pend.mog || mouse.jump || jumpQueued || shoutQueued'),0);
 });
 await test('hidden document releases input',g=>{
  g.dispatch('keydown',{code:'ArrowLeft'});g.env.document.hidden=true;g.dispatch('visibilitychange',{},'document');eq(g.debug.held.left,false);
 });
 await test('key autorepeat cannot repeatedly toggle pause',g=>{
  g.run("state='play'");g.dispatch('keydown',{code:'KeyP'});eq(g.run('paused'),true);
  g.dispatch('keydown',{code:'KeyP',repeat:true});eq(g.run('paused'),true);
 });
 await test('pad can select and take a modifier card',g=>{
  g.run("state='pickcard';deal=MODS.slice(0,3).map(m=>m.id);dealSel=0;");
  g.run("press('right',true)");eq(g.run('dealSel'),1);
  const chosen=g.run('deal[1]');g.run("press('jump',true)");ok(g.debug.mods.includes(chosen));eq(g.debug.stage,1);eq(g.run('anyKeyTick'),false);
 });
 await test('pad can navigate and buy from shop',g=>{
  g.run("overlay='shop';shopStock=['laces','batteries'];shopSel=0;clout=5000;");
  g.run("press('right',true)");eq(g.run('shopSel'),1);g.run("press('jump',true)");ok(g.debug.own.includes('batteries'));
 });
 await test('shop autorepeat only makes one purchase',g=>{
  g.run("overlay='shop';shopStock=['pass'];shopSel=0;change=500");
  g.dispatch('keydown',{code:'Enter'});const c=g.debug.change;
  g.dispatch('keydown',{code:'Enter',repeat:true});eq(g.debug.change,c);
 });
 await test('menu use input is not queued into the next run',g=>{
  g.dispatch('keydown',{code:'KeyV'});eq(g.run('pend.use'),false);
 });
 for(const mode of ['classic','speed'])for(const owned of [false,true])for(const death of ['combat','pit']){
  await test(mode+' '+death+' death '+(owned?'keeps paid laces word':'drops unprotected word'),g=>{
   g.run("MODE="+JSON.stringify(mode)+";"+(owned?"OWN.add('laces');":"")+"player.weapon=2;player.ammo=7;");
   if(death==='combat')g.run('player.die()');
   g.run('loseLife()');eq(g.run('player.weapon'),owned?2:0);eq(g.debug.ammo,owned?7:-1);
  });
 }
 await test('slow font fallback and late font resolution boot only once',async()=>{
  const g=createGame(html,{delayedFonts:true});eq(g.debug.state,'boot');
  g.timers.find(t=>t.ms===2500).fn();eq(g.raf.length,1);g.debug.begin();eq(g.debug.state,'card');
  g.resolveFonts();for(let i=0;i<8;i++)await Promise.resolve();
  eq(g.debug.state,'card');eq(g.raf.length,1);
 });
 await test('all periods and difficulties update and draw without an exception',g=>{
  g.run("insaneKey=true;OPTS.haptics=false;");
  for(let d=0;d<4;d++)for(let p=0;p<9;p++){
   g.debug.setDiff(d);g.debug.warp(p);
   g.run('for(let n=0;n<90;n++)update();draw();');
   ok(Number.isFinite(g.debug.pos.x),'finite position');
  }
 });
 await test('teacher mode, endless waves and boss rooms initialize and draw',g=>{
  g.run("TEACHER=true;OPTS.haptics=false;");
  for(const mode of ['classic','endless','boss']){
   g.debug.setMode(mode);
   for(let p=0;p<(mode==='boss'?4:9);p++){
    g.run('wave='+p);g.debug.warp(p);
    g.run('for(let n=0;n<60;n++)update();draw();');
   }
  }
 });

 for(const teacher of [false,true])await test((teacher?'teacher':'student')+' checkpoint restores quota, timer and damage, and opens return path',g=>{
  g.run("TEACHER="+teacher+";insaneKey=true;setDiff(1);MODE='classic';startGame(7);state='play';");
  g.run("const cps=level.ents.filter(e=>e instanceof Checkpoint);const cp=cps[cps.length-1];checkAt={stage:7,n:cps.length-1,x:cp.x,y:cp.foot-player.h};quotaDone=quotaNeed;periodFrames=9000;periodDmg=3;runT=13000;timeLeft=50;saveProgress();continueGame();");
  eq(g.run('quotaDone'),g.run('quotaNeed'));eq(g.run('periodFrames'),9000);eq(g.debug.dmg,3);
  eq(g.run('runT'),13000);eq(g.debug.time,50);eq(g.run('periodRecordValid'),true);
  eq(g.run('level.ents.find(e=>e instanceof PinkLock).open'),true);
  eq(g.run('ghostRec'),null);
 });
 await test('legacy checkpoint saves are playable without false records',g=>{
  g.run("setDiff(1);startGame(7);const cps=level.ents.filter(e=>e instanceof Checkpoint);const cp=cps[cps.length-1];const old={stage:7,score:200,stars:2,lives:3,mode:'classic',check:{stage:7,n:cps.length-1,x:cp.x,y:cp.foot-player.h}};startGame(7,old);");
  eq(g.run('periodRecordValid'),false);eq(g.run('level.ents.find(e=>e instanceof PinkLock).open'),true);
  g.run("state='play';periodFrames=1;periodDmg=0;completeLevel()");
  eq(g.run('bestTimes[7]'),0);eq(g.run("achSet.has('flawless')"),false);
  g.debug.retry();eq(g.run('periodRecordValid'),true);eq(g.run('checkAt'),null);
 });
 await test('normal respawn keeps the far-side checkpoint return path open',g=>{
  g.run("setDiff(1);startGame(7);const cps=level.ents.filter(e=>e instanceof Checkpoint);const cp=cps[cps.length-1];checkAt={stage:7,n:cps.length-1,x:cp.x,y:cp.foot-player.h};loadStage(7,false)");
  eq(g.run('level.ents.find(e=>e instanceof PinkLock).open'),true);
 });
 await test('invalid saved timing cannot create a partial-run record',g=>{
  g.run("startGame(0,{stage:0,score:0,stars:0,lives:3,check:{stage:0,n:0,x:32,y:400},period:{frames:'bad'}})");
  eq(g.run('periodRecordValid'),false);
 });

 return results;
}

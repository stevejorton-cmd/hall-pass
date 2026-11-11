export function createGame(html, options = {}) {
  const events = new Map(), timers = [], raf = [], storage = new Map(), elements = new Map();
  const listen = (target, name, fn) => { const key = target + ':' + name; if (!events.has(key)) events.set(key, []); events.get(key).push(fn); };
  const gradient = {addColorStop(){}};
  let canvas;
  const context = new Proxy({measureText(t){return {width:String(t).length*6};},createLinearGradient(){return gradient;},createRadialGradient(){return gradient;},getImageData(){return {data:new Uint8ClampedArray(4)};},get canvas(){return canvas;}}, {get(t,k){return k in t?t[k]:()=>{};}});
  function element(id='') {
    const classes = new Set();
    return {id, dataset:{},style:{setProperty(){},removeProperty(){}},classList:{add(...ks){ks.forEach(k=>classes.add(k));},remove(...ks){ks.forEach(k=>classes.delete(k));},contains(k){return classes.has(k);},toggle(k,on){if(on===undefined)on=!classes.has(k);if(on)classes.add(k);else classes.delete(k);return on;}},
      width:1024,height:576,offsetWidth:200,offsetHeight:100,clientWidth:1024,clientHeight:576,
      addEventListener(n,fn){listen(id,n,fn);},removeEventListener(){},getContext(){return context;},getBoundingClientRect(){return {left:0,top:0,width:1024,height:576};},querySelectorAll(){return [];},querySelector(){return element();},appendChild(){},append(){},setAttribute(){},removeAttribute(){},focus(){},blur(){},click(){},setPointerCapture(){},releasePointerCapture(){},toDataURL(){return '';},get textContent(){return this._text||'';},set textContent(v){this._text=v;}};
  }
  const document = {body:element('body'),documentElement:element('root'),hidden:false,visibilityState:'visible',createElement:()=>element(),getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},querySelectorAll(){return [];},querySelector(){return element();},addEventListener(n,fn){listen('document',n,fn);}};
  canvas = document.getElementById('game');
  const fontResolve=[];
  if(options.delayedFonts)document.fonts={load(){return new Promise(r=>fontResolve.push(r));}};
  const navigator = {userAgent:'test',getGamepads:()=>gamepads,vibrate(){},clipboard:{writeText(){return Promise.resolve();}}};
  let gamepads=[];
  const window = {document,navigator,innerWidth:1024,innerHeight:768,devicePixelRatio:1};
  window.self=window; window.top=window;
  const env={window,document,navigator,performance:{now:()=>0},location:{search:'',href:'https://test.invalid/'},screen:{width:1024,height:768,orientation:{}},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},addEventListener:(n,f)=>listen('window',n,f),requestAnimationFrame:fn=>raf.push(fn),cancelAnimationFrame(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},Image:class{constructor(){this.complete=true;this.width=16;this.height=16;}},Audio:class{constructor(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}setAttribute(){}},console:{log(){},warn(){},error(...args){throw new Error(args.join(' '));}}};
  Object.assign(window,env);
  const source = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  const injected=source.replace('/* ---------- boot ---------- */', 'window.__test = code => eval(code);\n/* ---------- boot ---------- */');
  new Function('env','with(env){'+injected+'}')(env);
  return {run:code=>window.__test(code), debug:window.HallPassDebug,env,timers,raf,storage,
    dispatch(name,props={},target='window'){const e={preventDefault(){},code:'',...props};for(const fn of events.get(target+':'+name)||[])fn(e);},
    pads(p){gamepads=p;},resolveFonts(){fontResolve.forEach(r=>r([]));}};
}

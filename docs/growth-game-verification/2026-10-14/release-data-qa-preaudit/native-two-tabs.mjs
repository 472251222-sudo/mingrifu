import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {createGameWorld} from '/Users/lyc/Desktop/明日复3.0/src/growth/game/world.js';
const require=createRequire(import.meta.url),{chromium}=require('/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const key='mingrifu-growth-game-v1',browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),runs=[];
for(let i=0;i<3;i++){
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 await ctx.addInitScript(({key,raw})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,raw);window.qaEvents=[];window.addEventListener('storage',e=>{if(e.key===key)window.qaEvents.push(e.newValue);});},{key,raw:JSON.stringify(createGameWorld())});
 try{
  const a=await ctx.newPage(),b=await ctx.newPage();await Promise.all([a.goto('http://127.0.0.1:5189/'),b.goto('http://127.0.0.1:5189/')]);
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true'&&!document.querySelector('.game-save-notice').textContent.includes('正在'))));
  await Promise.all([a,b].map(p=>p.getByRole('button',{name:'记录模拟努力',exact:true}).click()));
  await a.evaluate(()=>{window.hold=navigator.locks.request('mingrifu-growth-game-v1:save',{mode:'exclusive'},()=>new Promise(r=>window.release=r));});await a.waitForFunction(()=>typeof window.release==='function');
  await Promise.all([a.getByRole('button',{name:'10 分钟',exact:true}).click(),b.getByRole('button',{name:'25 分钟',exact:true}).click()]);
  const queue=await a.evaluate(()=>navigator.locks.query());await a.evaluate(()=>window.release());
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>document.querySelector('main').dataset.worldRevision==='1'||document.querySelector('.game-save-error')?.textContent.includes('另一页面'))));
  const get=p=>p.evaluate(key=>({main:{...document.querySelector('main').dataset},resources:document.querySelector('.game-resources').textContent,message:document.querySelector('.game-operation-message').textContent,error:document.querySelector('.game-save-error')?.textContent??null,raw:localStorage.getItem(key),events:window.qaEvents}),key);
  const sa=await get(a),sb=await get(b);runs.push({i,queue,a:sa,b:sb});console.log(JSON.stringify({i,a:sa.resources,ar:sa.main.readonly,b:sb.resources,br:sb.main.readonly,storageXP:JSON.parse(sa.raw).xp}));
  await a.screenshot({path:`/tmp/mingrifu-dataui-qa.u6Ge35/native-race-${i}-a.png`});await b.screenshot({path:`/tmp/mingrifu-dataui-qa.u6Ge35/native-race-${i}-b.png`});
 }finally{await ctx.close();}
}
await writeFile('/tmp/mingrifu-dataui-qa.u6Ge35/native-races.json',JSON.stringify({chrome:browser.version(),runs},null,2));await browser.close();

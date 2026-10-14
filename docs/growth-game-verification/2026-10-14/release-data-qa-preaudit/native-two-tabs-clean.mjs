import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';
import {createGameWorld} from '/Users/lyc/Desktop/明日复3.0/src/growth/game/world.js';
const require=createRequire(import.meta.url),{chromium}=require('/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const key='mingrifu-growth-game-v1',raw=JSON.stringify(createGameWorld()),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),runs=[];
const get=p=>p.evaluate(key=>({main:{...document.querySelector('main').dataset},resources:document.querySelector('.game-resources').textContent,message:document.querySelector('.game-operation-message').textContent,error:document.querySelector('.game-save-error')?.textContent??null,raw:localStorage.getItem(key),events:window.qaEvents}),key);
try{for(let i=0;i<3;i++){
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 await ctx.addInitScript(key=>{window.qaEvents=[];addEventListener('storage',e=>{if(e.key===key)window.qaEvents.push({at:Date.now(),newValue:e.newValue});});},key);
 try{
  const control=await ctx.newPage();await control.route('**/__qa-native-control',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>QA control</title>'}));await control.goto('http://127.0.0.1:5189/__qa-native-control');await control.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw});
  const a=await ctx.newPage(),b=await ctx.newPage();await Promise.all([a.goto('http://127.0.0.1:5189/'),b.goto('http://127.0.0.1:5189/')]);await Promise.all([a,b].map(p=>p.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true'&&document.querySelector('.game-save-notice').textContent==='已保存在此浏览器 · 美术候选')));
  const initialA=await get(a),initialB=await get(b);if(initialA.raw!==raw||initialB.raw!==raw)throw new Error('initial tokens differ');
  await Promise.all([a,b].map(p=>p.getByRole('button',{name:'记录模拟努力',exact:true}).click()));await a.getByRole('textbox',{name:'模拟努力标签',exact:true}).fill('A native');await b.getByRole('textbox',{name:'模拟努力标签',exact:true}).fill('B native');
  await a.evaluate(()=>{window.hold=navigator.locks.request('mingrifu-growth-game-v1:save',{mode:'exclusive'},()=>new Promise(r=>window.release=r));});await a.waitForFunction(()=>typeof window.release==='function');
  await b.getByRole('button',{name:'25 分钟',exact:true}).click();await a.getByRole('button',{name:'10 分钟',exact:true}).click();
  const queue=await a.evaluate(()=>navigator.locks.query());await a.evaluate(()=>window.release());await Promise.all([a,b].map(p=>p.waitForFunction(()=>document.querySelector('main').dataset.worldRevision==='1'||document.querySelector('.game-save-error')?.textContent.includes('另一页面'))));
  const sa=await get(a),sb=await get(b);const bothSucceeded=sa.main.readonly==='false'&&sb.main.readonly==='false';await a.screenshot({path:`/tmp/mingrifu-dataui-qa.u6Ge35/clean-race-${i}-a.png`});await b.screenshot({path:`/tmp/mingrifu-dataui-qa.u6Ge35/clean-race-${i}-b.png`});
  let reopened=null;if(bothSucceeded){await b.reload();await b.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true'&&document.querySelector('.game-save-notice').textContent==='已保存在此浏览器 · 美术候选');reopened=await get(b);await b.screenshot({path:`/tmp/mingrifu-dataui-qa.u6Ge35/clean-race-${i}-b-reopened.png`});}
  runs.push({i,initialTokensEqual:true,initialA,initialB,queue,a:sa,b:sb,bothSucceeded,reopened});console.log(JSON.stringify({i,bothSucceeded,a:sa.resources,ar:sa.main.readonly,b:sb.resources,br:sb.main.readonly,storedXP:JSON.parse(sa.raw).xp,reopened:reopened?.resources}));
 }finally{await ctx.close();}
}}finally{await writeFile('/tmp/mingrifu-dataui-qa.u6Ge35/native-clean-races.json',JSON.stringify({chrome:browser.version(),runs},null,2));await browser.close();}

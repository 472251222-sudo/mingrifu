import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const ctx=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true});
const key='mingrifu-growth-game-v1',out='/tmp/mingrifu-dataui-qa.u6Ge35';
await ctx.addInitScript(key=>{window.failWrites=false;window.saveAttempts=[];const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key){window.saveAttempts.push(v);if(window.failWrites)throw new DOMException('QA quota','QuotaExceededError');}return original.call(this,k,v);};},key);
const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5189/');await page.locator('canvas[data-ready="true"]').waitFor();await page.getByRole('button',{name:'记录模拟努力',exact:true}).waitFor();
 await page.screenshot({path:out+'/01-initial.png'});
 await page.getByRole('button',{name:'记录模拟努力',exact:true}).tap();
 await page.evaluate(()=>window.failWrites=true);
 await page.getByRole('button',{name:'50 分钟',exact:true}).tap();
 await page.getByRole('button',{name:'重试保存',exact:true}).waitFor();
 await page.screenshot({path:out+'/02-quota-effort-drawer.png'});
 const evidence=await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='重试保存');const r=b.getBoundingClientRect();return{main:document.querySelector('main').dataset,dialogOpen:!!document.querySelector('[role=dialog]'),error:document.querySelector('.game-save-error').textContent,resources:document.querySelector('.game-resources').textContent,retryBounds:{x:r.x,y:r.y,w:r.width,h:r.height},retryTopElement:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,200),attempts:window.saveAttempts.length};});
 try{await page.getByRole('button',{name:'重试保存',exact:true}).click({timeout:1500});evidence.retryClickable=true;}catch(e){evidence.retryClickable=false;evidence.clickFailure=e.message;}
 evidence.errors=errors;
 await writeFile(out+'/modal-probe.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await ctx.close();await browser.close();}

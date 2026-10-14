import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=fileURLToPath(new URL('./',import.meta.url)),prefix=`release-game-idempotency-${process.env.GAME_RUN_ID||Date.now()}`;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const c=await browser.newContext({viewport:{width:390,height:700}}),p=await c.newPage();
 await p.goto('http://127.0.0.1:5189/');await p.locator('main[data-saved="true"]').waitFor();await p.locator('canvas[data-ready="true"]').waitFor();
 await p.evaluate(()=>{window.originalUUID=crypto.randomUUID;window.originalISO=Date.prototype.toISOString;Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=> 'fixed-isolated-replay-event'});Date.prototype.toISOString=()=> '2026-10-14T00:00:00.000Z';});
 const submit=async()=>{await p.getByRole('button',{name:'记录模拟努力',exact:true}).click();await p.getByRole('button',{name:'10 分钟',exact:true}).click();await p.getByRole('dialog').waitFor({state:'hidden'});};
 await submit();await p.waitForFunction(()=>document.querySelector('[aria-label="永久XP"]').textContent==='10 XP');const before=await p.evaluate(()=>localStorage.getItem('mingrifu-growth-game-v1'));
 await submit();await p.waitForFunction(()=>document.querySelector('.game-operation-message').textContent.includes('没有重复奖励'));assert.equal(await p.evaluate(()=>localStorage.getItem('mingrifu-growth-game-v1')),before);
 const message=await p.locator('.game-operation-message').innerText();await p.evaluate(()=>{Object.defineProperty(crypto,'randomUUID',{configurable:true,value:window.originalUUID});Date.prototype.toISOString=window.originalISO;});
 await p.clock.install({time:new Date('2030-01-01T00:00:00Z')});await p.clock.fastForward(7*24*60*60*1000);assert.equal(await p.evaluate(()=>localStorage.getItem('mingrifu-growth-game-v1')),before);await p.reload();await p.locator('main[data-saved="true"]').waitFor();await p.locator('canvas[data-ready="true"]').waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('mingrifu-growth-game-v1')),before);assert.equal(await p.getByLabel('永久XP').innerText(),'10 XP');assert.equal(await p.getByLabel('可用BP').innerText(),'32 BP');
 await p.screenshot({path:`${output}${prefix}.png`,fullPage:true});const result={chrome:browser.version(),sameEventNoOp:true,feedback:message,virtualAbsenceDays:7,xp:10,bp:32,efforts:JSON.parse(before).efforts.length,rawUnchanged:true};await writeFile(`${output}${prefix}.json`,JSON.stringify(result,null,2));console.log(result);await c.close();
}finally{await browser.close();}

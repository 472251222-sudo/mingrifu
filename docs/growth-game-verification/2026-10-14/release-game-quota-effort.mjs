import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=fileURLToPath(new URL('./',import.meta.url)),prefix=`release-game-quota-${process.env.GAME_RUN_ID||Date.now()}`;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),result={};
try{
 const context=await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true});
 await context.addInitScript(()=>{window.quota=false;window.writeAttempts=[];const write=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='mingrifu-growth-game-v1'){window.writeAttempts.push(value);if(window.quota)throw new DOMException('isolated quota','QuotaExceededError');}return write.call(this,key,value);};});
 const page=await context.newPage();await page.goto('http://127.0.0.1:5189/');await page.locator('main[data-saved="true"]').waitFor();await page.locator('canvas[data-ready="true"]').waitFor();
 result.before=await page.evaluate(()=>localStorage.getItem('mingrifu-growth-game-v1'));
 await page.getByRole('button',{name:'记录模拟努力',exact:true}).click();await page.evaluate(()=>{window.quota=true;});await page.getByRole('button',{name:'50 分钟',exact:true}).click();await page.locator('.game-save-error').waitFor();
 result.afterFailure=await page.evaluate(()=>({raw:localStorage.getItem('mingrifu-growth-game-v1'),lastAttempt:window.writeAttempts.at(-1),bp:document.querySelector('[aria-label="可用BP"]').textContent,xp:document.querySelector('[aria-label="永久XP"]').textContent,notice:document.querySelector('.game-save-notice').textContent}));
 assert.equal(result.afterFailure.raw,result.before);assert.equal(result.afterFailure.xp,'0 XP');assert.equal(result.afterFailure.bp,'30 BP');
 const retry=page.getByRole('button',{name:'重试保存',exact:true});const b=await retry.boundingBox();result.retryHit=await page.evaluate(({x,y})=>({tag:document.elementFromPoint(x,y)?.tagName,text:document.elementFromPoint(x,y)?.textContent,disabled:document.elementFromPoint(x,y)?.disabled}),{x:b.x+b.width/2,y:b.y+b.height/2});
 await page.screenshot({path:`${output}${prefix}-failed.png`,fullPage:true});await page.evaluate(()=>{window.quota=false;});
 try{await retry.click({timeout:1000});result.retryReachable=true;}catch(error){result.retryReachable=false;result.retryError=error.message;}
 assert.equal(result.retryReachable,true,'saved effort recovery must remain reachable above any modal');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mingrifu-growth-game-v1')).xp===50);
 await page.waitForFunction(()=>document.querySelector('.game-operation-message').textContent.includes('自然成长 1 步'));
 result.afterRetry=await page.evaluate(()=>({world:JSON.parse(localStorage.getItem('mingrifu-growth-game-v1')),attempts:window.writeAttempts.slice(-2),message:document.querySelector('.game-operation-message').textContent}));
 assert.equal(result.afterRetry.world.bp,40);assert.equal(result.afterRetry.world.efforts.length,1);assert.equal(result.afterRetry.attempts[0],result.afterRetry.attempts[1]);
 await page.screenshot({path:`${output}${prefix}-retried.png`,fullPage:true});
 const raw=await page.evaluate(()=>localStorage.getItem('mingrifu-growth-game-v1'));await page.getByRole('button',{name:'记录模拟努力',exact:true}).click();await page.evaluate(()=>{window.quota=true;});await page.getByRole('button',{name:'25 分钟',exact:true}).click();await page.locator('.game-save-error').waitFor();await page.getByRole('button',{name:'取消未保存操作',exact:true}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('mingrifu-growth-game-v1')),raw);result.cancelPreserved=true;
 await context.close();
}finally{await writeFile(`${output}${prefix}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();}

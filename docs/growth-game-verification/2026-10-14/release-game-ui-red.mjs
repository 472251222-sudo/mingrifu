import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=fileURLToPath(new URL('./',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const context=await browser.newContext({viewport:{width:320,height:568}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:5189/');await page.locator('canvas[data-ready="true"]').waitFor();
 const observed={effortEntry:await page.getByRole('button',{name:'记录模拟努力',exact:true}).count(),expandEntry:await page.getByRole('button',{name:'扩张',exact:true}).count(),save:await page.evaluate(()=>localStorage.getItem('mingrifu-growth-game-v1')),notice:await page.locator('.game-temporary').innerText()};
 await writeFile(`${output}release-game-ui-red.json`,JSON.stringify(observed,null,2));await page.screenshot({path:`${output}release-game-ui-red.png`,fullPage:true});console.log(observed);
 assert.equal(observed.effortEntry,1,'real game UI must expose simulated effort');assert.equal(observed.expandEntry,1);assert.ok(observed.save);
}finally{await browser.close();}

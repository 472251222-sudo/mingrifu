import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=fileURLToPath(new URL('./',import.meta.url)),prefix=`game-002-browser-cache-${process.env.GAME_RUN_ID||Date.now()}`;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),results=[];
try{
  for(let round=1;round<=2;round++){
    const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
    await Promise.all(contexts.map(async(context,index)=>{
      const page=await context.newPage(),base=index?'http://127.0.0.1:5189/':'http://127.0.0.1:5191/',deps=[],errors=[];
      page.on('response',response=>{if(/\/deps\//.test(response.url()))deps.push({url:response.url(),status:response.status()});if(response.status()===504)errors.push({url:response.url(),status:504});});
      page.on('pageerror',error=>errors.push({message:error.message}));
      await page.goto(base);
      if(index){await page.locator('canvas[data-ready="true"]').waitFor();assert.equal(await page.title(),'明日复·我的世界');}
      else await page.waitForFunction(()=>document.querySelector('#root')?.textContent.length>20);
      await page.reload();
      if(index)await page.locator('canvas[data-ready="true"]').waitFor();else await page.waitForFunction(()=>document.querySelector('#root')?.textContent.length>20);
      assert.ok(deps.length>0);assert.ok(deps.every(response=>response.status===200));assert.deepEqual(errors,[]);
      assert.ok(deps.some(response=>index?response.url.includes('.vite-growth-game'):response.url.includes('/.vite/')));
      results.push({round,entry:index?'game':'V3',base,deps,errors});await context.close();
    }));
  }
  await writeFile(`${output}${prefix}.json`,JSON.stringify({chrome:browser.version(),results},null,2));console.log(JSON.stringify({chrome:browser.version(),results},null,2));
}finally{await browser.close();}

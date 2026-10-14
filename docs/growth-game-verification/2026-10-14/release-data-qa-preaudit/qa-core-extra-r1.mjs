import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output='/tmp/mingrifu-dataui-qa.u6Ge35/',prefix='qa-core-extra-r1';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),results=[];
const key='mingrifu-growth-game-v1';
const world=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function ready(page){await page.locator('canvas[data-ready="true"]').waitFor();await page.waitForFunction(()=>document.querySelector('main')?.dataset.saved==='true'&&document.querySelector('main')?.dataset.saveStatus==='ready');await settle(page);}
async function saved(page,check,arg){await page.waitForFunction(({code,arg,key})=>{const value=JSON.parse(localStorage.getItem(key));return value&&Function('value','arg',`return (${code})(value,arg)`)(value,arg)&&Number(document.querySelector('main').dataset.worldRevision)===value.revision;},{code:check.toString(),arg,key});await settle(page);}
async function tap(page,locator,mobile){await locator.scrollIntoViewIfNeeded();if(!mobile)return locator.click();const b=await locator.boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
const shot=(page,name)=>page.screenshot({path:`${output}${prefix}-${name}.png`,fullPage:true});
async function coordinate(page,x,y){await settle(page);return page.locator('canvas').evaluate((canvas,p)=>{const b=canvas.getBoundingClientRect(),s=Number(canvas.dataset.scale);return{x:b.left+(Number(canvas.dataset.originX)+p.x*s)*b.width/canvas.width,y:b.top+(Number(canvas.dataset.originY)+p.y*s)*b.height/canvas.height};},{x,y});}
async function cell(page,x,y,mobile){
 let p=await coordinate(page,(x+.5)*32,(y+.5)*32);
 const visible=()=>page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',p);
 if(!await visible()){
  while(Number(await page.locator('canvas').getAttribute('data-scale'))<2)await tap(page,page.getByRole('button',{name:'放大世界'}),mobile);
  p=await coordinate(page,(x+.5)*32,(y+.5)*32);const b=await page.locator('canvas').boundingBox(),start={x:b.x+b.width/2,y:b.y+b.height/2},dx=start.x-p.x,dy=start.y-p.y;
  if(mobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:7}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+dx,y:start.y+dy,id:7}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+dx,start.y+dy,{steps:4});await page.mouse.up();}
  await settle(page);p=await coordinate(page,(x+.5)*32,(y+.5)*32);assert.equal(await visible(),true,'use camera to expose target outside overlay controls');
 }
 if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);await settle(page);
}
async function clear(page,mobile){const b=page.getByRole('button',{name:'取消选择',exact:true});if(await b.isVisible())await tap(page,b,mobile);}
async function choose(page,name,mobile){await clear(page,mobile);await tap(page,page.getByRole('button',{name:'建造',exact:true}),mobile);await tap(page,page.getByRole('button',{name:`选择${name}`,exact:true}),mobile);assert.equal(await page.getByRole('dialog').count(),0);}
async function effort(page,amount,mobile){const count=(await world(page)).efforts.length;await clear(page,mobile);await tap(page,page.getByRole('button',{name:'记录模拟努力',exact:true}),mobile);await tap(page,page.getByRole('button',{name:`${amount} 分钟`,exact:true}),mobile);await saved(page,(value,arg)=>value.efforts.length===arg.count+1&&value.efforts.at(-1)?.minutes===arg.amount,{count,amount});await page.getByRole('dialog').waitFor({state:'hidden'});}
async function onScreen(page){const r=await page.evaluate(()=>{const c=document.querySelector('canvas').getBoundingClientRect(),a=document.querySelector('.game-actions').getBoundingClientRect();return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,mapHeight:c.height,actionBottom:a.bottom};});assert.ok(r.scrollWidth<=r.width&&r.scrollHeight<=r.height+1&&r.actionBottom<=r.height+1&&r.mapHeight>=120);return r;}
try{
 const context=await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true,locale:'zh-CN'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:5189/');await ready(page);const initial=await world(page);
  await choose(page,'林缘阔冠树',true);assert.match(await page.locator('.game-operation-message').innerText(),/120 XP/);assert.equal(await page.getByRole('button',{name:'确认建造',exact:true}).isDisabled(),true);await shot(page,'locked-tree');await tap(page,page.getByRole('button',{name:'取消',exact:true}),true);assert.deepEqual(await world(page),initial);
  for(let i=0;i<2;i++){await tap(page,page.getByRole('button',{name:'记录模拟努力',exact:true}),true);await page.getByLabel('自定义努力分钟').fill('150');await tap(page,page.getByRole('button',{name:'记录自定义努力',exact:true}),true);await saved(page,(v,n)=>v.xp===n,(i+1)*150);await page.getByRole('dialog').waitFor({state:'hidden'});}
  for(const [direction,coords] of [['西方','(-1,0)'],['北方','(0,-1)'],['东方','(1,0)']]){const before=await world(page);await tap(page,page.getByRole('button',{name:'扩张',exact:true}),true);await tap(page,page.getByRole('button',{name:'选择'+direction+'区域 '+coords,exact:true}),true);await tap(page,page.getByRole('button',{name:'确认扩张',exact:true}),true);await saved(page,(v,n)=>v.chunks.length===n,before.chunks.length+1);assert.equal((await world(page)).bp,before.bp-20);assert.deepEqual((await world(page)).objects,before.objects);assert.deepEqual((await world(page)).path,before.path);}
  await tap(page,page.getByRole('button',{name:'世界总览',exact:true}),true);await settle(page);const view=await page.locator('canvas').evaluate(c=>{const s=Number(c.dataset.scale),x=Number(c.dataset.originX),y=Number(c.dataset.originY);return{scale:s,left:x-256*s,right:x+512*s,top:y-256*s,bottom:y+256*s,width:c.width,height:c.height};});assert.ok(view.left>=0&&view.top>=0&&view.right<=view.width&&view.bottom<=view.height);await onScreen(page);await shot(page,'three-expansions-overview');
  const before=await world(page);await choose(page,'暖木小屋',true);await cell(page,-6,2,true);await tap(page,page.getByRole('button',{name:'确认建造',exact:true}),true);await saved(page,v=>v.bp===6);await clear(page,true);await choose(page,'林缘阔冠树',true);assert.match(await page.locator('.game-operation-message').innerText(),/BP 不足/);assert.equal(await page.getByRole('button',{name:'确认建造',exact:true}).isDisabled(),true);const raw=await page.evaluate(key=>localStorage.getItem(key),key);await shot(page,'insufficient-bp');await tap(page,page.getByRole('button',{name:'取消',exact:true}),true);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),raw);
  await context.addInitScript(()=>{const NativeDate=Date,after=NativeDate.now()+5*24*60*60*1000;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[after]));}static now(){return after;}};});await page.reload();await ready(page);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),raw);assert.equal((await world(page)).xp,300);assert.equal((await world(page)).bp,6);assert.deepEqual(errors,[]);results.push({name:'mobile-extra',status:'passed',view,world:await world(page),clockAdvanceDays:5,layout:await onScreen(page)});
 }catch(error){await shot(page,'extra-failure');results.push({name:'mobile-extra',status:'failed',error:error.stack});}finally{await context.close();}
 const c=await browser.newContext({viewport:{width:390,height:700},hasTouch:true,isMobile:true}),p=await c.newPage();let fail=true;await p.route('**/cabin-terracotta.png',r=>fail?r.fulfill({status:404,body:'QA missing'}):r.continue());
 try{await p.goto('http://127.0.0.1:5189/');await p.getByRole('heading',{name:'世界素材没有完整加载',exact:true}).waitFor();const raw=await p.evaluate(key=>localStorage.getItem(key),key);await shot(p,'resource404');fail=false;await tap(p,p.getByRole('button',{name:'重新加载素材',exact:true}),true);await ready(p);assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),raw);await shot(p,'resource-recovered');results.push({name:'resource-retry',status:'passed',sameRaw:true});}catch(error){await shot(p,'resource-failure');results.push({name:'resource-retry',status:'failed',error:error.stack});}finally{await c.close();}
}finally{await writeFile(output+prefix+'.json',JSON.stringify({chrome:browser.version(),results},null,2));console.log(JSON.stringify({results:results.map(({name,status,error})=>({name,status,error}))},null,2));await browser.close();}

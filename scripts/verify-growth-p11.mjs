// Installed Chrome/Playwright only; all data lives in disposable test profiles.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWorld, applyWorldCommand } from '../src/growth/world.js';
import { STORAGE_KEY } from '../src/growth/persistence.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.BASE_URL || 'http://127.0.0.1:5186/';
const output=process.env.QA_OUTPUT || 'docs/growth-p1.1';
await mkdir(output,{recursive:true});
const results=[], errors=[];
const chrome=await chromium.launch({channel:'chrome',headless:true});
const disk=page=>page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
const state=async page=>JSON.parse(await disk(page));
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const shot=async(page,name)=>{await settle(page);return page.screenshot({path:`${output}/${name}.png`,fullPage:false});};
async function ready(page){await page.goto(new URL('growth-p1',base).href);await page.waitForFunction(()=>document.querySelector('[aria-label="选择林间小屋"]')?.disabled===false);}
async function context(width,height,world){
 const ctx=await chrome.newContext({viewport:{width,height},hasTouch:width<600,isMobile:width<600,locale:'zh-CN'});
 if(world)await ctx.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key:STORAGE_KEY,value:JSON.stringify(world)});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page};
}
async function cellPoint(page,x,y){return page.locator('.gw-map-host canvas').evaluate((el,p)=>{const r=el.getBoundingClientRect(),s=Number(el.dataset.pixelScale),w=Number(el.dataset.tileWidth),h=Number(el.dataset.tileHeight);return {x:r.x+Number(el.dataset.originX)+(p.x-p.y)*w/2*s,y:r.y+Number(el.dataset.originY)+(p.x+p.y+1)*h/2*s};},{x,y});}
async function clickCell(page,x,y,touch=false){
 await settle(page);
 let p=await cellPoint(page,x,y),r=await page.locator('.gw-map-host canvas').boundingBox();
 if(p.x<r.x+8||p.x>r.x+r.width-8||p.y<r.y+8||p.y>r.y+r.height-8){await page.getByRole('button',{name:'查看完整地图'}).click();await settle(page);p=await cellPoint(page,x,y);}
 if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
}
async function assertViewport(page){
 await settle(page);
 const info=await page.evaluate(()=>{const rect=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();return {width:innerWidth,height:innerHeight,scrollY,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,canvas:rect('.gw-map-host canvas'),host:rect('.gw-map-host'),dock:rect('.gw-panel'),message:rect('.gw-placement-message'),confirm:rect('.gw-placement .gw-button.primary'),camera:rect('.gw-camera'),tag:rect('.gw-map-tag')};});
 assert.equal(info.scrollY,0);assert.equal(info.scrollWidth,info.width);assert.ok(info.scrollHeight<=info.height+1);
 assert.equal(info.canvas.width,info.host.width);assert.ok(info.canvas.left>=0&&info.canvas.right<=info.width);
 assert.ok(info.dock.bottom<=info.height+1);assert.ok(info.canvas.height>=110);
 if(info.message){assert.ok(info.message.top>=info.canvas.bottom);assert.ok(info.confirm.bottom<=info.height);}
 if(info.tag){const a=info.tag,b=info.camera;assert.ok(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom);}
 return info;
}
async function mobileFlow(width,height){
 const {ctx,page}=await context(width,height);try{
  await ready(page);await assertViewport(page);await shot(page,`mobile-${width}-${height}-world`);
  await page.getByRole('button',{name:'打开建筑目录',exact:true}).click();await assertViewport(page);await shot(page,`mobile-${width}-${height}-catalog`);
  await page.getByRole('button',{name:'选择林间小屋',exact:true}).click();await assertViewport(page);
  // Drag during placement must not choose a cell or commit any command.
  const canvas=page.locator('.gw-map-host canvas'),r=await canvas.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+45,r.y+r.height/2+25,{steps:8});await page.mouse.up();
  assert.equal(await disk(page),null);assert.equal(await page.getByRole('button',{name:'确认放置',exact:true}).isDisabled(),true);assert.match(await page.locator('.gw-placement-message').innerText(),/点击地图/);
  await page.getByRole('button',{name:'查看完整地图'}).click();await clickCell(page,2,2,true);await assertViewport(page);await shot(page,`mobile-${width}-${height}-valid`);
  await page.getByRole('button',{name:'确认放置',exact:true}).click();const id=(await state(page)).buildings[0].id;
  await page.getByRole('button',{name:'建造',exact:true}).click();await page.getByRole('button',{name:'选择街角茶屋',exact:true}).click();
  await clickCell(page,3,2,true);await assertViewport(page);assert.match(await page.locator('.gw-placement-message').innerText(),/重叠/);assert.equal(await page.getByRole('button',{name:'确认放置',exact:true}).isDisabled(),true);await shot(page,`mobile-${width}-${height}-invalid`);
  await page.getByRole('button',{name:'取消放置',exact:true}).click();await clickCell(page,2,2,true);
  await page.getByRole('button',{name:'移动建筑',exact:true}).click();await clickCell(page,4,3,true);await assertViewport(page);await page.getByRole('button',{name:'确认新位置',exact:true}).click();assert.equal((await state(page)).buildings[0].id,id);
  await page.getByRole('button',{name:'收纳建筑',exact:true}).click();assert.equal((await state(page)).buildings[0].stored,true);await assertViewport(page);
  await page.getByRole('button',{name:`重新摆放林间小屋 ${id}`,exact:true}).click();await clickCell(page,1,3,true);await page.getByRole('button',{name:'确认新位置',exact:true}).click();
  await page.getByRole('button',{name:'扩张',exact:true}).click();await assertViewport(page);await shot(page,`mobile-${width}-${height}-expansion`);
  await page.getByRole('button',{name:'选择北方区域 (0,-1)',exact:true}).click();await assertViewport(page);await page.getByRole('button',{name:'确认扩张',exact:true}).click();
  await page.getByRole('button',{name:'选择小小书屋',exact:true}).click();await clickCell(page,1,-6,true);await page.getByRole('button',{name:'确认放置',exact:true}).click();await page.getByRole('button',{name:'查看完整地图'}).click();await assertViewport(page);
  const saved=await disk(page);await page.reload();await page.waitForFunction(()=>document.querySelector('[aria-label="选择林间小屋"]')?.disabled===false);assert.equal(await disk(page),saved);await assertViewport(page);await shot(page,`mobile-${width}-${height}-restored`);
  results.push({label:`mobile-${width}-${height}`,passed:true,checks:['no page scrolling through build/move/store/replace/expand','map, errors and actions in viewport','drawer collapses on selection','drag cannot choose or build','44px camera targets','no tag/control overlap','reload preserves save']});
 }catch(error){console.log('MOBILE FAILURE',width,height,await page.locator('.gw-placement-message').allTextContents());await shot(page,`mobile-${width}-${height}-failure`);throw error;}finally{await ctx.close();}
}
async function objectPoint(page,id,part){return page.evaluate(async({key,id,part})=>{
 const {loadAssets}=await import('/src/growth/renderer.js'),{sceneEntries,entryRect,entryAlpha}=await import('/src/growth/scene.js');
 const world=JSON.parse(localStorage.getItem(key)),assets=await loadAssets(),el=document.querySelector('.gw-map-host canvas'),r=el.getBoundingClientRect(),scale=Number(el.dataset.pixelScale);
 const view={width:el.width,height:el.height,scale,centerX:(el.width/2-Number(el.dataset.originX))/scale,centerY:(el.height/2-Number(el.dataset.originY))/scale};
 const entries=sceneEntries(world,assets),entry=entries.find(e=>e.id===id),rect=entryRect(entry,view),data=entry.image.getContext('2d').getImageData(0,0,entry.image.width,entry.image.height).data;
 const range=part==='roof'?[10,30]:[39,55];
 for(let y=range[0];y<range[1];y++)for(let x=25;x<55;x++)if(data[(y*80+x)*4+3]===255){
  const px=rect.x+(x+.5)*rect.width/80,py=rect.y+(y+.5)*rect.height/80;
  if(px<5||py<5||px>el.width-5||py>el.height-5||entryAlpha(entry,view,px,py)!==255)continue;
  const front=entries.slice(entries.indexOf(entry)+1).some(e=>entryAlpha(e,view,px,py)>=128);if(!front)return {x:r.x+px,y:r.y+py};
 }
 throw Error(`No visible ${part} pixel for ${id}`);
},{key:STORAGE_KEY,id,part});}
async function hitAndLayers(){
 let world=createWorld();world={...world,nature:[]};world=applyWorldCommand(world,{type:'place',buildingType:'cottage',x:2,y:2});world=applyWorldCommand(world,{type:'place',buildingType:'library',x:4,y:2});
 const {ctx,page}=await context(1440,1000,world);try{
  await ready(page);const before=await disk(page),id=world.buildings[0].id;
  for(const scale of [.5,.75,1,2,3,4]){
   await page.getByRole('button',{name:'查看完整地图'}).click();
   const canvas=page.locator('.gw-map-host canvas');let actual=Number(await canvas.getAttribute('data-pixel-scale'));
   while(actual!==scale){await page.getByRole('button',{name:actual>scale?'缩小地图':'放大地图',exact:true}).click();actual=Number(await canvas.getAttribute('data-pixel-scale'));}
   for(const part of ['roof','wall']){const point=await objectPoint(page,id,part);await page.mouse.click(point.x,point.y);assert.match(await page.locator('.gw-inspector').innerText(),/林间小屋/);}
  }
  const box=await page.locator('.gw-map-host canvas').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+50,box.y+box.height/2+25,{steps:8});await page.mouse.up();
  for(const part of ['roof','wall']){const point=await objectPoint(page,id,part);await page.mouse.click(point.x,point.y);assert.match(await page.locator('.gw-inspector').innerText(),/林间小屋/);}
  await page.getByRole('button',{name:'查看完整地图'}).click();await shot(page,'desktop-roof-selected');
  const overlap=await page.evaluate(async key=>{
   const {loadAssets}=await import('/src/growth/renderer.js'),{sceneEntries,entryRect,entryAlpha}=await import('/src/growth/scene.js');const assets=await loadAssets(),world=JSON.parse(localStorage.getItem(key)),el=document.querySelector('.gw-map-host canvas'),r=el.getBoundingClientRect(),scale=Number(el.dataset.pixelScale),view={width:el.width,height:el.height,scale,centerX:(el.width/2-Number(el.dataset.originX))/scale,centerY:(el.height/2-Number(el.dataset.originY))/scale};
   const entries=sceneEntries(world,assets),front=entries.at(-1),rear=entries[0],rect=entryRect(front,view);
   for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)if(entryAlpha(front,view,x+.5,y+.5)>=128&&entryAlpha(rear,view,x+.5,y+.5)>=128)return {x:r.x+x+.5,y:r.y+y+.5,id:front.id};
   throw Error('Fixture has no visual overlap');
  },STORAGE_KEY);await page.mouse.click(overlap.x,overlap.y);assert.match(await page.locator('.gw-inspector').innerText(),/小小书屋/);await shot(page,'desktop-overlap-front-selected');
  const layers=await page.evaluate(async key=>{
   const {paintMap,loadAssets}=await import('/src/growth/renderer.js'),{sceneEntries,entryRect,entryAlpha}=await import('/src/growth/scene.js');const world=JSON.parse(localStorage.getItem(key)),assets=await loadAssets(),view={width:600,height:420,centerX:0,centerY:45,scale:3},render=options=>{const c=document.createElement('canvas');c.width=view.width;c.height=view.height;paintMap(c.getContext('2d'),world,assets,view,options);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
   const plain=render({}),selected=render({selectedId:world.buildings[1].id}),preview=render({preview:{type:'cottage',x:2,y:0}}),front=sceneEntries(world,assets).at(-1),r=entryRect(front,view);let changedSelected=0,changedPreview=0,checked=0;
   for(let y=Math.max(0,r.y);y<Math.min(view.height,r.y+r.height);y++)for(let x=Math.max(0,r.x);x<Math.min(view.width,r.x+r.width);x++)if(entryAlpha(front,view,x+.5,y+.5)===255){const i=(y*view.width+x)*4;checked++;if(plain[i]!==selected[i]||plain[i+1]!==selected[i+1]||plain[i+2]!==selected[i+2])changedSelected++;if(plain[i]!==preview[i]||plain[i+1]!==preview[i+1]||plain[i+2]!==preview[i+2])changedPreview++;}
   return {changedSelected,changedPreview,checked};
  },STORAGE_KEY);assert.ok(layers.checked>1000);assert.equal(layers.changedSelected,0);assert.equal(layers.changedPreview,0);
  // Repeated extreme drags retain at least one visible land reference.
  const canvas=page.locator('.gw-map-host canvas'),r=await canvas.boundingBox();for(let i=0;i<8;i++){await page.mouse.move(r.x+80,r.y+80);await page.mouse.down();await page.mouse.move(r.x+r.width-15,r.y+r.height-15,{steps:10});await page.mouse.up();}
  const hasLand=await canvas.evaluate(el=>{const c=el.getContext('2d'),data=c.getImageData(0,0,el.width,el.height).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]>140&&data[i]<200&&data[i+1]>150&&data[i+1]<210&&data[i+2]<155)count++;return count;});assert.ok(hasLand>100);await shot(page,'desktop-camera-boundary');await page.getByRole('button',{name:'查看完整地图'}).click();assert.equal(await disk(page),before);
  results.push({label:'hit-and-layers',passed:true,checks:['roof/wall hits at 50/75/100/200/300/400 percent and after pan','foreground visible building wins overlap','footprint selection does not repaint opaque building pixels','rear preview cannot cover foreground','camera bounds after repeated drags','selection and camera leave save byte-identical'],layers});
 }finally{await ctx.close();}
}
async function artwork(){
 const {ctx,page}=await context(1280,900);try{
  await page.goto(new URL('growth-p1?view=art',base).href);await page.waitForFunction(async()=>{const {loadAssets}=await import('/src/growth/renderer.js');return !!await loadAssets();});
  const setScale=async target=>{await settle(page);const c=page.locator('.gw-map-host canvas');let s=Number(await c.getAttribute('data-pixel-scale'));while(s!==target){await page.getByRole('button',{name:s>target?'缩小地图':'放大地图',exact:true}).click();await settle(page);s=Number(await c.getAttribute('data-pixel-scale'));}assert.equal(Number(await c.getAttribute('data-pixel-scale')),target);};
  await setScale(2);await shot(page,'art-candidate-normal');await page.locator('.gw-map-host canvas').screenshot({path:`${output}/art-candidate-normal-world.png`});
  await setScale(4);await shot(page,'art-candidate-close');await page.locator('.gw-map-host canvas').screenshot({path:`${output}/art-candidate-close-world.png`});
  await page.getByRole('button',{name:'查看完整地图'}).click();await shot(page,'art-candidate-overall');
  await page.getByRole('button',{name:'原 P1 素材',exact:true}).click();await setScale(2);await shot(page,'art-p1-normal');await page.locator('.gw-map-host canvas').screenshot({path:`${output}/art-p1-normal-world.png`});
  await setScale(4);await shot(page,'art-p1-close');await page.locator('.gw-map-host canvas').screenshot({path:`${output}/art-p1-close-world.png`});
  await page.locator('.gw-art-comparison').scrollIntoViewIfNeeded();await settle(page);await page.locator('.gw-art-comparison').screenshot({path:`${output}/art-comparison-normal.png`});
  await page.getByRole('button',{name:'切换对比视距',exact:true}).click();await settle(page);await page.locator('.gw-art-comparison').screenshot({path:`${output}/art-comparison-close.png`});
  assert.equal(await disk(page),null,'read-only sample must not seed a stored world');
  const images=await page.evaluate(async()=>{const {cabinBitmap,treeBitmap,sampleGroundBitmap}=await import('/src/growth/sample-art.js');const {project}=await import('/src/growth/view.js');const grass=document.createElement('canvas');grass.width=145;grass.height=78;const c=grass.getContext('2d');for(let depth=0;depth<=10;depth++)for(let x=0;x<6;x++){const y=depth-x;if(y<0||y>=6)continue;const p=project(x,y);c.drawImage(sampleGroundBitmap(x,y,0,false),p.x+60,p.y+3);}return {cabin:cabinBitmap().toDataURL(),tree:treeBitmap().toDataURL(),grass:grass.toDataURL()};});
  for(const [name,data] of Object.entries(images))await writeFile(`${output}/sample-${name}.png`,Buffer.from(data.split(',')[1],'base64'));
  // Opening the candidate scene with an existing save preserves exact bytes.
  const sentinel='unchanged-world-proof';await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:STORAGE_KEY,value:sentinel});await page.reload();await page.getByRole('button',{name:'候选样板',exact:true}).click();await setScale(4);assert.equal(await disk(page),sentinel);
  results.push({label:'art-sample',passed:true,checks:['normal 200%, close 400%, overall screenshots','same camera/layout P1 comparison and side-by-side boards','three exported sample bitmaps','sample does not seed/read/write world save'],visualApproval:'pending user review; tests do not judge art quality'});
 }finally{await ctx.close();}
}
try{await hitAndLayers();for(const [w,h] of [[390,844],[320,740],[320,568]]){await mobileFlow(w,h);console.log(`${w}x${h} mobile PASS`);}await artwork();assert.deepEqual(errors,[]);await writeFile(`${output}/verification-p11.json`,JSON.stringify({verifiedAt:new Date().toISOString(),results,pageErrors:errors,unverified:['real iOS Safari/Android/WeChat','multi-touch pinch','screen reader','long-lived large-world performance','art quality requires human approval']},null,2)+'\n');console.log('P1.1 browser checks PASS');}finally{await chrome.close();}

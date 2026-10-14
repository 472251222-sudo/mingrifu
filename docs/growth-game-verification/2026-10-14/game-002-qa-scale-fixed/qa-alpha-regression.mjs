// QA-G002-001: compare hits to real full-size Canvas sprite rasterization.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const prefix = `game-002-browser-alpha-${process.env.GAME_RUN_ID || Date.now()}`;
const output = fileURLToPath(new URL('./', import.meta.url));
const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
let result;
try {
  const context = await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true});
  const page = await context.newPage(), ui = [];
  const settle = () => page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  for(const [scale, local] of [[.25,[145,143]],[.125,[142,159]]]) {
    await page.goto('http://127.0.0.1:5189/');await page.locator('canvas[data-ready="true"]').waitFor();await settle();
    while(Number(await page.locator('canvas').getAttribute('data-scale'))>scale){await page.getByRole('button',{name:'缩小世界'}).click();await settle();}
    const probe=await page.locator('canvas').evaluate((canvas,local)=>{const b=canvas.getBoundingClientRect();return {size:[canvas.width,canvas.height],origin:[Number(canvas.dataset.originX),Number(canvas.dataset.originY)],client:[b.left+local[0]*b.width/canvas.width,b.top+local[1]*b.height/canvas.height],rgba:[...canvas.getContext('2d').getImageData(...local,1,1).data]};},local);
    await page.touchscreen.tap(...probe.client);await settle();
    ui.push({scale,local,...probe,selected:await page.locator('.game-actions').getAttribute('data-object-id')});
    await page.screenshot({path:`${output}${prefix}-ui-${scale}.png`,fullPage:true});
  }
  const matrix=await page.evaluate(async()=>{
    const [{loadHomesteadAssets},{objectOrder},{worldToScene,screenToWorld,hitScene},{createGameWorld},rendering]=await Promise.all([
      import('/src/growth/homestead/renderer.js'),import('/src/growth/homestead/world.js'),import('/src/growth/game/scene.js'),import('/src/growth/game/world.js'),import('/src/growth/game/renderer.js'),
    ]);
    const resources=await loadHomesteadAssets();resources.masks=rendering.createSpriteMasks(resources);
    const initial=createGameWorld(),negative=structuredClone(initial);
    negative.chunks=[{x:-1,y:-1},{x:0,y:0},{x:2,y:0}];negative.objects[0].x=-6;negative.objects[0].y=-6;
    const overlap=structuredClone(initial);overlap.objects[0].x=5;overlap.nature.find(o=>o.id==='n-3').y=5;
    const cases=[];
    for(const [name,world] of [['initial',initial],['negative-sparse',negative],['natural-foreground',overlap]])for(const scale of [.07,.125,.25,.5,1,2,3,4]){
      const scene=worldToScene(world,resources.manifest),width=298,height=339,camera={x:name==='negative-sparse'?-50.375:124,y:name==='negative-sparse'?-48.125:126,scale};
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const origin=rendering.paintGame(canvas.getContext('2d'),scene,resources,camera,width,height);
      const ordered=objectOrder(scene.objects),owners=new Int16Array(width*height).fill(-1);
      // Independent oracle: each original PNG actually rendered on a full
      // viewport, with the same transform used by the visible paint call.
      for(let i=0;i<ordered.length;i++){
        const object=ordered[i],c=document.createElement('canvas');c.width=width;c.height=height;
        const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.setTransform(scale,0,0,scale,...origin);
        ctx.drawImage(resources.images.get(object.assetId),object.ground[0]-object.asset.anchor[0],object.ground[1]-object.asset.anchor[1]);
        const pixels=ctx.getImageData(0,0,width,height).data;
        for(let pixel=0;pixel<owners.length;pixel++)if(pixels[pixel*4+3]>0)owners[pixel]=i;
      }
      let mismatches=0,checked=0;const examples=[];
      for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(const fraction of [0,.25,.5,.9]){
        const point={x:x+fraction,y:y+fraction},worldPoint=screenToWorld(point,camera,width,height);
        const visual=owners[y*width+x]>=0?ordered[owners[y*width+x]]:null;
        const fallback=visual?null:[...ordered].reverse().find(object=>object.kind==='artificial'&&worldPoint.x>=object.x*32&&worldPoint.y>=object.y*32&&worldPoint.x<(object.x+object.asset.footprint[0])*32&&worldPoint.y<(object.y+object.asset.footprint[1])*32);
        const expected=(visual||fallback)?.id||null;
        const actual=(rendering.hitScreenScene?rendering.hitScreenScene(scene,point,resources,camera,width,height):hitScene(scene,worldPoint,resources.masks))?.id||null;
        checked++;if(actual!==expected){mismatches++;if(examples.length<3)examples.push({point,actual,expected,visual:visual?.id||null});}
      }
      cases.push({name,scale,camera,origin,checked,mismatches,examples});
    }
    return cases;
  });
  result={chrome:browser.version(),ui,matrix,totalChecked:matrix.reduce((sum,row)=>sum+row.checked,0),totalMismatches:matrix.reduce((sum,row)=>sum+row.mismatches,0)};
  await writeFile(`${output}${prefix}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({chrome:result.chrome,ui,totalChecked:result.totalChecked,totalMismatches:result.totalMismatches,cases:matrix.map(({name,scale,mismatches})=>({name,scale,mismatches}))},null,2));
  assert.deepEqual(ui.map(row=>row.selected),['o-1','o-1'],'both actual QA UI points must select the visible cabin');
  assert.equal(result.totalMismatches,0,'actual screen alpha and hits must agree for integer/fractional pointers, all zooms and sparse/negative/natural foreground scenes');
  await context.close();
} finally {await browser.close();}

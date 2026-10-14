import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const prefix = `game-002-browser-math-${process.env.GAME_RUN_ID || Date.now()}`;
const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto('http://127.0.0.1:5189/'); await page.locator('canvas[data-ready="true"]').waitFor();
  const result = await page.evaluate(async () => {
    const [{loadHomesteadAssets}, {worldToScene, hitScene, fitSceneCamera, screenToWorld, cameraOrigin}, {createSpriteMasks, paintGame, composeRenderObjects}, {createGameWorld}] = await Promise.all([
      import('/src/growth/homestead/renderer.js'), import('/src/growth/game/scene.js'), import('/src/growth/game/renderer.js'), import('/src/growth/game/world.js'),
    ]);
    const resources = await loadHomesteadAssets(); resources.masks = createSpriteMasks(resources);
    const initial = createGameWorld(), scene = worldToScene(initial, resources.manifest);
    const hit = point => hitScene(scene, point, resources.masks)?.id || null;
    const alphaHits = {roof: hit({x:112,y:48}), wall:hit({x:112,y:108}), groundFallback:hit({x:159.5,y:127.5}), transparentMargin:hit({x:159.5,y:16.5})};
    const camera = {x: 110, y: 120, scale: 3}, origin = cameraOrigin(camera, 400, 300);
    const transformedRoof = screenToWorld({x:origin[0]+112*3,y:origin[1]+48*3},camera,400,300);
    alphaHits.zoomedPannedRoof = hit(transformedRoof);
    const overlap = structuredClone(initial); overlap.objects[0].x = 5; overlap.nature.find(object => object.id === 'n-3').y = 5;
    const overlapScene = worldToScene(overlap, resources.manifest);
    // Select a real pixel where both original PNGs are opaque, rather than
    // assuming a guessed canopy coordinate has alpha.
    const cabinMask = resources.masks.get('cabin-terracotta'), pineMask = resources.masks.get('pine-slender');
    let foregroundPoint = null;
    for(let y=44;y<144&&!foregroundPoint;y++)for(let x=168;x<248;x++)if(cabinMask.alpha[(y-16)*96+x-160]&&pineMask.alpha[(y-44)*80+x-168]){foregroundPoint={x:x+.5,y:y+.5};break;}
    if(!foregroundPoint)throw Error('Fixture PNGs have no overlapping opaque pixel');
    alphaHits.naturalForeground = hitScene(overlapScene, foregroundPoint, resources.masks)?.id || null;
    const preview = {type:'build',assetId:'cabin-terracotta',x:5,y:2};
    const depthOrder = composeRenderObjects(overlapScene, preview).map(object => ({id:object.id,groundY:object.ground[1],preview:Boolean(object.preview)}));
    const sparse = structuredClone(initial); sparse.chunks = [{x:-1,y:-1},{x:0,y:0},{x:2,y:0}]; sparse.path = [{x:-1,y:-1},{x:-1,y:0}];
    const sparseScene = worldToScene(sparse,resources.manifest), fit = fitSceneCamera(sparseScene,390,500);
    const canvas = document.createElement('canvas'); canvas.width=390;canvas.height=500;
    paintGame(canvas.getContext('2d'),sparseScene,resources,fit,390,500);
    const sparsePNG = canvas.toDataURL('image/png').split(',')[1];
    const overlapFit = fitSceneCamera(overlapScene,600,600);canvas.width=600;canvas.height=600;
    paintGame(canvas.getContext('2d'),overlapScene,resources,overlapFit,600,600,{preview,placement:{ok:true},selectedId:'o-1'});
    return {alphaHits, foregroundPoint, depthOrder, sparse:{tileCount:sparseScene.tiles.length,bounds:sparseScene.bounds,fit}, sparsePNG, overlapPNG:canvas.toDataURL('image/png').split(',')[1]};
  });
  assert.deepEqual(result.alphaHits,{roof:'o-1',wall:'o-1',groundFallback:'o-1',transparentMargin:null,zoomedPannedRoof:'o-1',naturalForeground:'n-3'});
  assert.ok(result.depthOrder.findIndex(object=>object.preview)<result.depthOrder.findIndex(object=>object.id==='n-3'));
  assert.equal(result.sparse.tileCount,192);assert.ok(result.sparse.fit.scale<=.5);
  for(const [suffix,data] of [['sparse',result.sparsePNG],['overlap-preview',result.overlapPNG]]) await writeFile(`${output}${prefix}-${suffix}.png`,Buffer.from(data,'base64'));
  delete result.sparsePNG;delete result.overlapPNG;
  await writeFile(`${output}${prefix}.json`,JSON.stringify({chromeVersion:browser.version(),...result},null,2));console.log(JSON.stringify(result,null,2));
  await context.close();
} finally {await browser.close();}

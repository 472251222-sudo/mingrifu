import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareScene} from '../../../src/growth/homestead/world.js';
import {terrainMask,tileId} from '../../../src/growth/homestead/tile-rules.js';
const require=createRequire(import.meta.url),{PNG}=require(process.env.PNGJS_MODULE||'pngjs');
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),manifest=JSON.parse(readFileSync(resolve(root,'public/assets/growth-p2-homestead/manifest.json'))),scene=JSON.parse(readFileSync(resolve(root,'src/growth/homestead/scene.json'))),world=prepareScene(scene,manifest);
const checks=[],test=(name,fn)=>{try{fn();checks.push({name,passed:true})}catch(error){checks.push({name,passed:false,message:error.message})}};
const images=new Map();const png=p=>PNG.sync.read(readFileSync(resolve(root,p)));
for(const a of manifest.assets){const image=png(a.pngPath);images.set(a.id,image);test(a.id+' native size',()=>assert.deepEqual([image.width,image.height],a.nativeSize));
 test(a.id+' binary alpha and exact 32-color palette',()=>{const alpha=new Set();for(let p=0;p<image.data.length;p+=4){alpha.add(image.data[p+3]);if(image.data[p+3])assert.ok(manifest.palette.includes('#'+image.data.subarray(p,p+3).toString('hex')))}assert.deepEqual([...alpha].sort((a,b)=>a-b),[0,255])});
 test(a.id+' source and anchor exist',()=>{assert.ok(existsSync(resolve(root,a.sourceEngineering)));assert.ok(existsSync(resolve(root,a.sourceScript)));assert.ok(a.anchor[0]>=0&&a.anchor[0]<a.nativeSize[0]&&a.anchor[1]>=0&&a.anchor[1]<a.nativeSize[1])});
 test(a.id+' visible pixels have margin',()=>{const [x,y,w,h]=a.visualBounds;assert.ok(x>0&&y>0&&x+w<image.width&&y+h<image.height)});
 if(a.status==='candidate'){const record=JSON.parse(readFileSync(resolve(root,dirname(a.sourceEngineering),'record.json')));test(a.id+' south orthographic camera and projected anchor',()=>{assert.equal(record.camera.type,'ORTHO');assert.equal(record.camera.azimuthDegrees,0);assert.equal(record.camera.elevationDegrees,38);assert.ok(record.camera.projectedAnchor.every((p,i)=>Math.abs(p-a.anchor[i])<.001))});}
}
test('approved cabin is byte-identical to the accepted original',()=>assert.ok(readFileSync(resolve(root,manifest.assets[0].pngPath)).equals(readFileSync(resolve(root,'docs/growth-blender-experiment/2026-10-13/delivery/cabin-terracotta-sprite.png')))));
const tileImages=new Map();for(const t of Object.values(manifest.terrain.tiles))tileImages.set(t.id,png(t.sourcePNG));
test('all 104 terrain tiles are opaque 32px and use the same palette',()=>{assert.equal(tileImages.size,104);for(const t of tileImages.values()){assert.deepEqual([t.width,t.height],[32,32]);for(let p=0;p<t.data.length;p+=4){assert.equal(t.data[p+3],255);assert.ok(manifest.palette.includes('#'+t.data.subarray(p,p+3).toString('hex')))}}});
test('eight grass textures are distinct',()=>assert.equal(new Set(Array.from({length:8},(_,i)=>createHash('sha256').update(tileImages.get('grass-'+i).data).digest('hex'))).size,8));
function edgeEqual(a,b,vertical){for(let i=0;i<32;i++){const p=(vertical?31*32+i:i*32+31)*4,q=(vertical?i:i*32)*4;if(!a.data.subarray(p,p+4).equals(b.data.subarray(q,q+4)))return false}return true;}
let scenePairs=0;test('all actual scene tile boundaries join exactly',()=>{for(const t of world.tiles)for(const [dx,dy] of [[1,0],[0,1]]){const n=world.tiles.find(q=>q.x===t.x+dx&&q.y===t.y+dy);if(n){scenePairs++;assert.ok(edgeEqual(tileImages.get(t.id),tileImages.get(n.id),dy===1),`${t.x},${t.y}: ${t.id}/${n.id}`)}}});
let exhaustivePairs=0;test('connection edges remain equal across every binary 4x3 neighbourhood',()=>{
 for(const kind of ['dirt','path'])for(const vertical of [false,true])for(let bits=0;bits<4096;bits++){
  const grid=Array.from({length:vertical?4:3},(_,y)=>Array.from({length:vertical?3:4},(_,x)=>(bits&(1<<(y*(vertical?3:4)+x)))?kind:'grass'));
  const [x,y]=[1,1],other=[x+(vertical?0:1),y+(vertical?1:0)];
  const a=tileImages.get(tileId(grid,x,y)),b=tileImages.get(tileId(grid,...other));exhaustivePairs++;assert.ok(edgeEqual(a,b,vertical),'neighbourhood '+bits+' '+kind+' vertical='+vertical);
 }
});
test('every empty future plot remains editable terrain rather than a baked scene',()=>{assert.ok(world.cells.flat().filter(t=>t==='grass').length>100);assert.ok(world.objects.length<40);assert.equal(world.objects.filter(o=>o.asset.type==='building').length,1)});
const result={total:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks,sceneNeighbourPairs:scenePairs,exhaustiveNeighbourPairs:exhaustivePairs,visualApproval:'new assets and assembled scene pending user review',approvedAssets:['cabin-terracotta']};
writeFileSync(resolve(here,'asset-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;

// Checks real .blend scene records and PNG pixels, rather than assuming successful file export means art quality.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{PNG}=require(process.env.PNGJS_MODULE||'pngjs');
const here=dirname(fileURLToPath(import.meta.url)),folder=resolve(process.argv[2]||resolve(here,'delivery'));
const json=p=>JSON.parse(readFileSync(resolve(folder,p)));
const png=p=>PNG.sync.read(readFileSync(resolve(folder,p)));
const scene=json('cabin-terracotta-scene.json'),blue=json('deep-blue/cabin-deep-blue-scene.json');
const original=png('cabin-terracotta-sprite.png'),changed=png('deep-blue/cabin-deep-blue-sprite.png'),mask=png('roof-visible-mask.png');
const checks=[];
const test=(name,fn)=>{try{fn();checks.push({name,passed:true})}catch(e){checks.push({name,passed:false,error:e.message})}};
const equalRGBA=(a,b)=>a.width===b.width&&a.height===b.height&&a.data.equals(b.data);
for(const [name,p] of [['original','cabin-terracotta-sprite-quality.json'],['blue','deep-blue/cabin-deep-blue-sprite-quality.json']]){
 const q=json(p);
 test(name+' native dimensions',()=>assert.deepEqual([q.sprite.width,q.sprite.height],[96,128]));
 test(name+' binary alpha and transparency',()=>{assert.deepEqual(q.sprite.alphaValues,[0,255]);assert.ok(q.sprite.transparentPixels>0)});
 test(name+' fixed palette',()=>assert.equal(q.sprite.outsidePaletteCount,0));
 test(name+' margins',()=>assert.equal(q.sprite.touchesCanvasEdge,false));
}
test('orthographic south camera without isometric yaw',()=>{assert.equal(scene.camera.type,'ORTHO');assert.equal(scene.camera.azimuthDegrees,0);assert.equal(scene.camera.elevationDegrees,38)});
test('projected anchor',()=>{assert.ok(Math.abs(scene.camera.projectedAnchor[0]-48)<.001);assert.ok(Math.abs(scene.camera.projectedAnchor[1]-112)<.001)});
test('semantic editable objects',()=>{for(const part of ['Foundation','Walls','Roof','Door','Windows','Chimney','Decorations'])assert.ok(scene.semanticObjectCounts[part]>0)});
test('roof edit preserves all geometry and assignments',()=>assert.deepEqual(scene.objects,blue.objects));
test('roof edit preserves camera',()=>assert.deepEqual(scene.camera,blue.camera));
const changedMaterials=Object.keys(scene.materials).filter(n=>scene.materials[n]!==blue.materials[n]);
test('only four roof materials changed',()=>{assert.equal(changedMaterials.length,4);assert.ok(changedMaterials.every(n=>n.startsWith('Roof_Color_')))});
test('modified project reopened and rendered',()=>assert.equal(json('blue-reopened/cabin-deep-blue-scene.json').loadedExistingModel,true));
test('original project reopened and rendered',()=>assert.equal(json('reopened/cabin-terracotta-scene.json').loadedExistingModel,true));
test('script regenerated original geometry',()=>assert.deepEqual(scene.objects,json('rebuilt/cabin-terracotta-scene.json').objects));
test('reopened original raw pixels identical',()=>assert.ok(equalRGBA(png('cabin-terracotta-raw.png'),png('reopened/cabin-terracotta-raw.png'))));
test('reopened original sprite pixels identical',()=>assert.ok(equalRGBA(original,png('reopened/cabin-terracotta-sprite.png'))));
test('rebuilt original raw pixels identical',()=>assert.ok(equalRGBA(png('cabin-terracotta-raw.png'),png('rebuilt/cabin-terracotta-raw.png'))));
test('rebuilt original sprite pixels identical',()=>assert.ok(equalRGBA(original,png('rebuilt/cabin-terracotta-sprite.png'))));
test('reopened blue raw pixels identical',()=>assert.ok(equalRGBA(png('deep-blue/cabin-deep-blue-raw.png'),png('blue-reopened/cabin-deep-blue-raw.png'))));
test('reopened blue sprite pixels identical',()=>assert.ok(equalRGBA(changed,png('blue-reopened/cabin-deep-blue-sprite.png'))));
const difference={inside:{pixels:0,changedRGBA:0},outside:{pixels:0,changedRGBA:0},changedAlpha:0};
for(let p=0;p<original.data.length;p+=4){const group=mask.data[p]===255?difference.inside:difference.outside;group.pixels++;if([0,1,2,3].some(c=>original.data[p+c]!==changed.data[p+c]))group.changedRGBA++;if(original.data[p+3]!==changed.data[p+3])difference.changedAlpha++}
test('roof visibly recoloured',()=>assert.ok(difference.inside.changedRGBA>0));
test('roof recolour preserves silhouette',()=>assert.equal(difference.changedAlpha,0));
// This last comparison diagnoses renderer coupling; any failure is reported, not hidden by compositing.
test('unrelated rendered pixels unchanged',()=>assert.equal(difference.outside.changedRGBA,0));
const rawHash=p=>createHash('sha256').update(readFileSync(resolve(folder,p))).digest('hex');
const result={checks,total:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,
  changedMaterials,pixelDifference:difference,originalSpriteSha256:rawHash('cabin-terracotta-sprite.png'),
  blueSpriteSha256:rawHash('deep-blue/cabin-deep-blue-sprite.png'),visualApproval:'pending-user-review',
  statement:'Checks establish structure and repeatability; they do not certify professional art quality.'};
writeFileSync(resolve(folder,'verification.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result,null,2));
if(result.failed)process.exitCode=1;

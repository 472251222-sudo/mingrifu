// Existing pngjs only. Original meshes come from Blender; terrain has editable JSON + integer-pixel source.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,constants,existsSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BLOB_MASKS,terrainInside} from '../../../src/growth/homestead/tile-rules.js';
const require=createRequire(import.meta.url),{PNG}=require(process.env.PNGJS_MODULE||'pngjs');
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const modelRoot=resolve(process.argv[2]||resolve(here,'source-models'));
const target=resolve(process.argv[3]||resolve(root,'public/assets/growth-p2-homestead'));
for(const id of ['oak-broad','pine-slender','grass-tuft','wildflowers','bush','rock','fence-horizontal','fence-vertical','mailbox'])if(!existsSync(resolve(modelRoot,id,'record.json')))throw Error('Complete Blender production first: missing '+id);
if(existsSync(target))throw Error('Use a new output directory; preserve previous assets.');
mkdirSync(target,{recursive:true});const tilesOut=resolve(here,'terrain-tiles');mkdirSync(tilesOut,{recursive:true});
const base=resolve(root,'docs/growth-blender-experiment/2026-10-13'),config=JSON.parse(readFileSync(resolve(base,'cabin-config.json'))),style=JSON.parse(readFileSync(resolve(here,'terrain-style.json')));
const palette=config.pixelOutput.palette,colors=palette.map(hex=>({hex,rgb:Buffer.from(hex.slice(1),'hex')}));
const url=p=>'/'+relative(resolve(root,'public'),p).replaceAll('\\','/');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const repoPath=p=>relative(root,p).replaceAll('\\','/');
const save=(p,png)=>writeFileSync(p,PNG.sync.write(png),{flag:'wx'});
const put=(png,x,y,color)=>{if(x>=0&&y>=0&&x<png.width&&y<png.height)png.data.set([...Buffer.from(color.slice(1),'hex'),255],(y*png.width+x)*4)};
function bounds(image){let x0=image.width,y0=image.height,x1=-1,y1=-1;const set=new Set(),alpha=new Set();let visible=0;for(let p=0;p<image.data.length;p+=4){alpha.add(image.data[p+3]);if(!image.data[p+3])continue;visible++;set.add('#'+image.data.subarray(p,p+3).toString('hex'));const k=p/4,x=k%image.width,y=Math.floor(k/image.width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}return {visualBounds:[x0,y0,x1-x0+1,y1-y0+1],colorCount:set.size,alphaValues:[...alpha].sort((a,b)=>a-b),visiblePixels:visible,outsidePalette:[...set].filter(c=>!palette.includes(c))};}
function pixelExport(raw,outline){const out=new PNG({width:raw.width,height:raw.height});for(let p=0;p<raw.data.length;p+=4){if(raw.data[p+3]<128)continue;let best=colors[0],error=Infinity;for(const c of colors){const d=[.30,.59,.11].reduce((s,w,i)=>s+w*(raw.data[p+i]-c.rgb[i])**2,0);if(d<error){error=d;best=c}}out.data.set([...best.rgb,255],p)}
 const alpha=Buffer.from(out.data);for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const p=(y*out.width+x)*4;if(alpha[p+3])continue;if([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>a>=0&&b>=0&&a<out.width&&b<out.height&&alpha[(b*out.width+a)*4+3]))put(out,x,y,outline)}return out;}
const assets=[];
const houseSource=resolve(base,'delivery/cabin-terracotta-sprite.png'),housePath=resolve(target,'cabin-terracotta.png');copyFileSync(houseSource,housePath,constants.COPYFILE_EXCL);
assets.push({id:'cabin-terracotta',name:'暖木小屋',type:'building',status:'approved',approvalSource:'User P2-B instruction, 2026-10-14: accepted existing cabin quality',version:'p2-a-approved',nativeSize:[96,128],anchor:[48,112],footprint:[3,2],png:url(housePath),pngPath:repoPath(housePath),sourceEngineering:repoPath(resolve(base,'delivery/cabin-terracotta.blend')),sourceScript:repoPath(resolve(base,'build_cabin.py')),method:'Approved Blender native render and deterministic pixel export, copied byte-for-byte',renderLayer:'objects',occlusion:'groundAnchorY; then priority; then instance ID',priority:10,palette,sha256:hash(housePath),...bounds(PNG.sync.read(readFileSync(housePath)))});
for(const id of ['oak-broad','pine-slender','grass-tuft','wildflowers','bush','rock','fence-horizontal','fence-vertical','mailbox']){
 const folder=resolve(modelRoot,id),record=JSON.parse(readFileSync(resolve(folder,'record.json'))),raw=PNG.sync.read(readFileSync(resolve(folder,id+'-raw.png')));
 if(raw.width!==record.size[0]||raw.height!==record.size[1])throw Error('Native size mismatch '+id);
 const plant=['tree','vegetation'].includes(record.kind),png=pixelExport(raw,plant?'#264b40':'#594036'),p=resolve(target,id+'.png');save(p,png);
 const info={id,name:record.name,type:record.kind,status:'candidate',version:'p2-b-v1',nativeSize:record.size,anchor:record.anchor,footprint:record.footprint,png:url(p),pngPath:repoPath(p),sourceEngineering:repoPath(resolve(folder,id+'.blend')),sourceScript:repoPath(resolve(here,'build_assets.py')),rawPNG:repoPath(resolve(folder,id+'-raw.png')),method:'Structured Blender model; 38deg south orthographic camera; same four-band light and 32-color palette; native alpha/palette/1px outline export',renderLayer:'objects',occlusion:'groundAnchorY; then priority; then instance ID',priority:record.kind==='tree'?20:5,palette,sha256:hash(p),...bounds(png)};
 writeFileSync(resolve(folder,'export-check.json'),JSON.stringify(info,null,2)+'\n',{flag:'wx'});assets.push(info);
}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}};
function grass(variant){const image=new PNG({width:32,height:32});for(let y=0;y<32;y++)for(let x=0;x<32;x++)put(image,x,y,style.grass.base);const random=rng(1901+variant*631);
 for(let i=0;i<style.grass.clusterCounts[variant];i++){const x=3+Math.floor(random()*23),y=4+Math.floor(random()*23),s=i%3===0?style.grass.softLeaf:style.grass.leafShadow;
  for(const [dx,dy] of [[0,1],[1,0],[2,1],[3,-1]])put(image,x+dx,y+dy,s);for(const [dx,dy] of [[1,-1],[3,-2]])put(image,x+dx,y+dy,style.grass.leafLight);
 }return image;}
function terrain(kind,mask){const image=grass(0),inside=Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>terrainInside(mask,x,y))),s=style[kind];
 for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(inside[y][x])put(image,x,y,s.base);
 const random=rng(6201+mask*71+(kind==='path'?133:0));
 // Designed clusters, not independent noisy pixels. Outer two pixels remain identical across neighbours.
 for(let i=0;i<(kind==='path'?9:7);i++){const x=4+Math.floor(random()*23),y=4+Math.floor(random()*23);const shape=kind==='path'?[[0,0],[1,0],[2,0],[-1,1],[0,1],[1,1],[2,1],[0,2],[1,2]]:[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[3,1],[1,2],[2,2]];
  for(const [dx,dy] of shape){const a=x+dx,b=y+dy;if(a>2&&a<29&&b>2&&b<29&&inside[b][a])put(image,a,b,dy===0?s.light:s.patch)}
 }
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){const n=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([a,b])=>a>=0&&a<32&&b>=0&&b<32);if(inside[y][x]&&n.some(([a,b])=>!inside[b][a]))put(image,x,y,s.edge);if(!inside[y][x]&&n.some(([a,b])=>inside[b][a]))put(image,x,y,style.transition.grassRim)}
 return image;}
const terrainImages=[];for(let v=0;v<8;v++)terrainImages.push({id:'grass-'+v,kind:'grass',variant:v,image:grass(v)});
for(const kind of ['dirt','path'])for(const mask of BLOB_MASKS)terrainImages.push({id:kind+'-'+mask,kind,mask,image:terrain(kind,mask)});
const atlas=new PNG({width:512,height:Math.ceil(terrainImages.length/16)*32}),tiles={};
terrainImages.forEach(({id,kind,mask,variant,image},index)=>{const x=index%16*32,y=Math.floor(index/16)*32;for(let yy=0;yy<32;yy++)image.data.copy(atlas.data,((y+yy)*atlas.width+x)*4,yy*32*4,(yy+1)*32*4);save(resolve(tilesOut,id+'.png'),image);tiles[id]={id,name:{grass:'自然草地',dirt:'裸露土地',path:'乡间碎石土路'}[kind],type:'terrain',kind,status:'candidate',version:'p2-b-v1',mask:mask??null,variant:variant??null,nativeSize:[32,32],anchor:[0,0],footprint:[1,1],visualBounds:[0,0,32,32],frame:[x,y,32,32],png:'/assets/growth-p2-homestead/terrain-atlas.png',sourcePNG:repoPath(resolve(tilesOut,id+'.png')),sourceEngineering:repoPath(resolve(here,'terrain-style.json')),sourceScript:repoPath(resolve(here,'produce_assets.mjs')),method:'Designed pixel clusters + 47-state blob corner composition',renderLayer:'ground',occlusion:'ground below all sprites',palette,...bounds(image)}});
save(resolve(target,'terrain-atlas.png'),atlas);
const manifest={version:'p2-b-v1',tileSize:32,projection:'orthogonal-square-ground; 3/4 sprites, south 38deg, zero yaw',lightDirection:'upper-left [-3.5,-4,7]',pixelScale:'one native pixel; integer nearest-neighbour inspection zoom',palette,assets,terrain:{atlas:'/assets/growth-p2-homestead/terrain-atlas.png',size:[atlas.width,atlas.height],connectivity:'N,E,S,W,NE,SE,SW,NW; diagonals normalized; 47 shapes for each earth material',tiles},status:'candidate-scene; cabin approved only',sourceNotice:'Original scripted models and terrain. No purchased assets, no game textures, no PixelLab or generation APIs.'};
writeFileSync(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});writeFileSync(resolve(here,'production-summary.json'),JSON.stringify({objectAssets:assets.length,grassVariants:8,masksPerEarthMaterial:BLOB_MASKS.length,terrainTiles:terrainImages.length,atlasSize:[atlas.width,atlas.height],approvedCabinBytesUnchanged:hash(housePath)===hash(houseSource)},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:target,objectAssets:assets.length,terrainTiles:terrainImages.length,cabinUnchanged:hash(housePath)===hash(houseSource)}));

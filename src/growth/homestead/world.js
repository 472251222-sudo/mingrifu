import {tileId} from './tile-rules.js';
export const ZOOMS=[.5,1,2,3,4];
export function prepareScene(scene,manifest){
 const [w,h]=scene.size;
 if(scene.tileSize!==32||manifest.tileSize!==32||scene.terrainRows.length!==h)throw Error('家园地图规格不一致');
 const cells=scene.terrainRows.map(row=>{if(row.length!==w)throw Error('地形行长度不一致');return [...row].map(c=>{if(!scene.terrainLegend[c])throw Error('未知地形 '+c);return scene.terrainLegend[c]})});
 const assets=new Map(manifest.assets.map(a=>[a.id,a]));
 if(assets.size!==manifest.assets.length)throw Error('重复的素材 ID');
 const ids=new Set();const objects=scene.objects.map(o=>{
  if(ids.has(o.id))throw Error('重复的对象 ID');ids.add(o.id);
  const asset=assets.get(o.asset);if(!asset)throw Error('未找到素材 '+o.asset);
  if(!o.at.every(Number.isFinite)||o.at.length!==2)throw Error('对象锚点无效 '+o.id);
  return {...o,asset,ground:[o.at[0]*32,o.at[1]*32]};
 });
 const tiles=cells.flatMap((row,y)=>row.map((_,x)=>{const id=tileId(cells,x,y),tile=manifest.terrain.tiles[id];if(!tile)throw Error('缺少连接瓦片 '+id);return {id,x,y,tile}}));
 return {size:scene.size,cells,tiles,objects,assets};
}
export function objectRect(o){return [o.ground[0]-o.asset.anchor[0],o.ground[1]-o.asset.anchor[1],...o.asset.nativeSize];}
export function objectOrder(objects){return [...objects].sort((a,b)=>a.ground[1]-b.ground[1]||(a.asset.priority||0)-(b.asset.priority||0)||a.id.localeCompare(b.id));}
export function worldBounds(world){let x0=0,y0=0,x1=world.size[0]*32,y1=world.size[1]*32;for(const o of world.objects){const [x,y]=objectRect(o),[bx,by,bw,bh]=o.asset.visualBounds;x0=Math.min(x0,x+bx);y0=Math.min(y0,y+by);x1=Math.max(x1,x+bx+bw);y1=Math.max(y1,y+by+bh)}return {x0:x0-12,y0:y0-12,x1:x1+12,y1:y1+12};}
export function fitCamera(world,width,height){const b=worldBounds(world),scale=ZOOMS.filter(s=>(b.x1-b.x0)*s<=width&&(b.y1-b.y0)*s<=height).at(-1)||.5;return {x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2,scale};}
export function constrainCamera(camera,world,width,height){const b=worldBounds(world),limit=(v,lo,hi,visible)=>visible>=hi-lo?(lo+hi)/2:Math.max(lo+visible*.2,Math.min(hi-visible*.2,v));return {...camera,x:limit(camera.x,b.x0,b.x1,width/camera.scale),y:limit(camera.y,b.y0,b.y1,height/camera.scale)};}

import {objectOrder,objectRect} from './world.js';
export const MANIFEST_URL='/assets/growth-p2-homestead/manifest.json';
export async function loadHomesteadAssets(){
 const response=await fetch(MANIFEST_URL);if(!response.ok)throw Error('素材清单加载失败（'+response.status+'）');
 const manifest=await response.json();
 if(manifest.version!=='p2-b-v1'||!manifest.assets?.length||!manifest.terrain?.atlas)throw Error('家园素材清单不完整');
 const images=new Map();const descriptors=[{id:'terrain',name:'地形图集',png:manifest.terrain.atlas,nativeSize:manifest.terrain.size},...manifest.assets];
 await Promise.all(descriptors.map(d=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{if(image.naturalWidth!==d.nativeSize[0]||image.naturalHeight!==d.nativeSize[1]){reject(Error(d.name+'的原生尺寸与清单不符'));return}images.set(d.id,image);resolve()};image.onerror=()=>reject(Error(d.name+'资源加载失败，请检查本地服务后重试'));image.src=d.png})));
 return {manifest,images};
}
function shadow(ctx,o){
 const [x,y]=o.ground;let rx=8,ry=2;
 if(o.asset.type==='building'){rx=42;ry=8}else if(o.asset.type==='tree'){rx=o.asset.id==='oak-broad'?27:21;ry=8}else if(o.asset.id==='bush'){rx=16;ry=4}else if(o.asset.id==='rock'){rx=12;ry=3}else if(o.asset.id==='fence-horizontal'){rx=28;ry=2}else if(o.asset.id==='fence-vertical'){rx=4;ry=15}
 ctx.fillStyle='rgba(38,51,45,.18)';for(let yy=-ry;yy<=ry;yy++)for(let xx=-rx;xx<=rx;xx++)if((xx/rx)**2+(yy/ry)**2<=1)ctx.fillRect(x+xx+4,y+yy+3,1,1);
}
export function drawWorld(ctx,world,resources,{grid=false}={}){
 ctx.imageSmoothingEnabled=false;
 const atlas=resources.images.get('terrain');for(const t of world.tiles){const [sx,sy,w,h]=t.tile.frame;ctx.drawImage(atlas,sx,sy,w,h,t.x*32,t.y*32,32,32)}
 for(const o of world.objects)shadow(ctx,o);
 if(grid){ctx.fillStyle='rgba(38,51,45,.2)';for(let x=0;x<=world.size[0];x++)ctx.fillRect(x*32,0,1,world.size[1]*32);for(let y=0;y<=world.size[1];y++)ctx.fillRect(0,y*32,world.size[0]*32,1);
  const home=world.objects.find(o=>o.id==='home');if(home){ctx.fillStyle='#e2bd86';const x=home.ground[0]-48,y=home.ground[1]-64;ctx.fillRect(x,y,96,1);ctx.fillRect(x,y+63,96,1);ctx.fillRect(x,y,1,64);ctx.fillRect(x+95,y,1,64)}}
 for(const o of objectOrder(world.objects)){const [x,y]=objectRect(o);ctx.drawImage(resources.images.get(o.asset.id),x,y)}
}
export function paintHomestead(ctx,world,resources,camera,width,height,options={}){
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#e8e7d3';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=false;
 const origin=[Math.round(width/2-camera.x*camera.scale),Math.round(height/2-camera.y*camera.scale)];
 ctx.save();ctx.translate(...origin);ctx.scale(camera.scale,camera.scale);drawWorld(ctx,world,resources,options);ctx.restore();return origin;
}

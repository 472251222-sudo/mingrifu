// Asset compositing and a simple original diagnostic grass tile; the house itself is entirely Blender output.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,constants} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{PNG}=require(process.env.PNGJS_MODULE||'pngjs');
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(process.argv[2]||resolve(here,'delivery')),out=resolve(process.argv[3]||resolve(here,'previews'));
mkdirSync(out,{recursive:true});
const read=p=>PNG.sync.read(readFileSync(resolve(root,p))),save=(name,png)=>writeFileSync(resolve(out,name),PNG.sync.write(png),{flag:'wx'});
const original=read('cabin-terracotta-sprite.png'),blue=read('deep-blue/cabin-deep-blue-sprite.png');
const pixel=(png,x,y,rgba)=>{if(x>=0&&y>=0&&x<png.width&&y<png.height)png.data.set(rgba,(y*png.width+x)*4)};
const rgb=hex=>[...Buffer.from(hex.slice(1),'hex'),255];
function upscale(image,n){const result=new PNG({width:image.width*n,height:image.height*n});for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++){const p=(Math.floor(y/n)*image.width+Math.floor(x/n))*4;pixel(result,x,y,image.data.subarray(p,p+4))}return result}
function paste(target,image,x0,y0){for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const p=(y*image.width+x)*4;if(image.data[p+3])pixel(target,x+x0,y+y0,image.data.subarray(p,p+4))}}
function checker(w,h){const result=new PNG({width:w,height:h});for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixel(result,x,y,rgb((Math.floor(x/16)+Math.floor(y/16))%2?'#dce3d2':'#edf0e6'));return result}
save('cabin-close-4x.png',upscale(original,4));
save('blue-close-4x.png',upscale(blue,4));
const comparison=checker(824,544);paste(comparison,upscale(original,4),16,16);paste(comparison,upscale(blue,4),424,16);save('roof-comparison-4x.png',comparison);

// Border pixels share one base colour. Small blade clusters stay away from edges.
const grass=new PNG({width:32,height:32});grass.data.fill(0);
for(let y=0;y<32;y++)for(let x=0;x<32;x++)pixel(grass,x,y,rgb('#7da55e'));
for(const [x,y,k] of [[5,6,0],[18,5,1],[25,13,0],[11,17,1],[5,25,0],[23,26,1]]){
 const dark=rgb(k?'#75835a':'#588455'),light=rgb('#a9c36e');
 pixel(grass,x,y,dark);pixel(grass,x+1,y-1,dark);pixel(grass,x+2,y,dark);pixel(grass,x+2,y-2,light);pixel(grass,x+3,y-1,light);
}
save('diagnostic-grass-32.png',grass);
const placement={tileSize:32,worldCells:[10,8],origin:[3,4],footprint:[3,2],spriteAnchor:[48,112],worldAnchor:[144,192],spriteTopLeft:[96,80],
  groundProjection:'orthogonal-square',cameraAzimuthDegrees:0,cameraElevationDegrees:38,
  groundSource:'original deterministic diagnostic tile, not a production tileset',
  castShadow:'separate stylized scene-compositing layer, not baked into sprite',
  detail:'Sprite depth is intentionally foreshortened; 3x2 logical placement does not imply physically identical Y scale to a square ground tile.'};
function scene(sprite,grid){const result=new PNG({width:320,height:256});for(let y=0;y<256;y++)for(let x=0;x<320;x++){const p=((y%32)*32+x%32)*4;pixel(result,x,y,grass.data.subarray(p,p+4))}
 // A restrained contact/cast shadow, kept outside the transparent game sprite.
 for(let y=174;y<=198;y++)for(let x=104;x<=202;x++){
  if(((x-154)/47)**2+((y-186)/11)**2>1)continue;
  const p=(y*result.width+x)*4;for(let c=0;c<3;c++)result.data[p+c]=Math.round(result.data[p+c]*.80);
 }
 if(grid){for(let y=0;y<256;y++)for(let x=0;x<320;x++)if(x%32===0||y%32===0){const p=(y*320+x)*4;for(let c=0;c<3;c++)result.data[p+c]=Math.round(result.data[p+c]*.9)}
  for(let x=96;x<=192;x++){pixel(result,x,128,rgb('#e2bd86'));pixel(result,x,192,rgb('#e2bd86'))}for(let y=128;y<=192;y++){pixel(result,96,y,rgb('#e2bd86'));pixel(result,192,y,rgb('#e2bd86'))}
 }
 paste(result,sprite,96,80);return result}
for(const [name,sprite] of [['terracotta',original],['deep-blue',blue]])for(const grid of [false,true]){
 const image=scene(sprite,grid);save('scene-'+name+(grid?'-grid':'')+'-1x.png',image);save('scene-'+name+(grid?'-grid':'')+'-2x.png',upscale(image,2));
}
const old=resolve(here,'../../growth-p1.1/sample-cabin.png');copyFileSync(old,resolve(out,'old-p11-cabin.png'),constants.COPYFILE_EXCL);
copyFileSync(resolve(root,'model-preview.png'),resolve(out,'blender-model-preview.png'),constants.COPYFILE_EXCL);
writeFileSync(resolve(out,'placement.json'),JSON.stringify(placement,null,2)+'\n',{flag:'wx'});
const seam=[];for(let i=0;i<32;i++){for(const [a,b] of [[i*32,(i*32+31)], [i,(31*32+i)]])if(!grass.data.subarray(a*4,a*4+4).equals(grass.data.subarray(b*4,b*4+4)))seam.push(i)}
writeFileSync(resolve(out,'grass-seam-check.json'),JSON.stringify({size:[32,32],matchingBorderPairs:64-seam.length,failedPairs:seam.length,productionTerrainApproved:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({previews:out,groundSeamFailedPairs:seam.length,placement}));

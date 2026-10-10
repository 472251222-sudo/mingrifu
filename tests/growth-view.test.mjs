import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, applyWorldCommand } from '../src/growth/world.js';
import { allCells } from '../src/growth/grid.js';
import { constrainCamera, project, viewOrigin, fitCamera, mapExtents } from '../src/growth/view.js';
import { alphaAt } from '../src/growth/scene.js';

test('camera bounds retain visible unlocked ground after large cardinal and diagonal pans', () => {
  let world = createWorld();
  for (const chunk of [{x:0,y:-1},{x:1,y:0},{x:2,y:0}]) world = applyWorldCommand(world, { type:'expand', ...chunk });
  const before = structuredClone(world), size = { width: 298, height: 330 };
  for (const scale of [.0625,.5,1,2,4]) for (const [centerX,centerY] of [[-10000,-10000],[10000,10000],[10000,-10000],[-10000,10000],[10000,0],[0,10000]]) {
    const camera = constrainCamera({centerX,centerY,scale},world,size), origin = viewOrigin(camera,size);
    assert.ok(allCells(world).some(c => {const p=project(c.x+.5,c.y+.5);const x=origin.x+p.x*scale,y=origin.y+p.y*scale;return x>5&&x<size.width-5&&y>5&&y<size.height-5;}));
  }
  assert.deepEqual(world,before);
});
test('soft drag resistance is bounded and settles without changing zoom', () => {
  const world=createWorld(),size={width:300,height:350},requested={centerX:9999,centerY:9999,scale:2};
  const soft=constrainCamera(requested,world,size,null,true), settled=constrainCamera(requested,world,size);
  assert.ok(Math.abs(soft.centerX-settled.centerX)<=4);assert.ok(Math.abs(soft.centerY-settled.centerY)<=4);assert.equal(soft.scale,2);
});
test('camera still permits viewing remote unlocked chunks at close zoom',()=>{
  let world=createWorld();for(let x=1;x<=4;x++)world=applyWorldCommand(world,{type:'expand',x,y:0});
  const p=project(36,4),camera={centerX:p.x,centerY:p.y,scale:4};assert.deepEqual(constrainCamera(camera,world,{width:298,height:330}),camera);
});
test('fit accepts all expansion candidates without mutating the unlocked world',()=>{
  const world=createWorld(),regions=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}],size={width:298,height:330};
  const camera=fitCamera(world,size,regions),origin=viewOrigin(camera,size),bounds=mapExtents(world,regions);
  assert.ok(origin.x+bounds.minX*camera.scale>=15);assert.ok(origin.x+bounds.maxX*camera.scale<=size.width-15);assert.equal(world.chunks.length,1);
});
test('alpha hit maps opaque sprite pixels using the rounded rendering rectangle',()=>{
  const data=new Uint8ClampedArray(2*2*4);data[3]=255;data[15]=255;
  for(const scale of [.5,1,2,4]){const rect={x:37,y:-11,width:2*scale,height:2*scale};assert.equal(alphaAt(data,2,2,rect,37+.1*scale,-11+.1*scale),255);assert.equal(alphaAt(data,2,2,rect,37+1.5*scale,-11+.2*scale),0);assert.equal(alphaAt(data,2,2,rect,37+1.5*scale,-11+1.5*scale),255);assert.equal(alphaAt(data,2,2,rect,rect.x+rect.width,rect.y),0);}
});

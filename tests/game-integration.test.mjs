import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyGameCommand, createGameWorld} from '../src/growth/game/world.js';
import * as view from '../src/growth/game/scene.js';
const manifest=JSON.parse(readFileSync(new URL('../public/assets/growth-p2-homestead/manifest.json',import.meta.url)));
const effort=minutes=>({type:'effort',event:{id:`integration-${minutes}`,source:'simulation',minutes,occurredAt:'2026-10-14T10:00:00.000Z'}});
test('growth feedback distinguishes ecological steps from final changed plants',()=>{
 const before=createGameWorld(),after=applyGameCommand(before,effort(100));
 const summary=view.gameChangeSummary(before,after);
 assert.equal(summary.xp,100);assert.equal(summary.bp,20);assert.equal(summary.ecologySteps,2);assert.equal(summary.natureChanged,1);assert.equal(summary.changed,true);
});
test('no-op effort feedback never announces new resources or ecological progress',()=>{
 const world=applyGameCommand(createGameWorld(),effort(25)),same=applyGameCommand(world,effort(25));
 assert.deepEqual(view.gameChangeSummary(world,same),{changed:false,xp:0,bp:0,ecologySteps:0,natureChanged:0});
});
test('free adjustments and paid building feedback leave permanent XP unchanged',()=>{
 const world=applyGameCommand(createGameWorld(),effort(25)),stored=applyGameCommand(world,{type:'store',id:'o-1'}),built=applyGameCommand(stored,{type:'build',assetId:'wildflowers',x:5,y:5});
 assert.equal(view.gameChangeSummary(world,stored).xp,0);assert.equal(view.gameChangeSummary(world,stored).bp,0);assert.equal(view.gameChangeSummary(stored,built).bp,-2);
});
test('expansion preview extends overview into negative candidates without granting tiles or moving objects',()=>{
 const scene=view.worldToScene(createGameWorld(),manifest),next=view.withExpansionBounds(scene,[{x:0,y:-1},{x:-1,y:0}]);
 assert.ok(next.bounds.y0<=-256&&next.bounds.x0<=-256);assert.equal(next.tiles.length,64);assert.strictEqual(next.objects,scene.objects);assert.ok(scene.bounds.y0>-256);
 const camera=view.fitSceneCamera(next,298,339);assert.ok((next.bounds.x1-next.bounds.x0)*camera.scale<=298);assert.ok((next.bounds.y1-next.bounds.y0)*camera.scale<=339);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGameWorld} from '../src/growth/game/world.js';
import * as view from '../src/growth/game/scene.js';
import * as rendering from '../src/growth/game/renderer.js';

const manifest = JSON.parse(readFileSync(new URL('../public/assets/growth-p2-homestead/manifest.json', import.meta.url)));

test('initial cabin maps logical footprint to the original sprite ground anchor', () => {
  const scene = view.worldToScene(createGameWorld(), manifest);
  assert.equal(scene.tiles.length, 64);
  const cabin = scene.objects.find(object => object.id === 'o-1');
  assert.deepEqual(cabin.ground, [112, 128]);
  assert.deepEqual(view.spriteRect(cabin), [64, 16, 96, 128]);
  assert.equal(cabin.asset.status, 'approved');
  assert.equal(cabin.kind, 'artificial');
  assert.equal(scene.objects.filter(object => object.kind === 'natural').length, 5);
});

test('sparse negative chunks draw only owned cells and join path tiles across a chunk seam', () => {
  const world = createGameWorld();
  world.chunks = [{x: -1, y: 0}, {x: 0, y: 0}, {x: 2, y: -2}];
  world.path = [{x: -1, y: 0}, {x: 0, y: 0}];
  const scene = view.worldToScene(world, manifest);
  assert.equal(scene.tiles.length, 192);
  assert.equal(scene.tiles.find(tile => tile.x === -1 && tile.y === 0).id, 'path-2');
  assert.equal(scene.tiles.find(tile => tile.x === 0 && tile.y === 0).id, 'path-8');
  assert.equal(scene.tiles.some(tile => tile.x === 8 && tile.y === 0), false);
  assert.ok(scene.bounds.x0 <= -256 && scene.bounds.x1 >= 768);
  assert.ok(scene.bounds.y0 <= -512 && scene.bounds.y1 >= 256);
});

test('stored objects disappear from scene while unknown resources fail clearly', () => {
  const world = createGameWorld();
  world.objects[0] = {...world.objects[0], stored: true, x: null, y: null};
  assert.equal(view.worldToScene(world, manifest).objects.some(object => object.id === 'o-1'), false);
  world.nature[0].asset = 'missing-resource';
  assert.throws(() => view.worldToScene(world, manifest), /素材/);
});

const object = (id, groundY, x = 0) => ({id, x, y: 0, kind: 'artificial', assetId: id, ground: [0, groundY], asset: {id, anchor: [0, groundY], nativeSize: [64, 64], footprint: [1, 1], priority: 0}});
const mask = opaque => {const alpha = new Uint8Array(64 * 64); for (const [x, y] of opaque) alpha[y * 64 + x] = 255; return {width: 64, height: 64, alpha};};

test('frontmost visible alpha wins before a rear footprint fallback', () => {
  const rear = object('rear', 0), front = object('front', 32, 1);
  const masks = new Map([['rear', mask([])], ['front', mask([[10, 10]])]]);
  assert.equal(view.hitScene({objects: [rear, front]}, {x: 10, y: 10}, masks).id, 'front');
});

test('screen raster alpha takes priority over a mismatching original texel and rear occupancy', () => {
  const rear = object('rear', 0), front = object('front', 32, 1);
  const masks = new Map([['rear', mask([[10,10]])], ['front', mask([])]]);
  assert.equal(view.hitScene({objects: [rear, front]}, {x: 10, y: 10}, masks, item => item.id === 'front').id, 'front');
  assert.equal(view.hitScene({objects: [rear, front]}, {x: 10, y: 10}, masks, () => false).id, 'rear', 'when screen alpha is transparent, actual ground still provides the secondary hit');
});

test('transparent sprite margins do not select and actual occupied ground remains a fallback', () => {
  const cabin = object('cabin', 0), masks = new Map([['cabin', mask([[4, 4]])]]);
  const scene = {objects: [cabin]};
  assert.equal(view.hitScene(scene, {x: 40, y: 5}, masks), null);
  assert.equal(view.hitScene(scene, {x: 4, y: 4}, masks).id, 'cabin');
  assert.equal(view.hitScene(scene, {x: 20, y: 20}, masks).id, 'cabin');
});

test('natural foreground alpha blocks a hidden artificial object without an invisible natural footprint', () => {
  const cabin = object('cabin', 0), tree = {...object('tree', 64), kind: 'natural'};
  const masks = new Map([['cabin', mask([[10, 10]])], ['tree', mask([[10, 10]])]]);
  assert.equal(view.hitScene({objects: [cabin, tree]}, {x: 10, y: 10}, masks).id, 'tree');
  assert.equal(view.hitScene({objects: [tree]}, {x: 20, y: 20}, masks), null);
});

test('external selection outlines exclude enclosed transparent holes', () => {
  const outline = rendering.externalOutline({width: 3, height: 3, alpha: Uint8Array.from([255,255,255,255,0,255,255,255,255])});
  assert.ok(outline.some(([x,y]) => x === -1 && y === 1));
  assert.ok(outline.some(([x,y]) => x === 3 && y === 1));
  assert.equal(outline.some(([x,y]) => x === 1 && y === 1), false);
});

test('moving preview replaces its source and stays behind foreground objects in real depth order', () => {
  const scene = view.worldToScene(createGameWorld(), manifest);
  const objects = rendering.composeRenderObjects(scene, {type: 'move', id: 'o-1', assetId: 'cabin-terracotta', x: 2, y: 0});
  assert.equal(objects.filter(item => item.id === 'o-1').length, 1);
  const preview = objects.find(item => item.id === 'o-1');
  assert.deepEqual(preview.ground, [112, 64]);
  assert.equal(preview.preview, true);
  assert.ok(objects.indexOf(preview) < objects.findIndex(item => item.id === 'n-3'));
});

test('screen conversion uses rounded camera origin consistently and floors negative grid positions', () => {
  const camera = {x: 0, y: 0, scale: 2};
  assert.deepEqual(view.cameraOrigin(camera, 320, 200), [160, 100]);
  assert.deepEqual(view.screenToWorld({x: 159, y: 99}, camera, 320, 200), {x: -.5, y: -.5});
  assert.deepEqual(view.screenToCell({x: 159, y: 99}, camera, 320, 200), {x: -1, y: -1});
});

test('overview can fit below half scale and below presets without dense map allocation', () => {
  const scene = {bounds: {x0: -50000, y0: -50000, x1: 50000, y1: 50000}};
  const camera = view.fitSceneCamera(scene, 280, 180);
  assert.ok(camera.scale < .125);
  assert.ok(100000 * camera.scale <= 180);
  assert.deepEqual({x: camera.x, y: camera.y}, {x: 0, y: 0});
  const zoomed = view.zoomSceneCamera(camera, 1, scene, 280, 180);
  assert.equal(zoomed.scale, .125);
});

test('soft camera bounds retain a portion of world and overview centres remain stable', () => {
  const scene = {bounds: {x0: -256, y0: 0, x1: 256, y1: 256}};
  const constrained = view.constrainSceneCamera({x: 1e8, y: -1e8, scale: 4}, scene, 320, 200);
  assert.ok(constrained.x < 256 && constrained.y > 0);
  const fit = view.fitSceneCamera(scene, 320, 200);
  assert.deepEqual(view.constrainSceneCamera({...fit, x: 1e8, y: -1e8}, scene, 320, 200), fit);
});

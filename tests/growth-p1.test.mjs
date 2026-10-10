import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BUILDINGS } from '../src/growth/buildings.js';
import { allCells, buildingAt, frontierChunks, hasCell, placementCheck } from '../src/growth/grid.js';
import { applyWorldCommand, createWorld, validateWorld } from '../src/growth/world.js';
import { loadWorld, saveWorld, STORAGE_KEY } from '../src/growth/persistence.js';
import { project, unproject, screenCell, fitCamera, viewOrigin, zoomLevels, stepZoom, mapExtents } from '../src/growth/view.js';

const now = '2026-10-09T04:00:00.000Z';
const apply = (world, command) => applyWorldCommand(world, command, now);
const place = (world, type = 'cottage', x = 2, y = 2, id) => apply(world, { type: 'place', buildingType: type, x, y, id });
const storage = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('isometric axes share one reversible projection including negative land', () => {
  assert.deepEqual(project(1, 0), { x: 12, y: 6 });
  assert.deepEqual(project(0, 1), { x: -12, y: 6 });
  for (const [x, y] of [[0, 0], [-8, -16], [3.5, -5.5], [100, 200]]) {
    const point = project(x, y); assert.deepEqual(unproject(point.x, point.y), { x, y });
  }
});
test('screen picking remains accurate after camera movement at every supported zoom', () => {
  const size = { width: 288, height: 365 };
  for (const scale of zoomLevels(createWorld(), size)) for (const [x, y] of [[0, 0], [7, 7], [1, -6], [-5, 2]]) {
    const camera = { centerX: -50, centerY: 20, scale }, origin = viewOrigin(camera, size), point = project(x + .5, y + .5);
    assert.deepEqual(screenCell(origin.x + point.x * scale, origin.y + point.y * scale, camera, size), { x, y });
  }
});
test('overview includes all land and sprite margins on desktop and narrow screens', () => {
  let world = createWorld();
  for (const region of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) world = apply(world, { type: 'expand', ...region });
  for (const size of [{ width: 800, height: 560 }, { width: 288, height: 365 }]) {
    const camera = fitCamera(world, size), origin = viewOrigin(camera, size), bounds = mapExtents(world);
    assert.ok(origin.x + bounds.minX * camera.scale >= 15);
    assert.ok(origin.x + bounds.maxX * camera.scale <= size.width - 15);
    assert.ok(origin.y + bounds.minY * camera.scale >= 15);
    assert.ok(origin.y + bounds.maxY * camera.scale <= size.height - 15);
  }
});
test('zoom supports both sides of 100 percent and clamps at the available limits', () => {
  const levels = zoomLevels(createWorld(), { width: 800, height: 560 });
  assert.equal(stepZoom(1, -1, levels), .75); assert.equal(stepZoom(.75, 1, levels), 1);
  assert.equal(stepZoom(levels[0], -1, levels), levels[0]); assert.equal(stepZoom(4, 1, levels), 4);
});
test('large-world overview adds smaller zoom levels without changing world data', () => {
  const world = { ...createWorld(), chunks: Array.from({ length: 180 }, (_, x) => ({ x, y: 0 })) }, before = structuredClone(world);
  const size = { width: 288, height: 365 }, levels = zoomLevels(world, size), camera = fitCamera(world, size, { x: 180, y: 0 });
  assert.ok(levels[0] < 1 / 16); assert.ok(camera.scale <= levels[0]);
  assert.deepEqual(world, before); assert.ok(Number.isFinite(camera.centerX));
});

test('initial world belongs to the person and contains exactly 8 × 8 cells', () => {
  const world = createWorld();
  assert.equal(allCells(world).length, 64); assert.equal(world.buildings.length, 0);
  assert.equal(validateWorld(world), world);
  assert.ok(!('goals' in world)); assert.ok(!('tasks' in world)); assert.ok(!('goalId' in world));
});
test('four building configurations have valid footprint and reusable atlas sprites', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/assets/growth-p1/manifest.json', import.meta.url), 'utf8'));
  for (const building of Object.values(BUILDINGS)) {
    const sprite = manifest.sprites[building.sprite]; assert.ok(sprite);
    const png = await readFile(new URL(`../public/assets/growth-p1/${sprite.file}`, import.meta.url));
    assert.ok(sprite.x + sprite.width <= png.readUInt32BE(16)); assert.ok(sprite.y + sprite.height <= png.readUInt32BE(20));
  }
});
test('placing creates a grid-aligned building without mutating the input world', () => {
  const world = createWorld(), before = structuredClone(world), next = place(world);
  assert.deepEqual(world, before); assert.equal(next.buildings[0].x, 2); assert.equal(next.buildings[0].y, 2);
  assert.equal(next.revision, 1); assert.equal(next.updatedAt, now); assert.equal(validateWorld(next), next);
});
test('full footprint is checked against all four edges and fractional positions', () => {
  const world = createWorld();
  for (const [x, y] of [[-1, 0], [0, -1], [7, 0], [0, 7], [2.5, 2], [NaN, 2]]) assert.throws(() => place(world, 'cottage', x, y));
  assert.equal(placementCheck(world, 'cottage', 6, 6).valid, true);
});
test('partial overlap is rejected; a neighboring footprint is allowed', () => {
  const world = place(createWorld());
  assert.throws(() => place(world, 'library', 3, 3), /重叠/);
  assert.equal(placementCheck(world, 'library', 4, 2).valid, true);
  assert.equal(buildingAt(world, 3, 3).id, world.buildings[0].id);
});
test('moving keeps identity, excludes its old footprint, and protects other buildings', () => {
  let world = place(place(createWorld()), 'cafe', 4, 4);
  const [first, second] = world.buildings;
  world = place(world, 'cottage', 3, 2, first.id);
  assert.equal(world.buildings.length, 2); assert.equal(world.buildings[0].id, first.id);
  assert.deepEqual(world.buildings[1], second); assert.throws(() => place(world, 'cottage', 4, 4, first.id), /重叠/);
});
test('storage and replacement preserve the same object rather than duplicating it', () => {
  let world = place(createWorld()), id = world.buildings[0].id;
  world = apply(world, { type: 'store', id });
  assert.equal(world.buildings[0].stored, true); assert.equal(world.buildings[0].x, null);
  assert.equal(buildingAt(world, 2, 2), undefined); validateWorld(world);
  world = place(world, 'cottage', 5, 3, id);
  assert.equal(world.buildings.length, 1); assert.equal(world.buildings[0].id, id); assert.equal(world.buildings[0].stored, false);
});
test('invalid building IDs and types cannot create unintended objects', () => {
  assert.throws(() => place(createWorld(), '__proto__'));
  assert.throws(() => place(createWorld(), 'cottage', 2, 2, 'missing'));
  assert.throws(() => apply(createWorld(), { type: 'store', id: 'missing' }));
});
test('manual construction clears nature only inside its own footprint', () => {
  const world = createWorld(), next = place(world, 'cottage', 0, 0);
  assert.ok(world.nature.some(n => n.x === 0 && n.y === 1));
  assert.ok(!next.nature.some(n => n.x === 0 && n.y === 1));
  assert.deepEqual(next.nature, world.nature.filter(n => !(n.x < 2 && n.y < 2)));
});
test('repeated simulated growth never moves or overwrites buildings', () => {
  let world = place(createWorld()); const buildings = structuredClone(world.buildings);
  for (let i = 0; i < 150; i++) { world = apply(world, { type: 'grow' }); validateWorld(world); assert.deepEqual(world.buildings, buildings); }
  assert.equal(world.growth.step, 150); assert.ok(world.nature.length > 7);
});
test('a fully occupied map refuses growth without changing the world', () => {
  let world = createWorld();
  for (let x = 0; x < 8; x += 2) for (let y = 0; y < 8; y += 2) world = place(world, 'cottage', x, y);
  const before = structuredClone(world); assert.throws(() => apply(world, { type: 'grow' }), /土地已经/); assert.deepEqual(world, before);
});
test('each cardinal expansion adds exactly 64 connected cells without changing existing content', () => {
  const initial = place(createWorld());
  for (const region of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
    const world = apply(initial, { type: 'expand', ...region });
    assert.equal(allCells(world).length, 128); assert.deepEqual(world.buildings, initial.buildings); assert.deepEqual(world.nature, initial.nature); validateWorld(world);
    assert.ok(hasCell(world, region.x * 8, region.y * 8));
  }
});
test('expanded land supports placement across a continuous chunk seam', () => {
  const east = apply(createWorld(), { type: 'expand', x: 1, y: 0 });
  validateWorld(place(east, 'cottage', 7, 3));
  const west = apply(createWorld(), { type: 'expand', x: -1, y: 0 });
  validateWorld(place(west, 'cottage', -1, 3)); assert.ok(hasCell(west, -8, 0)); assert.ok(!hasCell(west, -9, 0));
});
test('diagonal, distant and duplicate expansions are rejected', () => {
  for (const region of [{ x: 1, y: 1 }, { x: 2, y: 0 }, { x: 0, y: 0 }]) assert.throws(() => apply(createWorld(), { type: 'expand', ...region }), /相邻/);
  let world = apply(createWorld(), { type: 'expand', x: 1, y: 0 }); world = apply(world, { type: 'expand', x: 1, y: -1 });
  assert.equal(new Set(frontierChunks(world).map(c => `${c.x},${c.y}`)).size, frontierChunks(world).length); validateWorld(world);
});
test('save/load restore buildings, inventory, nature and expanded coordinates exactly', () => {
  const disk = storage(); let world = place(createWorld()); world = apply(world, { type: 'store', id: world.buildings[0].id });
  world = apply(apply(world, { type: 'grow' }), { type: 'expand', x: 0, y: -1 });
  const token = saveWorld(disk, world, null); const loaded = loadWorld(disk);
  assert.deepEqual(loaded.world, world); assert.equal(loaded.token, token);
});
test('prototype writes never overwrite V3 storage namespaces', () => {
  const disk = storage(); disk.setItem('mingrifu-v3-demo-1', 'existing V3'); disk.setItem('mingrifu-v3-demo-1-draft', 'existing draft');
  saveWorld(disk, place(createWorld()), null);
  assert.equal(disk.getItem('mingrifu-v3-demo-1'), 'existing V3'); assert.equal(disk.getItem('mingrifu-v3-demo-1-draft'), 'existing draft');
  assert.match(STORAGE_KEY, /p1-v1$/);
});
test('quota failure preserves saved state, and the same candidate can be retried', () => {
  const disk = storage(), original = saveWorld(disk, createWorld(), null), candidate = place(createWorld()), writer = disk.setItem;
  disk.setItem = () => { throw new Error('quota'); }; assert.throws(() => saveWorld(disk, candidate, original), /quota/);
  assert.equal(disk.getItem(STORAGE_KEY), original); assert.equal(candidate.buildings.length, 1);
  disk.setItem = writer; saveWorld(disk, candidate, original); assert.deepEqual(loadWorld(disk).world, candidate);
});
test('concurrent save refuses to overwrite a newer tab', () => {
  const disk = storage(), token = saveWorld(disk, createWorld(), null);
  const winner = place(createWorld()), newer = saveWorld(disk, winner, token);
  assert.throws(() => saveWorld(disk, apply(createWorld(), { type: 'grow' }), token), /另一页面/); assert.equal(disk.getItem(STORAGE_KEY), newer);
});
test('corrupt and future-version saves are preserved, without seeding or writing', () => {
  const disk = storage();
  for (const invalid of ['broken JSON', JSON.stringify({ ...createWorld(), version: 999 })]) {
    disk.setItem(STORAGE_KEY, invalid); assert.throws(() => loadWorld(disk)); assert.equal(disk.getItem(STORAGE_KEY), invalid);
  }
});
test('invalid restored overlap, detached regions and IDs are rejected', () => {
  const valid = place(createWorld());
  const overlap = structuredClone(valid); overlap.buildings.push({ ...overlap.buildings[0], id: 'b-9' }); overlap.nextId = 10;
  const detached = createWorld(); detached.chunks.push({ x: 9, y: 9 });
  const duplicate = createWorld(); duplicate.chunks.push({ x: 0, y: 0 });
  const natureCollision = structuredClone(valid); natureCollision.nature[0] = { ...natureCollision.nature[0], x: 2, y: 2 };
  const reusedId = structuredClone(valid); reusedId.nextId = 8;
  for (const invalid of [overlap, detached, duplicate, natureCollision, reusedId]) assert.throws(() => validateWorld(invalid));
});

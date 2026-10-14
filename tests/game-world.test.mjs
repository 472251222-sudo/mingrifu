import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ASSETS, BALANCE, stageForXP} from '../src/growth/game/balance.js';
import {createGameWorld, applyGameCommand, validateGameWorld} from '../src/growth/game/world.js';
import {footprintCells, hasWorldCell, frontierChunks, placementCheck} from '../src/growth/game/spatial.js';

const copy = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function rejectAtomic(world, command, message) {
  const snapshot = copy(world);
  assert.throws(() => applyGameCommand(freeze(world), command), message);
  assert.deepEqual(world, snapshot, 'rejection must not mutate any original state');
}
function unlockedWorld(xp = 120) {
  const world = createGameWorld();
  world.xp = xp;
  let remaining = xp;
  while (remaining) {
    const minutes = Math.min(remaining, 180);
    world.efforts.push({id: `fixture-${world.efforts.length}`, source: 'simulation', minutes, occurredAt: '2026-10-14T00:00:00.000Z'});
    remaining -= minutes;
  }
  return world;
}

test('catalog uses actual asset IDs, names and footprints and the confirmed prices', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/assets/growth-p2-homestead/manifest.json', import.meta.url)));
  const costs = {'cabin-terracotta': 24, 'grass-tuft': 1, wildflowers: 2, bush: 4, rock: 3, 'oak-broad': 10, 'pine-slender': 10, 'fence-horizontal': 3, 'fence-vertical': 3, mailbox: 6};
  assert.deepEqual(Object.keys(ASSETS).sort(), manifest.assets.map(asset => asset.id).sort());
  for (const asset of manifest.assets) {
    assert.deepEqual(ASSETS[asset.id].footprint, asset.footprint);
    assert.equal(ASSETS[asset.id].name, asset.name);
    assert.equal(ASSETS[asset.id].id, asset.id);
    assert.equal(ASSETS[asset.id].cost, costs[asset.id]);
  }
  assert.equal(BALANCE.tileSize, 32);
  assert.equal(BALANCE.chunkSize, 8);
  assert.ok(Object.isFrozen(ASSETS.wildflowers.footprint));
  assert.ok(Object.isFrozen(BALANCE.initial));
});

test('stages are derived from permanent XP at both exact boundaries', () => {
  assert.equal(stageForXP(0).name, '萌芽');
  assert.equal(stageForXP(119).nextXP, 120);
  assert.equal(stageForXP(120).name, '扎根');
  assert.equal(stageForXP(299).nextXP, 300);
  assert.equal(stageForXP(300).name, '丰茂');
  assert.equal(stageForXP(1000).nextXP, null);
  for (const xp of [-1, 0.5, NaN, Infinity, '120', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => stageForXP(xp), /XP/);
  assert.equal(ASSETS['oak-broad'].unlockXP, 120);
  assert.equal(ASSETS['pine-slender'].unlockXP, 300);
  for (const id of ['fence-horizontal', 'fence-vertical', 'mailbox']) assert.equal(ASSETS[id].unlockXP, 120);
});

test('new world has the configured gift, protected path, sparse nature and no consumed progress', () => {
  const world = createGameWorld();
  assert.equal(validateGameWorld(world), world);
  assert.deepEqual({schemaVersion: world.schemaVersion, revision: world.revision, nextId: world.nextId, xp: world.xp, bp: world.bp}, {schemaVersion: 1, revision: 0, nextId: 7, xp: 0, bp: 30});
  assert.deepEqual(world.chunks, [{x: 0, y: 0}]);
  assert.deepEqual(world.efforts, []);
  assert.deepEqual(world.objects, [{id: 'o-1', asset: 'cabin-terracotta', x: 2, y: 2, stored: false}]);
  assert.deepEqual(world.path, [4, 5, 6, 7].map(y => ({x: 3, y})));
  assert.deepEqual(world.nature.map(({asset, x, y, stage}) => ({asset, x, y, stage})), [
    {asset: 'oak-broad', x: 0, y: 2, stage: 'mature'},
    {asset: 'pine-slender', x: 6, y: 3, stage: 'mature'},
    {asset: 'grass-tuft', x: 0, y: 6, stage: 'young'},
    {asset: 'grass-tuft', x: 6, y: 6, stage: 'young'},
    {asset: 'wildflowers', x: 2, y: 5, stage: 'static'},
  ]);
  const second = createGameWorld();
  world.objects[0].x = 0;
  world.path[0].y = 0;
  assert.equal(second.objects[0].x, 2);
  assert.equal(second.path[0].y, 4);
});

test('footprints use the complete square grid, not sprite canvas dimensions', () => {
  assert.deepEqual(footprintCells('cabin-terracotta', 2, 2), [{x: 2, y: 2}, {x: 3, y: 2}, {x: 4, y: 2}, {x: 2, y: 3}, {x: 3, y: 3}, {x: 4, y: 3}]);
  assert.deepEqual(footprintCells('fence-vertical', -1, -1), [{x: -1, y: -1}, {x: -1, y: 0}]);
  for (const point of [[1.5, 0], [Number.MAX_SAFE_INTEGER, 0]]) assert.throws(() => footprintCells('bush', ...point), /位置|坐标/);
  assert.throws(() => footprintCells('toString', 0, 0), /素材|对象/);
});

test('world cells and frontier include all four directions and negative chunk coordinates', () => {
  const world = createGameWorld();
  assert.equal(hasWorldCell(world, 7, 7), true);
  for (const point of [[8, 0], [-1, 0], [0, -1], [0.5, 0], [NaN, 0]]) assert.equal(hasWorldCell(world, ...point), false);
  assert.deepEqual(frontierChunks(world), [{x: 0, y: -1}, {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}]);
  world.chunks.push({x: -1, y: 0});
  assert.equal(hasWorldCell(world, -8, 0), true);
  assert.equal(hasWorldCell(world, -9, 0), false);
  const frontier = frontierChunks(world);
  assert.equal(frontier.filter(chunk => chunk.x === -1 && chunk.y === -1).length, 1);
  assert.ok(!frontier.some(chunk => chunk.x === 0 && chunk.y === 0));
});

test('placement checks space only and never consume BP, unlock content or remove vegetation', () => {
  const world = freeze(createGameWorld());
  const before = copy(world);
  assert.equal(placementCheck(world, 'wildflowers', 0, 6).ok, true);
  assert.equal(placementCheck(world, 'oak-broad', 0, 0).ok, true, 'locked content can still show a spatial preview');
  assert.deepEqual(world, before);
  assert.equal(placementCheck(world, 'wildflowers', 2, 2).ok, false);
  assert.equal(placementCheck(world, 'cabin-terracotta', 6, 6).ok, false);
  assert.equal(placementCheck(world, 'wildflowers', 2, 2, 'o-1').ok, true);
  for (const point of [[1.5, 0], [Infinity, 0], [null, 0]]) assert.equal(placementCheck(world, 'bush', ...point).ok, false);
  assert.equal(placementCheck(world, '__proto__', 0, 0).ok, false);
});

test('a confirmed flower costs BP once, increments revision and allocates a stable ID', () => {
  const original = freeze(createGameWorld());
  const next = applyGameCommand(original, {type: 'build', assetId: 'wildflowers', x: 0, y: 0});
  assert.notEqual(next, original);
  assert.equal(next.bp, 28);
  assert.equal(next.xp, 0);
  assert.equal(next.revision, 1);
  assert.equal(next.nextId, 8);
  assert.deepEqual(next.objects.at(-1), {id: 'o-7', asset: 'wildflowers', x: 0, y: 0, stored: false});
  assert.equal(validateGameWorld(next), next);
  assert.equal(original.objects.length, 1);
  assert.equal(original.bp, 30);
});

test('legal confirmed placement clears complete intersecting natural footprints only', () => {
  const world = freeze(createGameWorld());
  const next = applyGameCommand(world, {type: 'build', assetId: 'wildflowers', x: 1, y: 3});
  assert.ok(!next.nature.some(item => item.asset === 'oak-broad'), 'oak occupies 2x2 and must yield even at its bottom-right cell');
  assert.equal(next.nature.length, world.nature.length - 1);
  assert.deepEqual(next.path, world.path);
  assert.equal(world.nature.length, 5);
  assert.equal(validateGameWorld(next), next);
});

test('unknown, out-of-bounds and overlapping builds reject atomically with meaningful messages', () => {
  rejectAtomic(createGameWorld(), {type: 'build', assetId: 'wildflowers', x: -1, y: 0}, /土地|越界|超出/);
  rejectAtomic(createGameWorld(), {type: 'build', assetId: 'cabin-terracotta', x: 6, y: 6}, /土地|越界|超出/);
  rejectAtomic(createGameWorld(), {type: 'build', assetId: 'wildflowers', x: 4, y: 3}, /重叠/);
  rejectAtomic(createGameWorld(), {type: 'build', assetId: 'unknown', x: 0, y: 0}, /素材|对象/);
  rejectAtomic(createGameWorld(), {type: 'build', assetId: '__proto__', x: 0, y: 0}, /素材|对象/);
  for (const x of [0.1, NaN, Infinity, null, '0', Number.MAX_SAFE_INTEGER]) rejectAtomic(createGameWorld(), {type: 'build', assetId: 'wildflowers', x, y: 0}, /位置|坐标/);
});

test('initial mature trees do not unlock their catalog entries and rejected builds preserve nature', () => {
  for (const assetId of ['oak-broad', 'pine-slender', 'fence-horizontal', 'fence-vertical', 'mailbox']) rejectAtomic(createGameWorld(), {type: 'build', assetId, x: 0, y: 0}, /解锁|XP/);
  const world = unlockedWorld();
  const next = applyGameCommand(world, {type: 'build', assetId: 'oak-broad', x: 0, y: 0});
  assert.equal(next.bp, 20);
  assert.equal(next.xp, 120);
  rejectAtomic(unlockedWorld(), {type: 'build', assetId: 'pine-slender', x: 0, y: 0}, /解锁|XP/);
});

test('insufficient BP leaves resources, IDs, nature and revision untouched', () => {
  const world = createGameWorld();
  world.bp = 1;
  rejectAtomic(world, {type: 'build', assetId: 'wildflowers', x: 0, y: 6}, /BP|建造点|不足/);
});

test('gift cabin move, storage and placement retain ID and are always free', () => {
  const world = createGameWorld();
  world.bp = 0;
  const moved = applyGameCommand(freeze(world), {type: 'move', id: 'o-1', x: 5, y: 6});
  assert.deepEqual(moved.objects[0], {id: 'o-1', asset: 'cabin-terracotta', x: 5, y: 6, stored: false});
  assert.ok(!moved.nature.some(item => item.x === 6 && item.y === 6));
  const stored = applyGameCommand(freeze(moved), {type: 'store', id: 'o-1'});
  assert.deepEqual(stored.objects[0], {id: 'o-1', asset: 'cabin-terracotta', x: null, y: null, stored: true});
  assert.equal(placementCheck(stored, 'wildflowers', 5, 6).ok, true);
  const placed = applyGameCommand(freeze(stored), {type: 'place', id: 'o-1', x: 2, y: 2});
  assert.equal(placed.objects.length, 1);
  assert.equal(placed.objects[0].id, 'o-1');
  assert.equal(placed.nextId, world.nextId);
  assert.equal(placed.bp, 0);
  assert.equal(placed.xp, 0);
  assert.equal(placed.revision, 3);
  assert.equal(validateGameWorld(placed), placed);
});

test('moving ignores its old footprint and identical movement is an actual no-op', () => {
  const world = freeze(createGameWorld());
  assert.equal(applyGameCommand(world, {type: 'move', id: 'o-1', x: 2, y: 2}), world);
  const shifted = applyGameCommand(world, {type: 'move', id: 'o-1', x: 3, y: 2});
  assert.equal(shifted.objects[0].x, 3);
  assert.equal(shifted.bp, 30);
  assert.equal(shifted.revision, 1);
});

test('moving and re-placing an owned locked asset do not re-check catalog locks or charge', () => {
  const world = createGameWorld();
  world.objects.push({id: 'o-7', asset: 'pine-slender', x: 7, y: 0, stored: false});
  world.nextId = 8;
  world.bp = 0;
  const moved = applyGameCommand(world, {type: 'move', id: 'o-7', x: 7, y: 1});
  const stored = applyGameCommand(moved, {type: 'store', id: 'o-7'});
  const placed = applyGameCommand(stored, {type: 'place', id: 'o-7', x: 7, y: 2});
  assert.equal(placed.objects.at(-1).id, 'o-7');
  assert.equal(placed.bp, 0);
  assert.equal(placed.xp, 0);
});

test('invalid object lifecycle commands reject atomically instead of creating duplicate objects', () => {
  rejectAtomic(createGameWorld(), {type: 'move', id: 'missing', x: 0, y: 0}, /找不到|对象/);
  rejectAtomic(createGameWorld(), {type: 'place', id: 'o-1', x: 0, y: 0}, /收纳|地图/);
  const stored = applyGameCommand(createGameWorld(), {type: 'store', id: 'o-1'});
  rejectAtomic(copy(stored), {type: 'store', id: 'o-1'}, /收纳|地图/);
  rejectAtomic(copy(stored), {type: 'move', id: 'o-1', x: 0, y: 0}, /收纳|地图/);
  rejectAtomic(copy(stored), {type: 'place', id: 'o-1', x: 7, y: 7}, /土地|越界|超出/);
  const occupied = applyGameCommand(createGameWorld(), {type: 'build', assetId: 'rock', x: 0, y: 0});
  rejectAtomic(occupied, {type: 'move', id: 'o-1', x: 0, y: 0}, /重叠/);
  rejectAtomic(createGameWorld(), {type: 'expand', x: 1, y: 0}, /解锁|XP/);
  rejectAtomic(createGameWorld(), {type: 'effort', event: {}}, /努力|事件|格式/);
  rejectAtomic(createGameWorld(), {type: 'unknown'}, /暂不|操作/);
  rejectAtomic(createGameWorld(), null, /操作/);
});

test('full footprints may cross seams of already connected land without moving original records', () => {
  const world = createGameWorld();
  world.chunks.push({x: -1, y: 0});
  world.bp = 30;
  assert.equal(validateGameWorld(world), world);
  assert.equal(placementCheck(world, 'cabin-terracotta', -1, 0).ok, true);
  const next = applyGameCommand(world, {type: 'build', assetId: 'cabin-terracotta', x: -1, y: 0});
  assert.equal(next.bp, 6);
  assert.deepEqual(next.objects[0], world.objects[0]);
  assert.deepEqual(next.path, world.path);
  assert.equal(validateGameWorld(next), next);
});

test('revision and allocation overflow reject before any changes', () => {
  const exhaustedIds = createGameWorld();
  exhaustedIds.nextId = Number.MAX_SAFE_INTEGER;
  rejectAtomic(exhaustedIds, {type: 'build', assetId: 'wildflowers', x: 0, y: 0}, /编号|ID|上限|溢出/);
  const exhaustedRevision = createGameWorld();
  exhaustedRevision.revision = Number.MAX_SAFE_INTEGER;
  rejectAtomic(exhaustedRevision, {type: 'store', id: 'o-1'}, /版本|revision|上限|溢出/);
});

test('validation rejects unknown schemas and invalid resources without replacing the input', () => {
  for (const version of [undefined, 0, 2, '1']) {
    const world = createGameWorld(); world.schemaVersion = version;
    assert.throws(() => validateGameWorld(world), /版本/);
  }
  for (const field of ['revision', 'nextId', 'xp', 'bp']) {
    for (const value of [-1, 0.5, NaN, Infinity, '0', Number.MAX_SAFE_INTEGER + 1]) {
      const world = createGameWorld(); world[field] = value;
      assert.throws(() => validateGameWorld(world), /存档|整数|资源|编号/);
    }
  }
  const noIds = createGameWorld(); noIds.nextId = 0;
  assert.throws(() => validateGameWorld(noIds), /存档|编号/);
  assert.throws(() => validateGameWorld(null), /存档|版本/);
});

test('validation rejects missing, disconnected, duplicate and oversized chunks', () => {
  const variants = [[], [{x: 1, y: 0}], [{x: 0, y: 0}, {x: 2, y: 0}], [{x: 0, y: 0}, {x: 0, y: 0}], [{x: 0, y: 0}, {x: 0.5, y: 0}], [{x: 0, y: 0}, {x: BALANCE.limits.maxChunkCoordinate + 1, y: 0}]];
  for (const chunks of variants) {
    const world = createGameWorld(); world.chunks = chunks;
    assert.throws(() => validateGameWorld(world), /存档|土地|区块/);
  }
  const huge = createGameWorld(); huge.chunks = new Array(BALANCE.limits.maxChunks + 1);
  assert.throws(() => validateGameWorld(huge), /存档|上限/);
});

test('validation rejects unsafe, reused and non-monotonic object IDs across both collections', () => {
  for (const id of ['o-0', 'o-01', 'o-7', 'o-9007199254740992', 'n-2', 'arbitrary']) {
    const world = createGameWorld(); world.objects[0].id = id;
    assert.throws(() => validateGameWorld(world), /存档|编号|ID/);
  }
  const sameNumber = createGameWorld(); sameNumber.nature[0].id = 'n-1';
  assert.throws(() => validateGameWorld(sameNumber), /存档|编号|ID/);
  const duplicate = createGameWorld(); duplicate.nature[1].id = duplicate.nature[0].id;
  assert.throws(() => validateGameWorld(duplicate), /存档|编号|ID/);
});

test('validation distinguishes stored coordinates, live footprints and actual artificial overlap', () => {
  for (const patch of [{asset: 'bad'}, {stored: 0}, {x: null}, {x: 0.5}, {x: 7}, {stored: true}, {stored: true, x: null, y: 0}]) {
    const world = createGameWorld(); Object.assign(world.objects[0], patch);
    assert.throws(() => validateGameWorld(world), /存档|占地|对象|素材|收纳/);
  }
  const overlap = createGameWorld(); overlap.objects.push({id: 'o-7', asset: 'bush', x: 4, y: 3, stored: false}); overlap.nextId = 8;
  assert.throws(() => validateGameWorld(overlap), /重叠|存档/);
  const stored = createGameWorld(); Object.assign(stored.objects[0], {stored: true, x: null, y: null});
  assert.equal(validateGameWorld(stored), stored);
});

test('natural objects cannot occupy artificial cells, path cells or each other', () => {
  for (const patch of [{x: 2, y: 2}, {x: 3, y: 4}, {x: 6, y: 3}, {x: 7, y: 7}, {asset: 'cabin-terracotta'}, {stage: 'young'}, {x: null}]) {
    const world = createGameWorld(); Object.assign(world.nature[0], patch);
    assert.throws(() => validateGameWorld(world), /存档|自然|占地/);
  }
  const overlap = createGameWorld(); overlap.nature[1].x = 1; overlap.nature[1].y = 3;
  assert.throws(() => validateGameWorld(overlap), /存档|重叠|自然/);
});

test('path validation rejects duplicate, fractional and locked-land cells', () => {
  for (const path of [[{x: 3, y: 4}, {x: 3, y: 4}], [{x: 0.5, y: 0}], [{x: 8, y: 0}], [null]]) {
    const world = createGameWorld(); world.path = path;
    assert.throws(() => validateGameWorld(world), /存档|道路/);
  }
});

test('effort validation enforces event content, uniqueness, permanent XP total and earned BP ceiling', () => {
  const valid = unlockedWorld(300);
  assert.equal(validateGameWorld(valid), valid);
  for (const patch of [{id: ''}, {source: 'task'}, {minutes: 0}, {minutes: 181}, {minutes: 0.5}, {occurredAt: 'yesterday'}, {occurredAt: '2026-02-30T00:00:00.000Z'}, {label: 'x'.repeat(BALANCE.effort.maxLabelLength + 1)}]) {
    const world = unlockedWorld(); Object.assign(world.efforts[0], patch);
    assert.throws(() => validateGameWorld(world), /存档|努力|事件|XP/);
  }
  const duplicate = unlockedWorld(); duplicate.efforts.push(copy(duplicate.efforts[0])); duplicate.xp = 240;
  assert.throws(() => validateGameWorld(duplicate), /存档|事件|重复/);
  const badXP = unlockedWorld(); badXP.xp++;
  assert.throws(() => validateGameWorld(badXP), /XP|存档/);
  const unearned = createGameWorld(); unearned.bp = 31;
  assert.throws(() => validateGameWorld(unearned), /BP|存档|资源/);
  const first = unlockedWorld(); first.bp = 54;
  assert.equal(validateGameWorld(first), first);
});

test('bounded collections and text reject malformed archives before iterating huge inputs', () => {
  for (const [field, limit] of [['objects', BALANCE.limits.maxObjects], ['nature', BALANCE.limits.maxNature], ['efforts', BALANCE.limits.maxEfforts], ['path', BALANCE.limits.maxPathCells]]) {
    const world = createGameWorld(); world[field] = new Array(limit + 1);
    assert.throws(() => validateGameWorld(world), /存档|上限/);
  }
  const longID = unlockedWorld(); longID.efforts[0].id = 'x'.repeat(BALANCE.effort.maxIdLength + 1);
  assert.throws(() => validateGameWorld(longID), /存档|事件/);
  const broken = createGameWorld(); broken.objects = {};
  assert.throws(() => validateGameWorld(broken), /存档/);
});

test('commands validate the original world before attempting edits', () => {
  const world = createGameWorld(); world.xp = 1;
  rejectAtomic(world, {type: 'build', assetId: 'wildflowers', x: 0, y: 0}, /XP|存档/);
});

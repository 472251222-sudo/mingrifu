import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSETS, BALANCE, stageForXP} from '../src/growth/game/balance.js';
import {createGameWorld, applyGameCommand, validateGameWorld} from '../src/growth/game/world.js';
import {footprintCells, hasWorldCell, frontierChunks} from '../src/growth/game/spatial.js';

const copy = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const event = (id, minutes, patch = {}) => ({id, source: 'simulation', minutes, occurredAt: '2026-10-14T00:00:00.000Z', ...patch});
const effort = (world, id, minutes, patch) => applyGameCommand(world, {type: 'effort', event: event(id, minutes, patch)});
function rejectAtomic(world, command, message) {
  const before = copy(world);
  assert.throws(() => applyGameCommand(freeze(world), command), message);
  assert.deepEqual(world, before);
}
const ready = () => effort(createGameWorld(), 'ready', 120);
const byId = world => world.nature.slice().sort((a, b) => a.id.localeCompare(b.id));

for (const [minutes, xp, bp] of [[10, 10, 2], [25, 25, 5], [50, 50, 10], [3, 3, 0], [1, 1, 0], [180, 180, 36]]) {
  test(`${minutes} simulated minutes award ${xp} permanent XP and ${bp} spendable BP`, () => {
    const world = freeze(createGameWorld());
    const next = effort(world, `reward-${minutes}`, minutes, {label: '模拟学习'});
    assert.equal(next.xp, xp);
    assert.equal(next.bp, 30 + bp);
    assert.equal(next.revision, 1);
    assert.deepEqual(next.efforts, [event(`reward-${minutes}`, minutes, {label: '模拟学习'})]);
    assert.deepEqual(next.objects, world.objects);
    assert.deepEqual(next.path, world.path);
    assert.equal(validateGameWorld(next), next);
    assert.equal(world.xp, 0);
    assert.equal(world.bp, 30);
  });
}

test('same event after spending and a JSON round trip is a complete no-op including revision and nature', () => {
  const first = effort(createGameWorld(), 'once', 50, {label: '散步'});
  const spent = applyGameCommand(first, {type: 'build', assetId: 'wildflowers', x: 0, y: 0});
  const restored = validateGameWorld(JSON.parse(JSON.stringify(spent)));
  const before = copy(restored);
  const result = applyGameCommand(freeze(restored), {type: 'effort', event: {label: '散步', occurredAt: '2026-10-14T00:00:00.000Z', minutes: 50, source: 'simulation', id: 'once'}});
  assert.equal(result, restored);
  assert.deepEqual(result, before);
  assert.equal(result.efforts.length, 1);
  assert.equal(result.bp, 38);
});

test('same event ID with changed content is rejected without altering rewards or vegetation', () => {
  for (const patch of [{minutes: 51}, {occurredAt: '2026-10-15T00:00:00.000Z'}, {label: '不同标签'}, {label: ''}]) {
    const world = effort(createGameWorld(), 'once', 50);
    rejectAtomic(world, {type: 'effort', event: event('once', 50, patch)}, /事件|内容|重复/);
  }
  const world = effort(createGameWorld(), 'once', 50);
  rejectAtomic(world, {type: 'effort', event: event('once', 0)}, /努力|事件|分钟/);
});

test('event records are copied so later caller edits cannot change saved reward history', () => {
  const submitted = event('copy', 25, {label: '阅读'});
  const next = applyGameCommand(createGameWorld(), {type: 'effort', event: submitted});
  submitted.minutes = 100;
  submitted.label = '被改了';
  assert.deepEqual(next.efforts[0], event('copy', 25, {label: '阅读'}));
  assert.equal(validateGameWorld(next), next);
});

test('bad event shape, source, ID, minutes, label and calendar date reject atomically', () => {
  const invalid = [null, {}, event('', 25), event(' ', 25), event('x'.repeat(BALANCE.effort.maxIdLength + 1), 25), event('bad', 25, {source: 'task'}), event('bad', 25, {label: 'x'.repeat(BALANCE.effort.maxLabelLength + 1)}), event('bad', 25, {label: 1}), event('bad', 25, {unknown: true})];
  for (const minutes of [0, -1, 181, 0.5, NaN, Infinity, '25', Number.MAX_SAFE_INTEGER]) invalid.push(event('bad', minutes));
  for (const occurredAt of ['yesterday', '2026-02-30T00:00:00.000Z', '2026-13-01T00:00:00Z', '2026-01-01T24:01:00Z', '2026-10-14', '2026-10-14T00:00:00', 0]) invalid.push(event('bad', 25, {occurredAt}));
  for (const value of invalid) rejectAtomic(createGameWorld(), {type: 'effort', event: value}, /努力|事件|格式|分钟|标签/);
});

test('maximum label and ID and valid leap-day/timezone events are accepted', () => {
  const next = effort(createGameWorld(), 'x'.repeat(BALANCE.effort.maxIdLength), 25, {label: 'x'.repeat(BALANCE.effort.maxLabelLength), occurredAt: '2024-02-29T08:00:00+08:00'});
  assert.equal(next.xp, 25);
  assert.equal(validateGameWorld(next), next);
});

test('only a crossed 50XP boundary grows nature, and BP floors each event separately', () => {
  const world = createGameWorld();
  const below = effort(world, 'below', 49);
  assert.deepEqual(below.nature, world.nature);
  const next = effort(below, 'boundary', 1);
  assert.equal(next.xp, 50);
  assert.equal(next.bp, 39, '49+1 minutes issue 9+0 BP, not 10');
  assert.deepEqual(next.nature.find(item => item.id === 'n-4'), {id: 'n-4', asset: 'bush', x: 0, y: 6, stage: 'bush'});
  assert.deepEqual(next.nature.find(item => item.id === 'n-5'), world.nature.find(item => item.id === 'n-5'));
  assert.equal(next.nextId, 7);
});

test('one effort crosses all ecology boundaries while making only one world revision', () => {
  const world = freeze(createGameWorld());
  const next = effort(world, 'three-steps', 150);
  assert.equal(next.revision, 1);
  assert.equal(next.nextId, 7);
  assert.deepEqual(next.nature.find(item => item.id === 'n-4'), {id: 'n-4', asset: 'oak-broad', x: 0, y: 6, stage: 'mature'});
  assert.deepEqual(next.nature.find(item => item.id === 'n-5'), {id: 'n-5', asset: 'bush', x: 6, y: 6, stage: 'bush'});
  const offset = effort(createGameWorld(), 'offset', 49);
  const four = effort(offset, 'four-steps', 180);
  assert.equal(four.xp, 229);
  assert.equal(four.revision, 2);
  assert.equal(four.nature.filter(item => item.asset === 'oak-broad').length, 3);
  assert.equal(validateGameWorld(four), four);
});

for (const obstacle of ['artificial', 'nature', 'path', 'edge']) {
  test(`blocked oak footprint (${obstacle}) skips to another legal growth candidate`, () => {
    const world = createGameWorld();
    world.nature = [{id: 'n-2', asset: 'bush', x: obstacle === 'edge' ? 7 : 0, y: 0, stage: 'bush'}, {id: 'n-3', asset: 'grass-tuft', x: 6, y: 6, stage: 'young'}];
    if (obstacle === 'artificial') { world.objects.push({id: 'o-7', asset: 'rock', x: 1, y: 1, stored: false}); world.nextId = 8; }
    if (obstacle === 'nature') world.nature.push({id: 'n-4', asset: 'wildflowers', x: 1, y: 1, stage: 'static'});
    if (obstacle === 'path') world.path.push({x: 1, y: 1});
    assert.equal(validateGameWorld(world), world);
    const next = effort(freeze(world), `blocked-${obstacle}`, 50);
    assert.deepEqual(next.nature.find(item => item.id === 'n-2'), world.nature[0]);
    assert.deepEqual(next.nature.find(item => item.id === 'n-3'), {id: 'n-3', asset: 'bush', x: 6, y: 6, stage: 'bush'});
    assert.equal(next.nature.length, world.nature.length);
    assert.deepEqual(next.objects, world.objects);
    assert.deepEqual(next.path, world.path);
    assert.equal(validateGameWorld(next), next);
  });
}

test('when all upgrade candidates are blocked the first legal empty cell gains a new grass ID', () => {
  const world = createGameWorld();
  world.nature = [{id: 'n-2', asset: 'bush', x: 0, y: 0, stage: 'bush'}];
  world.objects.push({id: 'o-7', asset: 'rock', x: 1, y: 1, stored: false});
  world.nextId = 8;
  const next = effort(freeze(world), 'add-grass', 50);
  assert.deepEqual(next.nature[0], world.nature[0]);
  assert.deepEqual(next.nature.at(-1), {id: 'n-8', asset: 'grass-tuft', x: 1, y: 0, stage: 'young'});
  assert.equal(next.nextId, 9);
  assert.equal(next.bp, 40, 'ecology never charges BP');
  assert.equal(validateGameWorld(next), next);
});

test('mature trees and static flowers never upgrade; new plants occupy genuinely empty cells', () => {
  const world = createGameWorld();
  world.nature = world.nature.filter(item => ['mature', 'static'].includes(item.stage));
  const next = effort(world, 'new-plant', 50);
  assert.deepEqual(next.nature.slice(0, world.nature.length), world.nature);
  assert.deepEqual(next.nature.at(-1), {id: 'n-7', asset: 'grass-tuft', x: 0, y: 0, stage: 'young'});
  assert.equal(next.nextId, 8);
});

test('growth choice is deterministic by coordinates and independent of event IDs or array order', () => {
  const first = createGameWorld();
  const second = copy(first); second.nature.reverse();
  const a = effort(first, 'one-id', 150);
  const b = effort(second, 'another-id', 150);
  assert.deepEqual(byId(a), byId(b));
  assert.equal(a.nextId, b.nextId);
});

test('a completely occupied map still rewards effort without moving objects or forcing plants into roads', () => {
  const world = createGameWorld(); world.objects = []; world.nature = [];
  const path = new Set(world.path.map(cell => `${cell.x},${cell.y}`));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (!path.has(`${x},${y}`)) world.objects.push({id: `o-${world.nextId++}`, asset: 'grass-tuft', x, y, stored: false});
  }
  world.bp = 0;
  assert.equal(validateGameWorld(world), world);
  const next = effort(freeze(world), 'crowded', 180);
  assert.equal(next.xp, 180);
  assert.equal(next.bp, 36);
  assert.deepEqual(next.nature, []);
  assert.equal(next.nextId, world.nextId);
  assert.deepEqual(next.objects, world.objects);
  assert.deepEqual(next.path, world.path);
});

test('blocked ecology boundaries are consumed once and cannot replay after new land opens', () => {
  const world = createGameWorld(); world.objects = []; world.nature = [];
  const reserved = new Set(world.path.map(cell => `${cell.x},${cell.y}`));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (!reserved.has(`${x},${y}`)) world.objects.push({id: `o-${world.nextId++}`, asset: 'grass-tuft', x, y, stored: false});
  }
  world.bp = 0;
  const crowded = effort(world, 'three-blocked', 180);
  const opened = applyGameCommand(crowded, {type: 'expand', x: -1, y: 0});
  assert.equal(applyGameCommand(opened, {type: 'effort', event: event('three-blocked', 180)}), opened);
  const between = effort(opened, 'below-next-boundary', 1);
  assert.deepEqual(between.nature, []);
  const next = effort(between, 'one-new-boundary', 19);
  assert.equal(next.xp, 200);
  assert.equal(next.bp, 19);
  assert.deepEqual(next.nature, [{id: `n-${world.nextId}`, asset: 'grass-tuft', x: -8, y: 0, stage: 'young'}]);
  assert.equal(next.nextId, world.nextId + 1);
  assert.deepEqual(next.objects, world.objects);
  assert.deepEqual(next.path, world.path);
  assert.equal(validateGameWorld(next), next);
});

test('repeated ecology never modifies any artificial vegetation, building or stored record', () => {
  let world = createGameWorld();
  world.objects.push({id: 'o-7', asset: 'wildflowers', x: null, y: null, stored: true}, {id: 'o-8', asset: 'pine-slender', x: 7, y: 0, stored: false}, {id: 'o-9', asset: 'oak-broad', x: 4, y: 0, stored: false}, {id: 'o-10', asset: 'grass-tuft', x: 7, y: 7, stored: false});
  world.nextId = 11;
  const original = copy(world.objects), path = copy(world.path);
  for (let i = 0; i < 20; i++) {
    world = effort(freeze(world), `repeat-${i}`, 180);
    assert.deepEqual(world.objects, original);
    assert.deepEqual(world.path, path);
    assert.equal(validateGameWorld(world), world);
  }
  assert.equal(world.efforts.length, 20);
});

test('120XP and 300XP unlock catalogs immediately and spent BP cannot lower the stage', () => {
  const at119 = effort(createGameWorld(), 'before-root', 119);
  rejectAtomic(copy(at119), {type: 'build', assetId: 'oak-broad', x: 0, y: 0}, /XP|解锁/);
  const at120 = effort(at119, 'root', 1);
  assert.equal(stageForXP(at120.xp).name, '扎根');
  const oak = applyGameCommand(at120, {type: 'build', assetId: 'oak-broad', x: 0, y: 0});
  assert.equal(oak.xp, 120);
  rejectAtomic(copy(oak), {type: 'build', assetId: 'pine-slender', x: 7, y: 0}, /XP|解锁/);
  const at300 = effort(oak, 'lush', 180);
  assert.equal(stageForXP(at300.xp).name, '丰茂');
  const pine = applyGameCommand(at300, {type: 'build', assetId: 'pine-slender', x: 7, y: 0});
  const id = pine.objects.at(-1).id;
  const moved = applyGameCommand(pine, {type: 'move', id, x: 7, y: 1});
  const stored = applyGameCommand(moved, {type: 'store', id});
  const placed = applyGameCommand(stored, {type: 'place', id, x: 7, y: 2});
  assert.equal(placed.xp, 300);
  assert.equal(placed.bp, pine.bp);
  assert.equal(stageForXP(placed.xp).nextXP, null);
});

test('effort dates do not cause elapsed-time rewards, decay, maintenance or penalties', () => {
  const old = effort(createGameWorld(), 'old', 50, {occurredAt: '2001-01-01T00:00:00Z'});
  const future = effort(createGameWorld(), 'future', 50, {occurredAt: '2100-01-01T00:00:00Z'});
  assert.equal(old.xp, future.xp);
  assert.equal(old.bp, future.bp);
  assert.deepEqual(old.nature, future.nature);
  const original = copy(old);
  assert.equal(validateGameWorld(freeze(old)), old);
  assert.deepEqual(old, original);
});

test('event history capacity rejects new records but never erases deduplication or rejects an existing no-op', () => {
  const world = createGameWorld();
  world.efforts = Array.from({length: BALANCE.limits.maxEfforts}, (_, index) => event(`capacity-${index}`, 1));
  world.xp = world.efforts.length;
  assert.equal(validateGameWorld(world), world);
  rejectAtomic(copy(world), {type: 'effort', event: event('over-capacity', 1)}, /努力|事件|上限/);
  assert.equal(applyGameCommand(freeze(world), {type: 'effort', event: event('capacity-0', 1)}), world);
});

test('revision or required natural ID overflow rejects the whole effort before issuing resources', () => {
  const exhaustedRevision = createGameWorld(); exhaustedRevision.revision = Number.MAX_SAFE_INTEGER;
  rejectAtomic(exhaustedRevision, {type: 'effort', event: event('no-revision', 150)}, /版本|溢出|上限/);
  const exhaustedIDs = createGameWorld(); exhaustedIDs.nextId = Number.MAX_SAFE_INTEGER;
  exhaustedIDs.nature = exhaustedIDs.nature.filter(item => item.stage !== 'young');
  rejectAtomic(exhaustedIDs, {type: 'effort', event: event('no-new-id', 50)}, /编号|溢出|上限/);
  const upgradeOnly = createGameWorld(); upgradeOnly.nextId = Number.MAX_SAFE_INTEGER;
  assert.equal(effort(upgradeOnly, 'existing-id-only', 50).nextId, Number.MAX_SAFE_INTEGER);
});

for (const [x, y] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
  test(`expansion (${x},${y}) buys exactly 64 adjacent cells for 20BP without changing original layout`, () => {
    const world = freeze(ready());
    const next = applyGameCommand(world, {type: 'expand', x, y});
    assert.equal(next.bp, world.bp - 20);
    assert.equal(next.xp, world.xp);
    assert.equal(next.revision, world.revision + 1);
    assert.equal(next.nextId, world.nextId);
    assert.equal(next.chunks.length, 2);
    for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) assert.equal(hasWorldCell(next, x * 8 + dx, y * 8 + dy), true);
    assert.deepEqual(next.objects, world.objects);
    assert.deepEqual(next.nature, world.nature);
    assert.deepEqual(next.path, world.path);
    assert.deepEqual(next.efforts, world.efforts);
    assert.equal(validateGameWorld(next), next);
  });
}

test('expansion stage, cost, coordinate, adjacency and duplicate checks all reject atomically', () => {
  rejectAtomic(createGameWorld(), {type: 'expand', x: 1, y: 0}, /XP|解锁/);
  rejectAtomic(effort(createGameWorld(), 'not-rooted', 119), {type: 'expand', x: 1, y: 0}, /XP|解锁/);
  const poor = ready(); poor.bp = 19;
  rejectAtomic(poor, {type: 'expand', x: 1, y: 0}, /BP|不足/);
  for (const [x, y] of [[0, 0], [1, 1], [2, 0], [0.5, 0], ['1', 0], [NaN, 0], [Infinity, 0], [BALANCE.limits.maxChunkCoordinate + 1, 0]]) rejectAtomic(ready(), {type: 'expand', x, y}, /土地|区块|相邻|坐标|重复|上限/);
  const expanded = applyGameCommand(ready(), {type: 'expand', x: 1, y: 0});
  rejectAtomic(expanded, {type: 'expand', x: 1, y: 0}, /土地|区块|相邻|重复/);
});

test('negative expanded land permits builds across the already open seam and ecosystem growth', () => {
  const world = ready();
  const west = applyGameCommand(world, {type: 'expand', x: -1, y: 0});
  const built = applyGameCommand(west, {type: 'build', assetId: 'cabin-terracotta', x: -1, y: 0});
  assert.equal(built.bp, 10);
  assert.equal(built.xp, 120);
  assert.equal(footprintCells('cabin-terracotta', -1, 0).every(cell => hasWorldCell(built, cell.x, cell.y)), true);
  assert.deepEqual(built.objects[0], world.objects[0]);
  const growth = copy(west); growth.nature = growth.nature.filter(item => ['mature', 'static'].includes(item.stage));
  const next = effort(growth, 'new-land', 30);
  assert.deepEqual(next.nature.at(-1), {id: `n-${growth.nextId}`, asset: 'grass-tuft', x: -8, y: 0, stage: 'young'});
  assert.deepEqual(next.path, growth.path);
  assert.equal(validateGameWorld(next), next);
});

test('chunk count, coordinate bounds and revision exhaustion cannot partially charge an expansion', () => {
  const full = ready();
  full.chunks = Array.from({length: 256}, (_, index) => ({x: index % 16 - 8, y: Math.floor(index / 16) - 8}));
  assert.equal(validateGameWorld(full), full);
  assert.deepEqual(frontierChunks(full), []);
  rejectAtomic(full, {type: 'expand', x: 8, y: 0}, /土地|区块|上限/);
  const edge = ready(); edge.chunks = Array.from({length: BALANCE.limits.maxChunkCoordinate + 1}, (_, x) => ({x, y: 0}));
  assert.equal(validateGameWorld(edge), edge);
  assert.ok(frontierChunks(edge).every(chunk => Math.abs(chunk.x) <= BALANCE.limits.maxChunkCoordinate));
  rejectAtomic(edge, {type: 'expand', x: BALANCE.limits.maxChunkCoordinate + 1, y: 0}, /土地|区块|坐标|上限/);
  const revision = ready(); revision.revision = Number.MAX_SAFE_INTEGER;
  rejectAtomic(revision, {type: 'expand', x: 1, y: 0}, /版本|溢出|上限/);
});

test('world schema stays unchanged and all recorded events remain replay-safe after growth and expansion', () => {
  let world = createGameWorld();
  const originalKeys = Object.keys(world).sort();
  for (let index = 0; index < 3; index++) world = effort(world, `history-${index}`, 120);
  world = applyGameCommand(world, {type: 'expand', x: 0, y: -1});
  const restored = validateGameWorld(JSON.parse(JSON.stringify(world)));
  assert.deepEqual(Object.keys(restored).sort(), originalKeys);
  for (const recorded of restored.efforts) assert.equal(applyGameCommand(restored, {type: 'effort', event: copy(recorded)}), restored);
  assert.equal(restored.efforts.length, 3);
  assert.equal(restored.xp, 360);
  assert.equal(stageForXP(restored.xp).name, '丰茂');
  assert.ok(Object.values(ASSETS).every(asset => asset.cost > 0));
});

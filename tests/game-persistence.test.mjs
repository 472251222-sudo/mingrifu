import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameWorld, applyGameCommand} from '../src/growth/game/world.js';

const api = await import('../src/growth/game/persistence.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const KEY = 'mingrifu-growth-game-v1';
const flower = {type: 'build', assetId: 'wildflowers', x: 1, y: 0};

class Storage {
  constructor(raw = null) {
    this.values = new Map([
      ['mingrifu-growth-world-p1-v1', 'protected-p1'],
      ['mingrifu-session-v3', 'protected-v3'],
      ['mingrifu-v4', 'protected-v4'],
    ]);
    if (raw !== null) this.values.set(KEY, raw);
    this.failRead = false;
    this.failWrite = false;
    this.writes = 0;
    this.accesses = [];
  }
  getItem(key) {
    this.accesses.push(key);
    if (this.failRead) throw new DOMException('blocked', 'SecurityError');
    return this.values.get(key) ?? null;
  }
  setItem(key, raw) {
    if (this.failWrite) throw new DOMException('full', 'QuotaExceededError');
    this.accesses.push(key);
    this.values.set(key, raw);
    this.writes++;
  }
}

// Models the shared origin's exclusive lock queue, while the real service owns
// validation, read/token comparison, serialization and storage effects.
class Locks {
  queues = new Map();
  request(name, options, callback) {
    assert.equal(options.mode, 'exclusive');
    const prior = this.queues.get(name) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(() => callback({name, mode: 'exclusive'}));
    this.queues.set(name, next);
    return next;
  }
}

function service(storage = new Storage(), locks = new Locks()) {
  assert.equal(typeof api.createGamePersistence, 'function', 'the save service must exist');
  return api.createGamePersistence({storage, locks, checkpoint: checkpoint(storage)});
}
function controller(storage = new Storage(), locks = new Locks()) {
  assert.equal(typeof api.createGameWorldController, 'function', 'the transaction controller must exist');
  return api.createGameWorldController({persistence: service(storage, locks)});
}
const rejectsCode = (operation, code) => assert.rejects(operation, error => error.code === code);

const checkpointBackends = new WeakMap();
let checkpointOwner = 0;
class Checkpoint {
  constructor(backend = {record: null}) {this.backend = backend; this.owner = `test-owner-${++checkpointOwner}`; this.readonly = false;}
  async fingerprint(raw, revision) {
    const digest = raw === null ? null : [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return {digest, revision: raw === null ? null : revision};
  }
  async verify(point) {
    const current = this.backend.record;
    if (this.backend.unavailable) throw Object.assign(new Error('guard unavailable'), {code: 'storage_unavailable'});
    if (current && (current.digest !== point.digest || current.revision !== point.revision)) throw Object.assign(new Error('guard conflict'), {code: 'conflict'});
  }
  async reserve(expected, next) {
    if (this.backend.reserveFault) throw Object.assign(new Error('guard commit aborted'), {code: 'storage_unavailable'});
    if (this.backend.pause) await this.backend.pause;
    const current = this.backend.record;
    if (current && (current.digest !== expected.digest || current.revision !== expected.revision)) {
      if (current.owner === this.owner && current.digest === next.digest && current.revision === next.revision && current.previousDigest === expected.digest && current.previousRevision === expected.revision) return {record: current, previous: expected.digest === null ? null : {...current, ...expected, previousDigest: null, previousRevision: null}};
      throw Object.assign(new Error('guard conflict'), {code: 'conflict'});
    }
    const record = {schemaVersion: 1, ...next, previousDigest: expected.digest, previousRevision: expected.revision, owner: this.owner};
    this.backend.record = record;
    return {record, previous: current};
  }
  async rollback(reservation) {
    if (this.backend.rollbackFault) throw Object.assign(new Error('guard rollback aborted'), {code: 'storage_unavailable'});
    if (this.backend.record !== reservation.record) throw Object.assign(new Error('another reservation'), {code: 'conflict'});
    this.backend.record = reservation.previous;
  }
}
function checkpoint(storage) {
  if (!checkpointBackends.has(storage)) checkpointBackends.set(storage, {record: null});
  return new Checkpoint(checkpointBackends.get(storage));
}

test('first seed and built world survive fresh service reads without duplicate gifts or old-key access', async () => {
  const storage = new Storage(), first = service(storage);
  const seed = first.read();
  assert.equal(seed.isNew, true);
  assert.equal(seed.token, null);
  assert.equal(seed.world.bp, 30);
  const saved = await first.save(seed.world, seed.token);
  assert.equal(saved.isNew, false);
  const candidate = applyGameCommand(saved.world, flower);
  const built = await first.save(candidate, saved.token);
  const refreshed = service(storage).read();
  assert.deepEqual(refreshed.world, built.world);
  assert.equal(refreshed.world.bp, 28);
  assert.equal(refreshed.world.objects.length, 2);
  assert.equal(refreshed.world.revision, 1);
  assert.equal(refreshed.token, storage.values.get(KEY));
  assert.deepEqual([...new Set(storage.accesses)], [KEY]);
  assert.equal(storage.values.get('mingrifu-growth-world-p1-v1'), 'protected-p1');
  assert.equal(storage.values.get('mingrifu-session-v3'), 'protected-v3');
  assert.equal(storage.values.get('mingrifu-v4'), 'protected-v4');
});

for (const [name, raw, code] of [
  ['broken JSON', '{keep exactly', 'invalid_json'],
  ['unknown schema', JSON.stringify({...createGameWorld(), schemaVersion: 9}), 'unsupported_version'],
  ['invalid world', JSON.stringify({...createGameWorld(), bp: -1}), 'invalid_world'],
  ['missing fields', '{"schemaVersion":1}', 'invalid_world'],
  ['oversized raw', ' '.repeat(8 * 1024 * 1024 + 1), 'save_too_large'],
]) {
  test(`${name} becomes a recoverable fault with exact raw preserved and no writes`, async () => {
    const storage = new Storage(raw), persist = service(storage);
    assert.throws(() => persist.read(), error => error.code === code && error.raw === raw);
    await rejectsCode(persist.save(createGameWorld(), null), code);
    assert.equal(storage.values.get(KEY), raw);
    assert.equal(storage.writes, 0);
    const app = controller(storage);
    assert.equal(await app.initialize(), false);
    assert.equal(app.getSnapshot().status, 'fault');
    assert.equal(app.getSnapshot().readonly, true);
    assert.equal(app.getSnapshot().raw, raw);
    assert.equal(app.getSnapshot().saved, false);
    assert.equal(await app.run(flower), false);
    assert.equal(storage.values.get(KEY), raw);
  });
}

test('storage read denial faults without inventing readable raw or creating a seed', async () => {
  const storage = new Storage();
  storage.failRead = true;
  const app = controller(storage);
  assert.equal(await app.initialize(), false);
  assert.equal(app.getSnapshot().error.code, 'storage_unavailable');
  assert.equal(app.getSnapshot().raw, null);
  assert.equal(storage.writes, 0);
  storage.failRead = false;
  assert.equal(await app.reload(), true);
  assert.equal(app.getSnapshot().saved, true);
});

test('localStorage getter denial is caught by lazy default access', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); }});
  try {
    assert.equal(typeof api.createGamePersistence, 'function');
    const persist = api.createGamePersistence({locks: new Locks(), checkpoint: new Checkpoint()});
    assert.throws(() => persist.read(), error => error.code === 'storage_unavailable' && error.raw === null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('no Web Locks keeps both new and existing worlds readable but never writes', async () => {
  for (const raw of [null, JSON.stringify(createGameWorld())]) {
    const storage = new Storage(raw), persist = service(storage, null);
    assert.equal(persist.readonly, true);
    assert.equal(persist.read().world.bp, 30);
    await rejectsCode(persist.save(createGameWorld(), null), 'readonly');
    const app = controller(storage, null);
    assert.equal(await app.initialize(), true);
    assert.equal(app.getSnapshot().status, 'ready');
    assert.equal(app.getSnapshot().readonly, true);
    assert.equal(app.getSnapshot().saved, raw !== null);
    assert.equal(app.getSnapshot().error.code, 'readonly');
    assert.equal(await app.run(flower), false);
    assert.equal(storage.writes, 0);
  }
});

test('same-token clients serialize under one origin lock: exactly one command saves', async () => {
  const storage = new Storage(JSON.stringify(createGameWorld())), locks = new Locks();
  const a = service(storage, locks), b = service(storage, locks);
  const wa = a.read(), wb = b.read();
  const outcomes = await Promise.allSettled([
    a.save(applyGameCommand(wa.world, flower), wa.token),
    b.save(applyGameCommand(wb.world, {...flower, x: 5}), wb.token),
  ]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(item => item.status === 'rejected').reason.code, 'conflict');
  assert.equal(storage.writes, 1);
  assert.equal(a.read().world.bp, 28);
  assert.equal(a.read().world.revision, 1);
  assert.equal(a.read().world.objects.length, 2);
});

test('seed creation allows only first null token, and revision jumps or unchanged revisions reject atomically', async () => {
  const storage = new Storage(), persist = service(storage), seed = createGameWorld();
  await rejectsCode(persist.save({...seed, revision: 1}, null), 'invalid_revision');
  const saved = await persist.save(seed, null);
  await rejectsCode(persist.save(seed, null), 'conflict');
  for (const revision of [0, 2, 8]) await rejectsCode(persist.save({...seed, revision}, saved.token), 'invalid_revision');
  await rejectsCode(persist.save({...seed, bp: -2, revision: 1}, saved.token), 'invalid_world');
  assert.equal(storage.writes, 1);
  assert.equal(storage.values.get(KEY), saved.token);
});

test('JSON token detects external formatting changes even when revisions match', async () => {
  const storage = new Storage(JSON.stringify(createGameWorld())), persist = service(storage);
  const loaded = persist.read();
  const reformatted = JSON.stringify(loaded.world, null, 2);
  storage.values.set(KEY, reformatted);
  await rejectsCode(persist.save(applyGameCommand(loaded.world, flower), loaded.token), 'conflict');
  assert.equal(storage.values.get(KEY), reformatted);
  assert.equal(storage.writes, 0);
});

test('candidate is captured before waiting for a lock and cannot be mutated into the stored world', async () => {
  const storage = new Storage(JSON.stringify(createGameWorld())), persist = service(storage);
  const loaded = persist.read(), candidate = applyGameCommand(loaded.world, flower);
  const saving = persist.save(candidate, loaded.token);
  candidate.bp = 0;
  candidate.objects[1].x = 7;
  const saved = await saving;
  assert.equal(saved.world.bp, 28);
  assert.equal(saved.world.objects[1].x, 1);
  assert.equal(persist.read().world.bp, 28);
});

test('write failure retains committed world and exact pending build; retry consumes BP only once', async () => {
  const storage = new Storage(), app = controller(storage);
  await app.initialize();
  const before = app.getSnapshot(), raw = storage.values.get(KEY);
  storage.failWrite = true;
  const command = structuredClone(flower);
  assert.equal(await app.run(command), false);
  command.x = 7;
  const failed = app.getSnapshot();
  assert.deepEqual(failed.world, before.world);
  assert.equal(failed.world.bp, 30);
  assert.equal(storage.values.get(KEY), raw);
  assert.equal(failed.error.code, 'write_failed');
  assert.deepEqual(failed.pending.command, flower);
  assert.equal(failed.pending.candidate.bp, 28);
  assert.equal(failed.busy, false);
  assert.equal(await app.run({...flower, x: 5}), false, 'another command cannot replace pending work');
  storage.failWrite = false;
  assert.equal(await app.retry(), true);
  assert.equal(app.getSnapshot().world.bp, 28);
  assert.equal(app.getSnapshot().world.objects[1].x, 1);
  assert.equal(app.getSnapshot().world.revision, 1);
  assert.equal(app.getSnapshot().pending, null);
  assert.equal(await app.retry(), false);
  assert.equal(storage.writes, 2);
});

test('failed initial save is visibly unsaved; retry saves one gift without a command', async () => {
  const storage = new Storage();
  storage.failWrite = true;
  const app = controller(storage);
  assert.equal(await app.initialize(), false);
  assert.equal(app.getSnapshot().status, 'fault');
  assert.equal(app.getSnapshot().saved, false);
  assert.equal(app.getSnapshot().readonly, true);
  assert.equal(app.getSnapshot().pending.kind, 'initial');
  assert.equal(await app.run(flower), false);
  storage.failWrite = false;
  assert.equal(await app.retry(), true);
  assert.equal(app.getSnapshot().world.bp, 30);
  assert.equal(app.getSnapshot().world.objects.length, 1);
  assert.equal(app.getSnapshot().world.revision, 0);
  assert.equal(app.getSnapshot().saved, true);
  assert.equal(app.getSnapshot().readonly, false);
  assert.equal(storage.writes, 1);
});

test('cancel discards a failed candidate and never publishes or charges it', async () => {
  const storage = new Storage(), app = controller(storage);
  await app.initialize();
  storage.failWrite = true;
  await app.run(flower);
  assert.equal(app.cancel(), true);
  assert.equal(app.getSnapshot().pending, null);
  assert.equal(app.getSnapshot().world.bp, 30);
  storage.failWrite = false;
  assert.equal(await app.retry(), false);
  assert.equal(await app.run({...flower, x: 5}), true);
  assert.equal(app.getSnapshot().world.bp, 28);
  assert.equal(app.getSnapshot().world.objects[1].x, 5);
});

test('conflicted pending command cannot retry or run before explicit reload of the other page', async () => {
  const storage = new Storage(JSON.stringify(createGameWorld())), locks = new Locks();
  const a = controller(storage, locks), b = controller(storage, locks);
  await Promise.all([a.initialize(), b.initialize()]);
  assert.deepEqual(await Promise.all([a.run(flower), b.run({...flower, x: 5})]), [true, false]);
  assert.equal(b.getSnapshot().world.bp, 30);
  assert.equal(b.getSnapshot().error.code, 'conflict');
  assert.equal(b.getSnapshot().readonly, true);
  const winner = storage.values.get(KEY);
  assert.equal(await b.retry(), false);
  b.cancel();
  assert.equal(await b.run({...flower, x: 5}), false);
  assert.equal(storage.values.get(KEY), winner);
  assert.equal(await b.reload(), true);
  assert.equal(b.getSnapshot().world.bp, 28);
  assert.equal(b.getSnapshot().pending, null);
  assert.equal(await b.run({...flower, x: 5}), true);
  assert.equal(b.getSnapshot().world.bp, 26);
});

test('two initial controllers and repeated StrictMode initialization save the seed only once', async () => {
  const storage = new Storage(), locks = new Locks(), a = controller(storage, locks), b = controller(storage, locks);
  const init = a.initialize();
  assert.equal(a.initialize(), init, 'initialization must be one shared transaction');
  assert.deepEqual(await Promise.all([init, b.initialize()]), [true, true]);
  assert.equal(a.getSnapshot().saved, true);
  assert.equal(b.getSnapshot().saved, true);
  assert.deepEqual(a.getSnapshot().world, b.getSnapshot().world);
  assert.equal(storage.writes, 1);
  await a.initialize();
  assert.equal(storage.writes, 1);
});

test('parallel runs synchronously reserve the transaction and never overwrite each other', async () => {
  const storage = new Storage(), app = controller(storage);
  await app.initialize();
  const saving = app.run(flower);
  assert.equal(app.getSnapshot().busy, true);
  assert.equal(await app.run({...flower, x: 5}), false);
  assert.equal(await app.reload(), false);
  assert.equal(app.cancel(), false);
  assert.equal(await saving, true);
  assert.equal(app.getSnapshot().world.objects.length, 2);
  assert.equal(storage.writes, 2);
});

test('invalid commands and unchanged moves never perform a storage write', async () => {
  const storage = new Storage(), app = controller(storage);
  await app.initialize();
  const raw = storage.values.get(KEY);
  assert.equal(await app.run({...flower, x: 2, y: 2}), false);
  assert.equal(app.getSnapshot().error.code, 'invalid_command');
  assert.equal(app.getSnapshot().pending, null);
  assert.equal(await app.run({type: 'move', id: 'o-1', x: 2, y: 2}), true);
  assert.equal(app.getSnapshot().error, null);
  assert.equal(app.getSnapshot().world.revision, 0);
  assert.equal(storage.values.get(KEY), raw);
  assert.equal(storage.writes, 1);
});

test('subscribers observe old resources while saving and the committed world only after success', async () => {
  const storage = new Storage(), app = controller(storage);
  await app.initialize();
  const values = [];
  const unsubscribe = app.subscribe(() => values.push({bp: app.getSnapshot().world.bp, busy: app.getSnapshot().busy}));
  await app.run(flower);
  unsubscribe();
  assert.deepEqual(values, [{bp: 30, busy: true}, {bp: 28, busy: false}]);
});

test('failed effort retry preserves one event id and grants one permanent reward; duplicate submission is a no-op', async () => {
  const storage = new Storage(), app = controller(storage);
  await app.initialize();
  const command = {type: 'effort', event: {id: 'retry-effort-one', source: 'simulation', minutes: 50, occurredAt: '2026-10-14T00:00:00.000Z', label: '模拟学习'}};
  const initialNature = structuredClone(app.getSnapshot().world.nature);
  storage.failWrite = true;
  assert.equal(await app.run(command), false);
  assert.equal(app.getSnapshot().world.xp, 0);
  assert.equal(app.getSnapshot().world.bp, 30);
  assert.deepEqual(app.getSnapshot().world.nature, initialNature);
  assert.equal(app.getSnapshot().pending.command.event.id, 'retry-effort-one');
  const pending = app.getSnapshot().pending;
  assert.equal(await app.retry(), false);
  assert.equal(app.getSnapshot().pending, pending, 'failed retries retain the same transaction');
  command.event.id = 'outside-mutation';
  command.event.minutes = 180;
  storage.failWrite = false;
  assert.equal(await app.retry(), true);
  assert.equal(app.getSnapshot().world.xp, 50);
  assert.equal(app.getSnapshot().world.bp, 40);
  assert.equal(app.getSnapshot().world.efforts.length, 1);
  assert.equal(app.getSnapshot().world.efforts[0].id, 'retry-effort-one');
  assert.equal(app.getSnapshot().world.revision, 1);
  const raw = storage.values.get(KEY);
  assert.equal(await app.run(pending.command), true);
  assert.equal(storage.values.get(KEY), raw);
  assert.equal(storage.writes, 2);
  assert.equal(service(storage).read().world.xp, 50);
});

test('unavailable lock request getter degrades to explicit read-only and never throws during creation', async () => {
  const locks = {get request() { throw new DOMException('blocked', 'SecurityError'); }};
  const storage = new Storage(), persist = service(storage, locks);
  assert.equal(persist.readonly, true);
  const app = api.createGameWorldController({persistence: persist});
  assert.equal(await app.initialize(), true);
  assert.equal(app.getSnapshot().error.code, 'readonly');
  assert.equal(storage.writes, 0);
});

test('lock acquisition rejection retains old world and retryable pending command', async () => {
  const locks = new Locks(), storage = new Storage(), app = controller(storage, locks);
  await app.initialize();
  const originalRequest = locks.request;
  locks.request = () => Promise.reject(new DOMException('aborted', 'AbortError'));
  assert.equal(await app.run(flower), false);
  assert.equal(app.getSnapshot().error.code, 'lock_failed');
  assert.equal(app.getSnapshot().world.bp, 30);
  assert.equal(app.getSnapshot().pending.command.x, 1);
  locks.request = originalRequest;
  assert.equal(await app.retry(), true);
  assert.equal(app.getSnapshot().world.bp, 28);
});

test('oversized UTF-8 raw is refused before JSON parsing even below the JS character limit', () => {
  const raw = '汉'.repeat(3 * 1024 * 1024), storage = new Storage(raw), persist = service(storage);
  assert.throws(() => persist.read(), error => error.code === 'save_too_large' && error.raw === raw);
  assert.equal(storage.writes, 0);
});

test('oversized valid candidate cannot replace the downloadable original raw record with unsaved JSON', async () => {
  const storage = new Storage(JSON.stringify(createGameWorld())), persist = service(storage), current = persist.read();
  const world = createGameWorld();
  world.revision = 1;
  world.efforts = Array.from({length: 10000}, (_, i) => ({id: String(i).padStart(120, '汉'), source: 'simulation', minutes: 180, occurredAt: '2026-10-14T00:00:00.123456789+00:00', label: '汉'.repeat(80)}));
  world.xp = 1800000;
  world.chunks = Array.from({length: 256}, (_, i) => ({x: i % 16, y: Math.floor(i / 16)}));
  world.objects.push(...Array.from({length: 4095}, (_, i) => ({id: `o-${i + 7}`, asset: 'wildflowers', x: null, y: null, stored: true})));
  world.nextId = 4102;
  world.nature = [];
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    if ((x >= 2 && x <= 4 && y >= 2 && y <= 3) || (x === 3 && y >= 4 && y <= 7)) continue;
    world.nature.push({id: `n-${world.nextId++}`, asset: 'grass-tuft', x, y, stage: 'young'});
  }
  await assert.rejects(persist.save(world, current.token), error => error.code === 'save_too_large' && error.raw === null);
  assert.equal(storage.values.get(KEY), current.raw);
  assert.equal(storage.writes, 0);
});

test('pending and published objects are immutable; views cannot change the retried charge or event', async () => {
  const storage = new Storage(), app = controller(storage);
  await app.initialize();
  assert.throws(() => { app.getSnapshot().world.bp = 999; }, TypeError);
  storage.failWrite = true;
  await app.run(flower);
  assert.throws(() => { app.getSnapshot().pending.command.x = 5; }, TypeError);
  assert.throws(() => { app.getSnapshot().pending.candidate.bp = 0; }, TypeError);
  storage.failWrite = false;
  assert.equal(await app.retry(), true);
  assert.equal(app.getSnapshot().world.bp, 28);
});

test('default storage getter permission recovery reloads the complete old world on the same controller without seeding', async () => {
  let oldWorld = applyGameCommand(createGameWorld(), {type: 'effort', event: {id: 'preserved-effort', source: 'simulation', minutes: 25, occurredAt: '2026-10-14T00:00:00.000Z', label: '保留努力'}});
  oldWorld = applyGameCommand(oldWorld, flower);
  oldWorld = applyGameCommand(oldWorld, {type: 'store', id: 'o-1'});
  const raw = ` \n${JSON.stringify(oldWorld, null, 2)}\n`, storage = new Storage(raw);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let denied = true;
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() {
    if (denied) throw new DOMException('temporarily blocked', 'SecurityError');
    return storage;
  }});
  try {
    const app = api.createGameWorldController({persistence: api.createGamePersistence({locks: new Locks(), checkpoint: new Checkpoint()})});
    assert.equal(await app.initialize(), false);
    assert.equal(app.getSnapshot().error.code, 'storage_unavailable');
    assert.equal(app.getSnapshot().readonly, true);
    assert.equal(app.getSnapshot().raw, null);
    denied = false;
    assert.equal(globalThis.localStorage.getItem(KEY), raw, 'browser storage is now readable');
    assert.equal(await app.reload(), true, 'the same controller must recheck current permission');
    const recovered = app.getSnapshot();
    assert.equal(recovered.status, 'ready');
    assert.equal(recovered.saved, true);
    assert.equal(recovered.readonly, false);
    assert.equal(recovered.error, null);
    assert.equal(recovered.raw, raw);
    assert.deepEqual(recovered.world, oldWorld);
    assert.equal(recovered.world.xp, 25);
    assert.equal(recovered.world.bp, 33);
    assert.equal(recovered.world.objects[0].id, 'o-1');
    assert.equal(recovered.world.objects[0].stored, true);
    assert.equal(recovered.world.efforts[0].id, 'preserved-effort');
    assert.equal(storage.writes, 0, 'recovery must load the existing record, never write a new gift');
    assert.equal(storage.values.get(KEY), raw);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('persistent default storage getter denial keeps repeated reloads read-only with zero writes', async () => {
  const raw = JSON.stringify(createGameWorld()), storage = new Storage(raw);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() {throw new DOMException('still blocked', 'SecurityError');}});
  try {
    const app = api.createGameWorldController({persistence: api.createGamePersistence({locks: new Locks(), checkpoint: new Checkpoint()})});
    assert.equal(await app.initialize(), false);
    for (let i = 0; i < 2; i++) {
      assert.equal(await app.reload(), false);
      assert.equal(app.getSnapshot().status, 'fault');
      assert.equal(app.getSnapshot().error.code, 'storage_unavailable');
      assert.equal(app.getSnapshot().readonly, true);
      assert.equal(app.getSnapshot().saved, false);
      assert.equal(await app.run(flower), false);
    }
    assert.equal(storage.writes, 0);
    assert.equal(storage.values.get(KEY), raw);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('explicit storage injection remains stable when options and ambient default storage change', async () => {
  const raw = JSON.stringify(createGameWorld()), original = new Storage(raw), unrelated = new Storage(raw);
  const options = {storage: original, locks: new Locks(), checkpoint: new Checkpoint()}, persist = api.createGamePersistence(options);
  const loaded = persist.read();
  options.storage = unrelated;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() {throw new DOMException('ambient denied', 'SecurityError');}});
  try {
    const saved = await persist.save(applyGameCommand(loaded.world, flower), loaded.token);
    assert.equal(saved.world.bp, 28);
    assert.equal(original.writes, 1);
    assert.equal(unrelated.writes, 0);
    assert.equal(unrelated.values.get(KEY), raw);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('locked default storage save captures one storage object for both token read and write', async () => {
  const raw = JSON.stringify(createGameWorld()), first = new Storage(raw), second = new Storage(raw);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let active = first, switchDuringRead = false;
  const originalGet = first.getItem;
  first.getItem = function(key) {
    const value = originalGet.call(this, key);
    if (switchDuringRead) active = second;
    return value;
  };
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() {return active;}});
  try {
    const persist = api.createGamePersistence({locks: new Locks(), checkpoint: new Checkpoint()}), loaded = persist.read();
    switchDuringRead = true;
    const saved = await persist.save(applyGameCommand(loaded.world, flower), loaded.token);
    assert.equal(active, second, 'default getter changes after the locked read');
    assert.equal(saved.world.bp, 28);
    assert.equal(first.writes, 1, 'save writes the very storage object whose token was checked');
    assert.equal(second.writes, 0);
    assert.equal(second.values.get(KEY), raw);
    assert.equal(JSON.parse(first.values.get(KEY)).bp, 28);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('atomic checkpoint rejects the second stale renderer even when its native storage cache still holds the seed', async () => {
  const raw = JSON.stringify(createGameWorld()), aStore = new Storage(raw), bStore = new Storage(raw), locks = new Locks(), backend = {record: null};
  const a = api.createGamePersistence({storage: aStore, locks, checkpoint: new Checkpoint(backend)}), b = api.createGamePersistence({storage: bStore, locks, checkpoint: new Checkpoint(backend)});
  const wa = a.read(), wb = b.read();
  const result = await Promise.allSettled([a.save(applyGameCommand(wa.world, flower), wa.token), b.save(applyGameCommand(wb.world, {...flower, x: 5}), wb.token)]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1, 'a stale local cache must not authorize a second successful save');
  assert.equal(result.find(item => item.status === 'rejected').reason.code, 'conflict');
  assert.equal(aStore.writes + bStore.writes, 1);
  assert.equal(bStore.values.get(KEY), raw);
});

test('checkpoint precommit abort leaves the original raw and visible world untouched until a same-command retry', async () => {
  const storage = new Storage(JSON.stringify(createGameWorld())), guard = new Checkpoint(), app = api.createGameWorldController({persistence: api.createGamePersistence({storage, locks: new Locks(), checkpoint: guard})});
  await app.initialize();
  const original = storage.values.get(KEY);
  guard.backend.reserveFault = true;
  assert.equal(await app.run(flower), false);
  assert.equal(storage.writes, 0);
  assert.equal(storage.values.get(KEY), original);
  assert.equal(app.getSnapshot().world.bp, 30);
  assert.deepEqual(app.getSnapshot().pending.command, flower);
  guard.backend.reserveFault = false;
  assert.equal(await app.retry(), true);
  assert.equal(app.getSnapshot().world.bp, 28);
  assert.equal(storage.writes, 1);
});

test('localStorage is never written while checkpoint commit remains outstanding', async () => {
  const storage = new Storage(JSON.stringify(createGameWorld())), guard = new Checkpoint();
  const persist = api.createGamePersistence({storage, locks: new Locks(), checkpoint: guard}), loaded = persist.read();
  let release;
  guard.backend.pause = new Promise(resolve => {release = resolve;});
  const saving = persist.save(applyGameCommand(loaded.world, flower), loaded.token);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(storage.writes, 0, 'request success or a queued guard operation is not a committed fence');
  release();
  assert.equal((await saving).world.bp, 28);
  assert.equal(storage.writes, 1);
});

test('LS failure plus metadata rollback failure keeps raw, freezes new commands, and retries only the same owner candidate', async () => {
  const raw = JSON.stringify(createGameWorld()), storage = new Storage(raw), locks = new Locks(), backend = {record: null, rollbackFault: true}, guard = new Checkpoint(backend);
  const app = api.createGameWorldController({persistence: api.createGamePersistence({storage, locks, checkpoint: guard})});
  await app.initialize();storage.failWrite = true;
  assert.equal(await app.run(flower), false);
  assert.equal(app.getSnapshot().error.code, 'checkpoint_pending');
  assert.equal(app.getSnapshot().readonly, true);
  assert.equal(app.getSnapshot().world.bp, 30);
  assert.equal(storage.values.get(KEY), raw);assert.equal(storage.writes, 0);
  assert.equal(await app.run({...flower, x: 5}), false);
  const other = api.createGamePersistence({storage: new Storage(raw), locks, checkpoint: new Checkpoint(backend)});
  await rejectsCode(other.save(applyGameCommand(createGameWorld(), flower), raw), 'conflict');
  const snapshot = app.getSnapshot();
  const canceled = app.cancel(), reloaded = await app.reload();
  assert.deepEqual({canceled, reloaded}, {canceled: false, reloaded: false}, 'unsafe checkpoint recovery cannot abandon its owner/pending identity');
  assert.equal(app.getSnapshot(), snapshot);
  const request = locks.request;
  locks.request = () => Promise.reject(new DOMException('temporary lock error', 'AbortError'));
  assert.equal(await app.retry(), false);
  assert.equal(app.getSnapshot().error.code, 'lock_failed');
  assert.equal(app.getSnapshot().readonly, true, 'recovering reservation stays read-only across later errors');
  assert.equal(app.cancel(), false);assert.equal(await app.reload(), false);
  assert.equal(app.getSnapshot().pending, snapshot.pending);
  locks.request = request;
  backend.reserveFault = true;
  assert.equal(await app.retry(), false);
  assert.equal(app.getSnapshot().readonly, true);
  assert.equal(app.cancel(), false);assert.equal(await app.reload(), false);
  assert.equal(app.getSnapshot().pending, snapshot.pending);
  backend.reserveFault = false;
  storage.failWrite = false;
  assert.equal(await app.retry(), true);
  assert.equal(app.getSnapshot().world.bp, 28);assert.equal(app.getSnapshot().readonly, false);
  assert.equal(storage.writes, 1);
});

test('a recovering owner may cancel only after an actual successful metadata rollback restores the old fence', async () => {
  const raw = JSON.stringify(createGameWorld()), storage = new Storage(raw), backend = {record: null, rollbackFault: true};
  const app = api.createGameWorldController({persistence: api.createGamePersistence({storage, locks: new Locks(), checkpoint: new Checkpoint(backend)})});
  await app.initialize();storage.failWrite = true;
  await app.run(flower);assert.equal(app.getSnapshot().error.code, 'checkpoint_pending');
  backend.rollbackFault = false;
  assert.equal(await app.retry(), false);
  assert.equal(app.getSnapshot().error.code, 'write_failed');
  assert.equal(app.getSnapshot().readonly, false, 'committed rollback removes the unsafe recovery marker');
  assert.equal(app.cancel(), true);assert.equal(await app.reload(), true);
  assert.equal(storage.values.get(KEY), raw);assert.equal(storage.writes, 0);
});

test('load verification faults on a leading checkpoint without publishing or replacing the valid old record', async () => {
  const raw = JSON.stringify(createGameWorld()), storage = new Storage(raw), guard = new Checkpoint();
  guard.backend.record = {schemaVersion: 1, ...(await guard.fingerprint(JSON.stringify(applyGameCommand(createGameWorld(), flower)), 1)), previousDigest: (await guard.fingerprint(raw, 0)).digest, previousRevision: 0, owner: 'closed-owner'};
  const app = api.createGameWorldController({persistence: api.createGamePersistence({storage, locks: new Locks(), checkpoint: guard})});
  assert.equal(await app.initialize(), false);
  assert.equal(app.getSnapshot().status, 'fault');assert.equal(app.getSnapshot().readonly, true);assert.equal(app.getSnapshot().saved, false);
  assert.equal(app.getSnapshot().raw, raw);assert.equal(storage.values.get(KEY), raw);assert.equal(storage.writes, 0);
  assert.equal(await app.run(flower), false);
  assert.equal(await app.reload(), false);
});

test('absent checkpoint capability is explicit read-only and cannot bootstrap unsafe saves', async () => {
  const storage = new Storage(JSON.stringify(createGameWorld())), persist = api.createGamePersistence({storage, locks: new Locks(), checkpoint: null});
  assert.equal(persist.readonly, true);
  await rejectsCode(persist.save(applyGameCommand(persist.read().world, flower), persist.read().token), 'readonly');
  const app = api.createGameWorldController({persistence: persist});await app.initialize();
  assert.equal(app.getSnapshot().readonly, true);assert.equal(storage.writes, 0);
});

test('initial seed conflict re-read must also verify its checkpoint before publishing a saved world', async () => {
  const storage = new Storage(), guard = new Checkpoint(), seed = createGameWorld(), seedRaw = JSON.stringify(seed);
  guard.reserve = async () => {
    const next = applyGameCommand(seed, {type: 'effort', event: {id: 'other-page-advance', source: 'simulation', minutes: 10, occurredAt: '2026-10-14T00:00:00.000Z'}});
    guard.backend.record = {schemaVersion: 1, ...(await guard.fingerprint(JSON.stringify(next), 1)), previousDigest: (await guard.fingerprint(seedRaw, 0)).digest, previousRevision: 0, owner: 'another-page'};
    storage.values.set(KEY, seedRaw);
    throw Object.assign(new Error('another-page conflict'), {code: 'conflict'});
  };
  const app = api.createGameWorldController({persistence: api.createGamePersistence({storage, locks: new Locks(), checkpoint: guard})});
  assert.equal(await app.initialize(), false);
  assert.equal(app.getSnapshot().status, 'fault');assert.equal(app.getSnapshot().saved, false);assert.equal(app.getSnapshot().readonly, true);
  assert.equal(storage.values.get(KEY), seedRaw);assert.equal(storage.writes, 0);
});

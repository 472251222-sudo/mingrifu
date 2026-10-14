import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../src/growth/game/checkpoint.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const copy = value => structuredClone(value);
const empty = {digest: null, revision: null};
const first = {digest: 'a'.repeat(64), revision: 0};
const second = {digest: 'b'.repeat(64), revision: 1};

// External API boundary: request success precedes transaction commit, aborted
// transactions discard their workspace, and overlapping transactions queue.
class MemoryIDB {
  record = undefined;
  opened = false;
  stores = new Set();
  queue = Promise.resolve();
  failCommit = false;
  failOpen = false;
  pauseCommit = false;
  requestSuccesses = 0;
  open() {
    const request = {};
    setImmediate(() => {
      if (this.failOpen) {request.error = new DOMException('blocked', 'SecurityError');request.onerror?.();return;}
      const database = {objectStoreNames: {contains: name => this.stores.has(name)}, createObjectStore: name => this.stores.add(name), close() {}, transaction: (_store, mode) => this.transaction(mode)};
      request.result = database;
      if (!this.opened) {this.opened = true;request.onupgradeneeded?.();}
      request.onsuccess?.();
    });
    return request;
  }
  transaction(mode) {
    const pending = [], prior = this.queue;
    let release;
    this.queue = new Promise(resolve => {release = resolve;});
    let workspace, aborted = false, finished = false;
    const finishAbort = () => {
      if (finished) return;
      finished = true;transaction.error = new DOMException('aborted', 'AbortError');
      transaction.onabort?.();release();
    };
    const request = (kind, value) => {const result = {};pending.push({kind, value, result});return result;};
    const transaction = {error: null, objectStore: () => ({get: () => request('get'), put: value => request('put', copy(value)), delete: () => request('delete')}), abort: () => {aborted = true;setImmediate(finishAbort);}};
    prior.then(async () => {
      workspace = copy(this.record);
      for (let i = 0; i < pending.length && !aborted; i++) {
        const operation = pending[i];
        if (operation.kind === 'get') operation.result.result = copy(workspace);
        if (operation.kind === 'put') workspace = operation.value;
        if (operation.kind === 'delete') workspace = undefined;
        this.requestSuccesses++;
        operation.result.onsuccess?.();
      }
      if (aborted) {finishAbort();return;}
      if (mode === 'readwrite' && this.pauseCommit) await new Promise(resolve => {this.releaseCommit = resolve;});
      if (mode === 'readwrite' && this.failCommit) {finishAbort();return;}
      if (mode === 'readwrite') this.record = workspace;
      finished = true;transaction.oncomplete?.();release();
    });
    return transaction;
  }
}

function checkpoint(factory = new MemoryIDB(), cryptoAPI = crypto) {
  assert.equal(typeof api.createGameCheckpoint, 'function', 'the native checkpoint adapter must exist');
  return api.createGameCheckpoint({indexedDB: factory, crypto: cryptoAPI});
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);

test('fingerprints hash exact original UTF-8 text and distinguish absent records from JSON text', async () => {
  const guard = checkpoint();
  assert.deepEqual(await guard.fingerprint(null, 0), empty);
  assert.deepEqual(await guard.fingerprint('abc', 3), {digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', revision: 3});
  assert.notEqual((await guard.fingerprint('abc ', 3)).digest, (await guard.fingerprint('abc', 3)).digest);
});

test('missing IndexedDB or crypto makes the safety guard explicitly unavailable without writes', async () => {
  for (const [factory, cryptoAPI] of [[null, crypto], [new MemoryIDB(), null], [new MemoryIDB(), {subtle: {}, randomUUID: () => 'x'}]]) {
    const guard = checkpoint(factory, cryptoAPI);
    assert.equal(guard.readonly, true);
    await rejectsCode(guard.reserve(empty, first), 'readonly');
    if (factory) assert.equal(factory.record, undefined);
  }
});

test('bootstrap and subsequent atomic CAS retain metadata only and refuse an obsolete expected token', async () => {
  const factory = new MemoryIDB(), guard = checkpoint(factory);
  await guard.verify(empty);assert.equal(factory.record, undefined);
  const reserved = await guard.reserve(empty, first);
  assert.equal(factory.record.digest, first.digest);assert.equal(factory.record.revision, 0);
  assert.equal(reserved.record.owner, guard.owner);
  assert.deepEqual(Object.keys(factory.record).sort(), ['digest', 'owner', 'previousDigest', 'previousRevision', 'revision', 'schemaVersion']);
  await rejectsCode(checkpoint(factory).reserve(empty, first), 'conflict');
  await guard.verify(first);
  await guard.reserve(first, second);
  assert.equal(factory.record.digest, second.digest);assert.equal(factory.record.previousDigest, first.digest);
  await rejectsCode(checkpoint(factory).reserve(first, second), 'conflict');
});

test('reserve waits for transaction complete even after request success; aborted commit publishes no checkpoint', async () => {
  const factory = new MemoryIDB(), guard = checkpoint(factory);
  factory.pauseCommit = true;
  let resolved = false;
  const reserving = guard.reserve(empty, first).then(value => {resolved = true;return value;});
  while (!factory.releaseCommit) await new Promise(resolve => setImmediate(resolve));
  assert.ok(factory.requestSuccesses >= 2);
  assert.equal(resolved, false);
  assert.equal(factory.record, undefined);
  factory.releaseCommit();await reserving;
  assert.equal(factory.record.digest, first.digest);
  factory.pauseCommit = false;factory.failCommit = true;
  await rejectsCode(guard.reserve(first, second), 'storage_unavailable');
  assert.equal(factory.record.digest, first.digest);
});

test('failed reservation rollback keeps the fence; only the original owner and identical candidate may resume', async () => {
  const factory = new MemoryIDB(), original = checkpoint(factory), other = checkpoint(factory);
  assert.notEqual(original.owner, other.owner);
  const reserved = await original.reserve(empty, first);
  factory.failCommit = true;
  await rejectsCode(original.rollback(reserved), 'storage_unavailable');
  assert.equal(factory.record.digest, first.digest);
  factory.failCommit = false;
  await rejectsCode(other.reserve(empty, first), 'conflict');
  await rejectsCode(original.reserve(empty, second), 'conflict');
  const resumed = await original.reserve(empty, first);
  assert.equal(resumed.record.owner, original.owner);
  await original.rollback(resumed);
  assert.equal(factory.record, undefined);
});

test('rollback never changes a checkpoint already replaced by a newer owner reservation', async () => {
  const factory = new MemoryIDB(), a = checkpoint(factory), b = checkpoint(factory);
  const prior = await a.reserve(empty, first);
  await b.reserve(first, second);
  const record = copy(factory.record);
  await rejectsCode(a.rollback(prior), 'conflict');
  assert.deepEqual(factory.record, record);
});

test('leading, malformed and unknown checkpoint metadata stays intact and blocks unsafe verification', async () => {
  const factory = new MemoryIDB(), guard = checkpoint(factory);
  await guard.reserve(empty, first);
  const leading = copy(factory.record);
  await rejectsCode(guard.verify(empty), 'conflict');assert.deepEqual(factory.record, leading);
  for (const malformed of [{...leading, schemaVersion: 99}, {...leading, owner: ''}, {...leading, world: {bp: 99}}, {...leading, digest: 'bad'}, {...leading, revision: -1}]) {
    factory.record = copy(malformed);
    await rejectsCode(guard.verify(first), 'storage_unavailable');
    assert.deepEqual(factory.record, malformed);
  }
});

test('transient native database open denial can be retried without clearing or migrating any record', async () => {
  const factory = new MemoryIDB(), guard = checkpoint(factory);
  factory.failOpen = true;
  await rejectsCode(guard.verify(empty), 'storage_unavailable');
  factory.failOpen = false;
  await guard.verify(empty);
  assert.equal(factory.record, undefined);
});

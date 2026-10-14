// Only a small atomic fence lives here. The world and downloadable original
// JSON remain in the independent localStorage namespace, never in this DB.
export const GAME_CHECKPOINT = Object.freeze({
  database: 'mingrifu-growth-game-v1-checkpoint', version: 1,
  store: 'checkpoint', key: 'world', schemaVersion: 1,
});

const failure = (code, message, cause) => Object.assign(new Error(message, cause ? {cause} : undefined), {code});
const unavailable = cause => failure('storage_unavailable', '安全存档校验暂不可用，原始世界记录未修改。请重试或重新读取。', cause);
const conflict = () => failure('conflict', '安全校验记录与此页世界不一致。请重新读取；若仍不一致，保持只读并下载原始记录，不会自动覆盖或重置。');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0;
const fields = ['schemaVersion', 'digest', 'revision', 'previousDigest', 'previousRevision', 'owner'];
const matches = (record, point) => record.digest === point.digest && record.revision === point.revision;
const sameRecord = (a, b) => fields.every(key => a[key] === b[key]);

function checkedPoint(point, allowAbsent = true) {
  if (!point || !((allowAbsent && point.digest === null && point.revision === null) || (hash(point.digest) && revision(point.revision)))) throw unavailable();
  return point;
}
function checkedRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).length !== fields.length || fields.some(key => !Object.hasOwn(record, key)) || record.schemaVersion !== 1 || !hash(record.digest) || !revision(record.revision) || typeof record.owner !== 'string' || !record.owner || record.owner.length > 128) throw unavailable();
  checkedPoint({digest: record.previousDigest, revision: record.previousRevision});
  return record;
}

export function createGameCheckpoint(options = {}) {
  let factory, cryptoAPI, owner = null, readonly = true;
  try {
    factory = Object.hasOwn(options, 'indexedDB') ? options.indexedDB : globalThis.indexedDB;
    cryptoAPI = Object.hasOwn(options, 'crypto') ? options.crypto : globalThis.crypto;
    readonly = typeof factory?.open !== 'function' || typeof cryptoAPI?.subtle?.digest !== 'function' || typeof cryptoAPI?.randomUUID !== 'function';
    if (!readonly) owner = cryptoAPI.randomUUID();
  } catch { readonly = true; }
  let opening = null;

  function database() {
    if (readonly) return Promise.reject(failure('readonly', '浏览器缺少 IndexedDB 或安全摘要能力，世界保持只读。'));
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        let request, settled = false;
        const rejectOpen = cause => {if (!settled) {settled = true;reject(unavailable(cause));}};
        try { request = factory.open(GAME_CHECKPOINT.database, GAME_CHECKPOINT.version); }
        catch (error) {rejectOpen(error);return;}
        request.onupgradeneeded = () => {
          if (settled) {request.transaction?.abort();return;}
          try {if (!request.result.objectStoreNames.contains(GAME_CHECKPOINT.store)) request.result.createObjectStore(GAME_CHECKPOINT.store);}
          catch (error) {request.transaction?.abort();rejectOpen(error);}
        };
        request.onerror = () => rejectOpen(request.error);
        request.onblocked = () => rejectOpen(new Error('安全校验数据库被另一连接阻塞'));
        request.onsuccess = () => {
          const db = request.result;
          if (settled) {db.close();return;}
          if (!db.objectStoreNames.contains(GAME_CHECKPOINT.store)) {db.close();rejectOpen(new Error('安全校验数据库结构无效'));return;}
          db.onversionchange = () => {db.close();opening = null;};
          settled = true;resolve(db);
        };
      }).catch(error => {opening = null;throw error;});
    }
    return opening;
  }

  async function transaction(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx, value, error;
      try {
        tx = db.transaction(GAME_CHECKPOINT.store, mode, {durability: 'strict'});
        const store = tx.objectStore(GAME_CHECKPOINT.store), request = store.get(GAME_CHECKPOINT.key);
        request.onsuccess = () => {
          try {value = operation(request.result, store);}
          catch (cause) {error = cause;tx.abort();}
        };
        request.onerror = () => {error = unavailable(request.error);};
        tx.onabort = () => reject(error ?? unavailable(tx.error));
        // Request success does not mean the read/write transaction committed.
        tx.oncomplete = () => error ? reject(error) : resolve(value);
      } catch (cause) {reject(unavailable(cause));}
    });
  }

  async function fingerprint(raw, worldRevision) {
    if (readonly) throw failure('readonly', '浏览器缺少安全摘要能力，世界保持只读。');
    if (raw === null) return {digest: null, revision: null};
    try {
      const bytes = await cryptoAPI.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return checkedPoint({digest: [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''), revision: worldRevision}, false);
    } catch (error) {throw unavailable(error);}
  }

  async function verify(point) {
    checkedPoint(point);
    return transaction('readonly', record => {
      if (record !== undefined && !matches(checkedRecord(record), point)) throw conflict();
    });
  }

  async function reserve(expected, next) {
    checkedPoint(expected);checkedPoint(next, false);
    return transaction('readwrite', (current, store) => {
      if (current !== undefined) {
        checkedRecord(current);
        if (!matches(current, expected)) {
          if (current.owner === owner && matches(current, next) && current.previousDigest === expected.digest && current.previousRevision === expected.revision) {
            const previous = expected.digest === null ? null : {schemaVersion: 1, ...expected, previousDigest: null, previousRevision: null, owner};
            return {record: current, previous};
          }
          throw conflict();
        }
      }
      const record = {schemaVersion: 1, ...next, previousDigest: expected.digest, previousRevision: expected.revision, owner};
      store.put(record, GAME_CHECKPOINT.key);
      return {record, previous: current ?? null};
    });
  }

  async function rollback(reservation) {
    checkedRecord(reservation?.record);
    return transaction('readwrite', (current, store) => {
      if (current === undefined || !sameRecord(checkedRecord(current), reservation.record) || current.owner !== owner) throw conflict();
      if (reservation.previous === null) store.delete(GAME_CHECKPOINT.key);
      else store.put(checkedRecord(reservation.previous), GAME_CHECKPOINT.key);
    });
  }

  return Object.freeze({readonly, owner, fingerprint, verify, reserve, rollback});
}

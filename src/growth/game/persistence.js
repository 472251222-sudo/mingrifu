import {applyGameCommand, createGameWorld, validateGameWorld} from './world.js';

// This namespace is independent of P1/V3/V4. Limits count UTF-8 bytes of the
// actual JSON record and reject it before parsing; no history is ever trimmed.
export const GAME_PERSISTENCE = Object.freeze({
  key: 'mingrifu-growth-game-v1',
  lockName: 'mingrifu-growth-game-v1:save',
  maxRawBytes: 8 * 1024 * 1024,
});

export class GamePersistenceError extends Error {
  constructor(code, message, {raw = null, cause} = {}) {
    super(message, cause === undefined ? undefined : {cause});
    this.name = 'GamePersistenceError';
    this.code = code;
    this.raw = raw;
  }
}

const fault = (code, message, raw = null, cause) => new GamePersistenceError(code, message, {raw, cause});
const readonlyFault = () => fault('readonly', '当前浏览器没有可用的安全保存锁，世界保持只读。请在 localhost 或安全来源使用支持 Web Locks 的浏览器。');

function checkSize(raw) {
  if (raw.length > GAME_PERSISTENCE.maxRawBytes || new TextEncoder().encode(raw).byteLength > GAME_PERSISTENCE.maxRawBytes) {
    throw fault('save_too_large', '世界记录超过 8 MiB 安全读取上限，原始记录已保留。请下载原始记录后检查。', raw);
  }
}

function checkedWorld(world, raw = null) {
  if (world?.schemaVersion !== 1) throw fault('unsupported_version', '世界存档版本暂不支持，原始记录已保留。请下载原始记录后检查。', raw);
  try { return validateGameWorld(world); }
  catch (error) { throw fault('invalid_world', error.message, raw, error); }
}

function parseWorld(raw) {
  checkSize(raw);
  let world;
  try { world = JSON.parse(raw); }
  catch (error) { throw fault('invalid_json', '世界存档无法解析，原始记录已保留。可以重新读取或下载原始记录。', raw, error); }
  return checkedWorld(world, raw);
}

/** Safe synchronous reads and serialized, optimistic saves for this world only. */
export function createGamePersistence(options = {}) {
  let storage, storageError, locks;
  const injectedStorage = Object.hasOwn(options, 'storage');
  try { if (injectedStorage) storage = options.storage; }
  catch (error) { storageError = error; }
  try { locks = Object.hasOwn(options, 'locks') ? options.locks : globalThis.navigator?.locks; }
  catch { locks = null; }
  let readonly = true;
  try { readonly = typeof locks?.request !== 'function'; }
  catch { /* A denied lock capability is also an explicit read-only mode. */ }

  function currentStorage() {
    try {
      if (storageError) throw storageError;
      // Default browser access is retried on every read/transaction so a
      // temporary permission denial does not poison the service permanently.
      return injectedStorage ? storage : globalThis.localStorage;
    } catch (error) {
      throw fault('storage_unavailable', '浏览器禁止或无法读取世界存档，现有记录未修改。请检查存储权限后重新读取。', null, error);
    }
  }

  function readFrom(readStorage) {
    let raw;
    try {
      if (!readStorage || typeof readStorage.getItem !== 'function') throw new Error('localStorage 不可用');
      raw = readStorage.getItem(GAME_PERSISTENCE.key);
    } catch (error) {
      throw fault('storage_unavailable', '浏览器禁止或无法读取世界存档，现有记录未修改。请检查存储权限后重新读取。', null, error);
    }
    if (raw === null) return {world: checkedWorld(createGameWorld()), token: null, isNew: true, raw: null};
    if (typeof raw !== 'string') throw fault('invalid_json', '世界存档不是有效的文本记录，原始记录未修改。');
    return {world: parseWorld(raw), token: raw, isNew: false, raw};
  }

  function read() { return readFrom(currentStorage()); }

  async function save(candidate, expectedToken) {
    if (readonly) throw readonlyFault();
    if (expectedToken !== null && typeof expectedToken !== 'string') throw fault('invalid_token', '保存凭据无效，请重新读取世界后再操作。');
    checkedWorld(candidate);
    // Capture before yielding to lock acquisition. Caller changes cannot alter
    // the validated transaction while it is queued behind another tab.
    let candidateRaw;
    try { candidateRaw = JSON.stringify(candidate); }
    catch (error) { throw fault('invalid_world', '世界无法序列化，当前世界未修改。', null, error); }
    let captured;
    try { captured = parseWorld(candidateRaw); }
    catch (error) {
      // raw always means the record already in storage. The rejected candidate
      // is pending work, never a replacement for a downloadable original.
      throw fault(error.code, error.message, null, error);
    }
    try {
      return await locks.request(GAME_PERSISTENCE.lockName, {mode: 'exclusive'}, () => {
        // Resolve once inside the lock: token check and write must target the
        // same Storage object even if the browser getter subsequently changes.
        const writeStorage = currentStorage();
        const current = readFrom(writeStorage);
        if (current.token !== expectedToken) throw fault('conflict', '另一页面已保存新的世界。请重新读取后再操作，当前操作尚未保存。', current.raw);
        const revision = current.isNew ? 0 : current.world.revision + 1;
        if (captured.revision !== revision) throw fault('invalid_revision', '世界版本没有连续递增，请重新读取后再操作。', current.raw);
        try { writeStorage.setItem(GAME_PERSISTENCE.key, candidateRaw); }
        catch (error) { throw fault('write_failed', '世界保存失败，资源和布局保持原样。请重试同一操作或取消。', current.raw, error); }
        return {world: captured, token: candidateRaw, isNew: false, raw: candidateRaw};
      });
    } catch (error) {
      if (error instanceof GamePersistenceError) throw error;
      throw fault('lock_failed', '无法取得安全保存锁，当前操作尚未保存。请重试或重新读取。', null, error);
    }
  }

  return Object.freeze({readonly, read, save});
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * The same transaction controller is consumed by React and exercised in Node.
 * A candidate is visible only in pending; world always holds the last commit
 * (or an explicitly unsaved, read-only initial preview).
 */
export function createGameWorldController({persistence = createGamePersistence()} = {}) {
  let state = Object.freeze({
    world: freeze(createGameWorld()), status: 'loading', busy: false,
    readonly: persistence.readonly, error: null, pending: null, raw: null, saved: false,
  });
  let token = null, operating = false, initialization = null, attempt = null;
  const listeners = new Set();
  const publish = patch => {
    state = Object.freeze({...state, ...patch});
    for (const listener of listeners) listener();
  };
  const committed = result => {
    token = result.token;
    attempt = null;
    publish({world: freeze(result.world), raw: result.raw, saved: !result.isNew,
      status: 'ready', busy: false, readonly: persistence.readonly,
      error: persistence.readonly ? readonlyFault() : null, pending: null});
  };
  const failed = (error, initial = false) => {
    const readFault = ['storage_unavailable', 'invalid_json', 'invalid_world', 'unsupported_version', 'save_too_large'].includes(error.code);
    publish({busy: false, status: initial || readFault ? 'fault' : 'ready',
      readonly: persistence.readonly || initial || readFault || error.code === 'conflict',
      error, raw: error.raw ?? state.raw, pending: attempt?.pending ?? null});
  };

  async function persistAttempt() {
    try {
      const result = await persistence.save(attempt.pending.candidate, attempt.token);
      committed(result);
      return true;
    } catch (error) {
      // Only initial seed contention is resolved automatically: both tabs must
      // adopt the one saved seed, never grant a second initial gift.
      if (attempt.pending.kind === 'initial' && error.code === 'conflict') {
        try {
          const current = persistence.read();
          if (!current.isNew) { committed(current); return true; }
        } catch (readError) { error = readError; }
      }
      failed(error, attempt.pending.kind === 'initial');
      return false;
    } finally {
      operating = false;
    }
  }

  async function reload() {
    if (operating) return false;
    operating = true;
    attempt = null;
    publish({status: 'loading', busy: true, error: null, pending: null});
    try {
      const result = persistence.read();
      token = result.token;
      if (!result.isNew || persistence.readonly) {
        committed(result);
        operating = false;
        return true;
      }
      const pending = freeze({kind: 'initial', command: null, candidate: result.world});
      attempt = {pending, token: result.token};
      publish({world: pending.candidate, raw: result.raw, saved: false, pending});
      return await persistAttempt();
    } catch (error) {
      token = null;
      publish({world: freeze(createGameWorld()), raw: error.raw ?? null, saved: false,
        status: 'fault', busy: false, readonly: true, error, pending: null});
      operating = false;
      return false;
    }
  }

  function initialize() {
    if (!initialization) initialization = reload();
    return initialization;
  }

  async function run(command) {
    if (operating || attempt || state.status !== 'ready' || state.readonly || !state.saved) return false;
    let copied, candidate;
    try {
      copied = structuredClone(command);
      candidate = applyGameCommand(state.world, copied);
    } catch (error) {
      publish({error: fault('invalid_command', error.message, state.raw, error)});
      return false;
    }
    if (candidate === state.world) { publish({error: null}); return true; }
    operating = true;
    const pending = freeze({kind: 'command', command: copied, candidate});
    attempt = {pending, token};
    publish({busy: true, error: null, pending});
    return persistAttempt();
  }

  async function retry() {
    if (operating || !attempt || persistence.readonly || state.error?.code === 'conflict' || ['invalid_json', 'invalid_world', 'unsupported_version', 'save_too_large'].includes(state.error?.code)) return false;
    operating = true;
    publish({busy: true, error: null});
    return persistAttempt();
  }

  function cancel() {
    if (operating || !attempt) return false;
    const blocked = state.readonly;
    attempt = null;
    publish({pending: null, error: blocked ? state.error : null});
    return true;
  }

  return Object.freeze({
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    initialize, run, retry, cancel, reload,
  });
}

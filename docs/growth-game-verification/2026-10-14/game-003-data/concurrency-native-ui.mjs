import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {createGameWorld, applyGameCommand} from '../../../../src/growth/game/world.js';
import {GAME_CHECKPOINT} from '../../../../src/growth/game/checkpoint.js';

const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = fileURLToPath(new URL('./', import.meta.url)), repository = fileURLToPath(new URL('../../../../', import.meta.url));
const prefix = `${directory}concurrency-browser-${process.env.GAME_GUARD_RUN_ID || Date.now()}`;
const key = 'mingrifu-growth-game-v1', lock = `${key}:save`, seedRaw = JSON.stringify(createGameWorld());
const cacheDir = await mkdtemp(join(tmpdir(), 'mingrifu-concurrency-vite-'));
const server = await createServer({configFile: `${repository}vite.game.config.mjs`, cacheDir, server: {host: '127.0.0.1', port: 5194, strictPort: true}});
await server.listen();
const origin = 'http://127.0.0.1:5194/';
const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}), results = [];
const settle = page => page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true' && document.querySelector('main')?.dataset.saveStatus !== 'loading');
const state = page => page.evaluate(key => ({main: {...document.querySelector('main').dataset}, xp: Number(document.querySelector('[aria-label="永久XP"]').textContent.split(' ')[0]), bp: Number(document.querySelector('[aria-label="可用BP"]').textContent.split(' ')[0]), error: document.querySelector('.game-save-error')?.textContent ?? null, raw: localStorage.getItem(key), events: window.nativeEvents ?? []}), key);
const record = async page => page.evaluate(configuration => new Promise((resolve, reject) => {
  const request = indexedDB.open(configuration.database, 1);request.onerror = () => reject(request.error);
  request.onsuccess = () => {const db = request.result, transaction = db.transaction(configuration.store, 'readonly'), item = transaction.objectStore(configuration.store).get(configuration.key);item.onsuccess = () => resolve(item.result);transaction.oncomplete = () => db.close();};
}), GAME_CHECKPOINT);
async function context(settings = {}) {
  const ctx = await browser.newContext({viewport: {width: settings.width ?? 1280, height: 800}, isMobile: Boolean(settings.mobile), hasTouch: Boolean(settings.mobile), acceptDownloads: true});
  await ctx.addInitScript(({key, faultKind, configuration}) => {
    localStorage.setItem('mingrifu-growth-world-p1-v1', 'isolated-p1');sessionStorage.setItem('mingrifu-v3-demo-1', 'isolated-v3');localStorage.setItem('mingrifu-v4', 'isolated-v4');
    window.nativeEvents = [];
    addEventListener('storage', event => {if (event.key === key) window.nativeEvents.push({at: Date.now(), raw: event.newValue});});
    if (faultKind === 'missing-idb') Object.defineProperty(window, 'indexedDB', {configurable: true, value: undefined});
    if (faultKind === 'missing-crypto') Object.defineProperty(window, 'crypto', {configurable: true, value: undefined});
    if (['quota', 'rollback-abort'].includes(faultKind)) {
      const nativeSet = Storage.prototype.setItem;
      window.failWorldWrite = true;
      Storage.prototype.setItem = function(name, value) {if (name === key && window.failWorldWrite) {window.failedCandidate = value;throw new DOMException('injected quota', 'QuotaExceededError');}return nativeSet.call(this, name, value);};
    }
    if (['guard-abort', 'rollback-abort'].includes(faultKind)) {
      const method = faultKind === 'guard-abort' ? 'put' : 'delete', original = IDBObjectStore.prototype[method];
      window.abortGuard = true;
      IDBObjectStore.prototype[method] = function(...args) {
        const request = original.apply(this, args);
        if (window.abortGuard && this.transaction.db.name === configuration.database && this.name === configuration.store) request.addEventListener('success', () => this.transaction.abort());
        return request;
      };
    }
  }, {key, faultKind: settings.faultKind, configuration: GAME_CHECKPOINT});
  return ctx;
}
async function control(ctx, raw = seedRaw) {
  const page = await ctx.newPage();await page.route('**/__guard-control', request => request.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><title>isolated control</title>'}));
  await page.goto(`${origin}__guard-control`);if (raw !== null) await page.evaluate(({key, raw}) => localStorage.setItem(key, raw), {key, raw});return page;
}
async function effort(page, minutes) {
  await page.getByRole('button', {name: '记录模拟努力', exact: true}).click();await page.getByRole('button', {name: `${minutes} 分钟`, exact: true}).click();
}
const sentinels = page => page.evaluate(() => [localStorage.getItem('mingrifu-growth-world-p1-v1'), sessionStorage.getItem('mingrifu-v3-demo-1'), localStorage.getItem('mingrifu-v4')]);

try {
  for (let index = 0; index < 16; index++) {
    const ctx = await context();
    try {
      await control(ctx);
      const a = await ctx.newPage(), b = await ctx.newPage();await Promise.all([a.goto(origin), b.goto(origin)]);await Promise.all([settle(a), settle(b)]);
      const initialA = await state(a), initialB = await state(b);assert.equal(initialA.raw, seedRaw);assert.equal(initialB.raw, seedRaw);
      assert.ok(await a.evaluate(() => [Storage.prototype.getItem, Storage.prototype.setItem, navigator.locks.request, indexedDB.open].every(fn => Function.prototype.toString.call(fn).includes('[native code]'))));
      await Promise.all([a,b].map(page => page.getByRole('button', {name: '记录模拟努力', exact: true}).click()));
      await a.evaluate(lock => {window.hold = navigator.locks.request(lock, {mode: 'exclusive'}, () => new Promise(resolve => {window.release = resolve;}));}, lock);await a.waitForFunction(() => typeof window.release === 'function');
      const first = index % 2 ? a : b, second = index % 2 ? b : a;
      await first.getByRole('button', {name: `${first === a ? 10 : 25} 分钟`, exact: true}).click();await second.getByRole('button', {name: `${second === a ? 10 : 25} 分钟`, exact: true}).click();
      const queue = await a.evaluate(() => navigator.locks.query());assert.equal(queue.pending.filter(item => item.name === lock).length, 2);
      await a.evaluate(() => window.release());
      await Promise.all([a,b].map(page => page.waitForFunction(() => document.querySelector('main').dataset.worldRevision === '1' || document.querySelector('.game-save-error'))));
      const sa = await state(a), sb = await state(b), success = [sa,sb].filter(snapshot => snapshot.main.readonly === 'false');assert.equal(success.length, 1, 'native UI race must have exactly one published commit');
      const winner = sa.main.readonly === 'false' ? a : b, loser = winner === a ? b : a, committed = winner === a ? sa : sb, rejected = loser === a ? sa : sb;
      assert.equal(rejected.xp, 0);assert.equal(rejected.bp, 30);assert.ok(rejected.error);
      const checkpoint = await record(winner);assert.equal(checkpoint.revision, 1);assert.deepEqual(Object.keys(checkpoint).sort(), ['digest','owner','previousDigest','previousRevision','revision','schemaVersion']);
      await loser.getByRole('button', {name: '重新读取', exact: true}).click();await settle(loser);
      const loaded = await state(loser);assert.equal(loaded.xp, committed.xp);assert.equal(loaded.bp, committed.bp);assert.equal(loaded.main.readonly, 'false');assert.equal(JSON.parse(loaded.raw).efforts.length, 1);
      await winner.reload();await settle(winner);assert.equal((await state(winner)).xp, committed.xp);assert.equal(JSON.parse((await state(winner)).raw).efforts.length, 1);
      assert.deepEqual(await sentinels(winner), ['isolated-p1', 'isolated-v3', 'isolated-v4']);
      if (index === 0) {await winner.screenshot({path: `${prefix}-race-winner.png`, fullPage: true});await loser.screenshot({path: `${prefix}-race-reloaded.png`, fullPage: true});}
      results.push({name: 'native-ui-two-tabs', index, status: 'passed', queue, winnerXP: committed.xp, loserBeforeReloadXP: rejected.xp, finalXP: loaded.xp, events: JSON.parse(loaded.raw).efforts.map(event => event.id)});
    } catch (error) {results.push({name: 'native-ui-two-tabs', index, status: 'failed', error: error.stack});throw error;}
    finally {await ctx.close();}
  }

  {
    const ctx = await context();
    try {
      const observer = await control(ctx, null), a = await ctx.newPage(), b = await ctx.newPage();await Promise.all([a.goto(origin), b.goto(origin)]);await Promise.all([settle(a), settle(b)]);
      const sa = await state(a), sb = await state(b);assert.equal(sa.main.saved, 'true');assert.equal(sb.main.saved, 'true');assert.equal(sa.raw, sb.raw);assert.equal(JSON.parse(sa.raw).objects.length, 1);assert.equal(sa.bp, 30);assert.equal(sb.bp, 30);
      const before = await record(a);await a.reload();await settle(a);assert.deepEqual(await record(a), before);assert.equal((await state(a)).raw, sa.raw);
      results.push({name: 'native-null-seed-once-refresh', status: 'passed', objects: 1, bp: 30, revision: JSON.parse(sa.raw).revision, storageEvents: (await observer.evaluate(() => window.nativeEvents)).length});
    } finally {await ctx.close();}
  }

  for (const faultKind of ['guard-abort', 'quota', 'rollback-abort']) {
    // Fault scenarios are separate contexts and explicitly instrumented;
    // the 16 native race contexts above have no API replacements.
    const ctx = await context({faultKind});
    try {
      const controlPage = await control(ctx, null);
      // Seed using the native get/set held by a new uninstrumented page route
      // is unnecessary: temporarily disable only our quota fault for fixture.
      await controlPage.evaluate(({key, raw}) => {window.failWorldWrite = false;localStorage.setItem(key, raw);}, {key, raw: seedRaw});
      const page = await ctx.newPage();await page.goto(origin);await settle(page);
      await effort(page, 25);await page.waitForFunction(() => Boolean(document.querySelector('.game-save-error')));
      const failed = await state(page);assert.equal(failed.xp, 0);assert.equal(failed.bp, 30);assert.equal(failed.raw, seedRaw);
      const failedID = await page.evaluate(() => window.failedCandidate ? JSON.parse(window.failedCandidate).efforts[0].id : null);
      if (faultKind === 'rollback-abort') assert.equal(failed.main.readonly, 'true');
      await page.screenshot({path: `${prefix}-${faultKind}-failed.png`, fullPage: true});
      await page.evaluate(() => {window.failWorldWrite = false;window.abortGuard = false;});
      await page.getByRole('button', {name: '重试保存', exact: true}).click();await page.waitForFunction(() => document.querySelector('main').dataset.worldRevision === '1');
      const saved = await state(page);assert.equal(saved.xp, 25);assert.equal(saved.bp, 35);assert.equal(JSON.parse(saved.raw).efforts.length, 1);
      if (failedID) assert.equal(JSON.parse(saved.raw).efforts[0].id, failedID);
      assert.equal((await record(page)).revision, 1);await page.reload();await settle(page);assert.equal((await state(page)).xp, 25);
      assert.deepEqual(await sentinels(page), ['isolated-p1', 'isolated-v3', 'isolated-v4']);
      results.push({name: faultKind, status: 'passed', failedRawPreserved: true, failedReadonly: failed.main.readonly, sameEventID: failedID !== null, finalXP: saved.xp, finalBP: saved.bp});
    } catch (error) {results.push({name: faultKind, status: 'failed', error: error.stack});throw error;}
    finally {await ctx.close();}
  }

  for (const faultKind of ['missing-idb', 'missing-crypto']) {
    const ctx = await context({faultKind});
    try {await control(ctx);const page = await ctx.newPage();await page.goto(origin);await settle(page);const read = await state(page);assert.equal(read.main.readonly, 'true');assert.equal(read.raw, seedRaw);assert.equal(read.xp, 0);assert.equal(read.bp, 30);assert.equal(await page.getByRole('button', {name: '记录模拟努力', exact: true}).isDisabled(), true);results.push({name: faultKind, status: 'passed', readonly: true, rawPreserved: true});}
    finally {await ctx.close();}
  }

  {
    const ctx = await context();
    try {
      const before = await control(ctx), candidate = JSON.stringify(applyGameCommand(createGameWorld(), {type: 'effort', event: {id: 'crashed-reservation', source: 'simulation', minutes: 10, occurredAt: '2026-10-14T00:00:00.000Z'}}));
      await before.evaluate(async ({configuration, raw, candidate}) => {
        const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const metadata = {schemaVersion: 1, digest: await digest(candidate), revision: 1, previousDigest: await digest(raw), previousRevision: 0, owner: 'crashed-owner'};
        await new Promise((resolve, reject) => {const request = indexedDB.open(configuration.database, 1);request.onupgradeneeded = () => request.result.createObjectStore(configuration.store);request.onerror = () => reject(request.error);request.onsuccess = () => {const db = request.result, transaction = db.transaction(configuration.store, 'readwrite');transaction.objectStore(configuration.store).put(metadata, configuration.key);transaction.oncomplete = () => {db.close();resolve();};transaction.onabort = () => reject(transaction.error);};});
      }, {configuration: GAME_CHECKPOINT, raw: seedRaw, candidate});
      const page = await ctx.newPage();await page.goto(origin);await settle(page);const rejected = await state(page);assert.equal(rejected.main.readonly, 'true');assert.equal(rejected.main.saved, 'false');assert.equal(rejected.raw, seedRaw);
      const downloading = page.waitForEvent('download');await page.getByRole('button', {name: '下载原始记录', exact: true}).click();assert.equal(await readFile(await (await downloading).path(), 'utf8'), seedRaw);
      await page.getByRole('button', {name: '重新读取', exact: true}).click();await settle(page);assert.equal((await state(page)).raw, seedRaw);assert.equal((await record(page)).owner, 'crashed-owner');
      results.push({name: 'leading-checkpoint-crash-readonly', status: 'passed', rawPreserved: true, metadataPreserved: true, downloadedExactRaw: true});
    } finally {await ctx.close();}
  }
} finally {
  const files = ['persistence.js','checkpoint.js','useGameWorld.js','GameApp.jsx'];
  const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(`${repository}src/growth/game/${file}`)).digest('hex')])));
  const evidence = {chrome: browser.version(), origin, cacheDir, hashes, results};
  await writeFile(`${prefix}.json`, JSON.stringify(evidence, null, 2));console.log(JSON.stringify(evidence, null, 2));await browser.close();await server.close();
}

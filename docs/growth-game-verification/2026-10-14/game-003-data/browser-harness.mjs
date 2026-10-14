import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {createGameWorld} from '../../../../src/growth/game/world.js';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const runId = process.env.GAME_DATA_RUN_ID || Date.now();
const prefix = `${output}browser-${runId}`;
const key = 'mingrifu-growth-game-v1';
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>GAME-003 数据验证</title><style>body{font:16px system-ui;margin:18px;background:#f8f5ee}button{font:inherit;padding:10px;margin:5px}pre{white-space:pre-wrap;word-break:break-all}output{display:block}p{max-width:50em}</style></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {useGameWorld} from '/src/growth/game/useGameWorld.js';
function Harness(){
 const game=useGameWorld(); window.game=game;
 return React.createElement('main', {'data-state':game.status,'data-busy':String(game.busy)},
  React.createElement('h1',null,'GAME-003 存档事务验证'),
  React.createElement('p',null,'此页只验证真实 React Hook 与隔离存储，不代表游戏界面或美术验收。'),
  React.createElement('output',{'aria-label':'状态'}, JSON.stringify({status:game.status,busy:game.busy,readonly:game.readonly,saved:game.saved,revision:game.world.revision,xp:game.world.xp,bp:game.world.bp,efforts:game.world.efforts.length,pending:game.pending?.kind??null})),
  React.createElement('pre',{'aria-label':'错误'},game.error?game.error.code+': '+game.error.message:'无错误'),
  React.createElement('button',{onClick:()=>game.run({type:'build',assetId:'wildflowers',x:1,y:0}),disabled:game.busy||game.readonly||!!game.pending},'建野花'),
  React.createElement('button',{onClick:()=>game.run({type:'effort',event:{id:'touch-effort',source:'simulation',minutes:25,occurredAt:'2026-10-14T00:00:00.000Z'}}),disabled:game.busy||game.readonly||!!game.pending},'模拟努力25分钟'),
  React.createElement('button',{onClick:()=>game.retry(),disabled:game.busy||!game.pending||game.error?.code==='conflict'},'重试'),
  React.createElement('button',{onClick:()=>game.cancel(),disabled:game.busy||!game.pending},'取消'),
  React.createElement('button',{onClick:()=>game.reload(),disabled:game.busy},'重新读取'),
  React.createElement('button',{disabled:game.raw===null,onClick:()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([game.raw],{type:'application/json;charset=utf-8'}));a.download='game-world-original.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0);}},'下载原始记录'));
}
let reactRoot;
window.remount=()=>{reactRoot?.unmount();reactRoot=createRoot(document.getElementById('root'));reactRoot.render(React.createElement(React.StrictMode,null,React.createElement(Harness)));};
window.remount();
</script></body></html>`;

const server = await createServer({configFile: `${root}vite.game.config.mjs`,
  server: {host: '127.0.0.1', port: 5194, strictPort: true},
  plugins: [{name: 'game-data-test-harness', configureServer(dev) {
    dev.middlewares.use(async (request, response, next) => {
      if (request.url?.split('?')[0] !== '/__game-data-harness.html') return next();
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(await dev.transformIndexHtml('/__game-data-harness.html', html));
    });
  }}]});
await server.listen();
const url = 'http://127.0.0.1:5194/__game-data-harness.html';
const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const results = [];
const flower = {type: 'build', assetId: 'wildflowers', x: 1, y: 0};
const effort = {type: 'effort', event: {id: 'browser-retry-event', source: 'simulation', minutes: 50, occurredAt: '2026-10-14T00:00:00.000Z'}};
const settled = page => page.waitForFunction(() => window.game && !window.game.busy && window.game.status !== 'loading');
const snapshot = page => page.evaluate(() => ({world: window.game.world, status: window.game.status, busy: window.game.busy, readonly: window.game.readonly, saved: window.game.saved, code: window.game.error?.code ?? null, pending: window.game.pending, raw: window.game.raw, writes: window.saveWrites}));
const sentinels = page => page.evaluate(() => [localStorage.getItem('mingrifu-growth-world-p1-v1'), sessionStorage.getItem('mingrifu-v3-demo-1'), localStorage.getItem('mingrifu-v4')]);
const run = async (page, command) => {const success = await page.evaluate(command => window.game.run(command), command); await settled(page); return success;};

async function context({raw, noLocks = false, denyStorage = false, failWrites = false, mobile = false, width = 1280} = {}) {
  const ctx = await browser.newContext({viewport: {width, height: mobile ? 700 : 800}, hasTouch: mobile, isMobile: mobile, locale: 'zh-CN', acceptDownloads: true});
  await ctx.addInitScript(({key, raw, noLocks, denyStorage, failWrites}) => {
    localStorage.setItem('mingrifu-growth-world-p1-v1', 'isolated-p1');
    sessionStorage.setItem('mingrifu-v3-demo-1', 'isolated-v3');
    localStorage.setItem('mingrifu-v4', 'isolated-v4');
    if (raw !== undefined && localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    window.saveWrites = 0;
    window.failWrites = failWrites;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key && window.failWrites) throw new DOMException('injected quota failure', 'QuotaExceededError');
      original.call(this, name, value);
      if (name === key) window.saveWrites++;
    };
    if (noLocks) Object.defineProperty(navigator, 'locks', {configurable: true, value: undefined});
    if (denyStorage) Object.defineProperty(window, 'localStorage', {configurable: true, get() {throw new DOMException('injected denied getter', 'SecurityError');}});
  }, {key, raw, noLocks, denyStorage, failWrites});
  return ctx;
}

async function scenario(name, settings, callback) {
  const ctx = await context(settings), page = await ctx.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  try {
    await page.goto(url); await settled(page);
    const evidence = await callback(page, ctx);
    assert.deepEqual(errors, []);
    await page.screenshot({path: `${prefix}-${name}.png`, fullPage: true});
    results.push({name, status: 'passed', evidence});
  } catch (error) {
    await page.screenshot({path: `${prefix}-${name}-failure.png`, fullPage: true});
    results.push({name, status: 'failed', error: error.stack, errors});
    throw error;
  } finally {await ctx.close();}
}

try {
  await scenario('desktop-strict-quota-refresh', {}, async page => {
    assert.equal((await snapshot(page)).saved, true);
    assert.equal((await snapshot(page)).writes, 1, 'StrictMode seeds exactly once');
    await page.evaluate(() => window.remount()); await settled(page);
    assert.equal((await snapshot(page)).writes, 1, 'remount does not duplicate gift');
    assert.equal(await run(page, flower), true);
    assert.equal((await snapshot(page)).world.bp, 28);
    const original = (await snapshot(page)).raw;
    await page.evaluate(() => {window.failWrites = true;});
    assert.equal(await run(page, effort), false);
    const failed = await snapshot(page);
    assert.equal(failed.world.xp, 0); assert.equal(failed.world.bp, 28);
    assert.equal(failed.code, 'write_failed'); assert.equal(failed.raw, original);
    assert.equal(failed.pending.command.event.id, 'browser-retry-event');
    assert.equal(await page.evaluate(() => window.game.retry()), false); await settled(page);
    assert.equal((await snapshot(page)).world.xp, 0);
    await page.evaluate(() => {window.failWrites = false;});
    assert.equal(await page.evaluate(() => window.game.retry()), true); await settled(page);
    assert.equal((await snapshot(page)).world.xp, 50); assert.equal((await snapshot(page)).world.bp, 38);
    const beforeDuplicate = await snapshot(page);
    assert.equal(await run(page, effort), true);
    assert.equal((await snapshot(page)).writes, beforeDuplicate.writes);
    await page.reload(); await settled(page);
    const refreshed = await snapshot(page);
    assert.equal(refreshed.world.revision, 2); assert.equal(refreshed.world.efforts.length, 1);
    assert.equal(refreshed.world.objects.length, 2); assert.equal(refreshed.writes, 0);
    assert.deepEqual(await sentinels(page), ['isolated-p1', 'isolated-v3', 'isolated-v4']);
    return {bp: refreshed.world.bp, xp: refreshed.world.xp, revision: refreshed.world.revision, efforts: refreshed.world.efforts.length, saved: refreshed.saved};
  });

  await scenario('two-tabs-real-web-locks', {raw: JSON.stringify(createGameWorld())}, async (a, ctx) => {
    const b = await ctx.newPage(); await b.goto(url); await settled(b);
    // Hold the actual origin lock until both React clients have queued saves.
    await a.evaluate(() => {
      window.hold = navigator.locks.request('mingrifu-growth-game-v1:save', {mode: 'exclusive'}, () => new Promise(resolve => {window.releaseHold = resolve;}));
    });
    await a.waitForFunction(() => typeof window.releaseHold === 'function');
    await Promise.all([
      a.evaluate(command => {window.racingSave = window.game.run(command);}, flower),
      b.evaluate(command => {window.racingSave = window.game.run(command);}, {...flower, x: 5}),
    ]);
    await a.evaluate(() => window.releaseHold());
    const outcomes = await Promise.all([a.evaluate(() => window.racingSave), b.evaluate(() => window.racingSave)]);
    assert.equal(outcomes.filter(Boolean).length, 1);
    await Promise.all([settled(a), settled(b)]);
    const winner = outcomes[0] ? a : b, loser = outcomes[0] ? b : a;
    const won = await snapshot(winner), lost = await snapshot(loser);
    assert.equal(won.world.bp, 28); assert.equal(won.world.revision, 1);
    assert.equal(lost.world.bp, 30); assert.equal(lost.code, 'conflict'); assert.equal(lost.readonly, true);
    assert.equal(await loser.evaluate(() => window.game.retry()), false);
    assert.equal(await loser.evaluate(() => localStorage.getItem('mingrifu-growth-game-v1')), won.raw);
    assert.equal(await loser.evaluate(() => window.game.reload()), true); await settled(loser);
    assert.equal((await snapshot(loser)).world.bp, 28);
    assert.deepEqual(await sentinels(loser), ['isolated-p1', 'isolated-v3', 'isolated-v4']);
    return {outcomes, winnerRevision: won.world.revision, loserCode: lost.code, loserReloadedBP: (await snapshot(loser)).world.bp};
  });

  await scenario('two-tabs-first-seed', {}, async (a, ctx) => {
    const b = await ctx.newPage(); await b.goto(url); await settled(b);
    const first = await snapshot(a), second = await snapshot(b);
    assert.equal(first.writes + second.writes, 1);
    assert.equal(first.raw, second.raw); assert.equal(second.saved, true);
    assert.equal(second.world.bp, 30); assert.equal(second.world.objects.length, 1);
    return {totalWrites: first.writes + second.writes, bp: second.world.bp, objects: second.world.objects.length};
  });

  for (const [name, raw, code] of [
    ['bad-json', '{保留原文\n broken', 'invalid_json'],
    ['unknown-version', JSON.stringify({...createGameWorld(), schemaVersion: 99}), 'unsupported_version'],
    ['invalid-world', JSON.stringify({...createGameWorld(), bp: -1}), 'invalid_world'],
  ]) await scenario(name, {raw}, async page => {
    const state = await snapshot(page);
    assert.equal(state.status, 'fault'); assert.equal(state.readonly, true); assert.equal(state.code, code);
    assert.equal(state.raw, raw); assert.equal(state.writes, 0); assert.equal(await run(page, flower), false);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', {name: '下载原始记录'}).click();
    const download = await downloading;
    assert.equal(await readFile(await download.path(), 'utf8'), raw);
    await page.getByRole('button', {name: '重新读取'}).click(); await settled(page);
    assert.equal(await page.evaluate(() => localStorage.getItem('mingrifu-growth-game-v1')), raw);
    return {code, readonly: state.readonly, writes: state.writes, rawDownloadExact: true};
  });

  for (const [name, raw] of [['no-locks-new', undefined], ['no-locks-existing', JSON.stringify(createGameWorld())]]) {
    await scenario(name, {raw, noLocks: true}, async page => {
      const state = await snapshot(page);
      assert.equal(state.status, 'ready'); assert.equal(state.readonly, true); assert.equal(state.code, 'readonly');
      assert.equal(state.saved, raw !== undefined); assert.equal(await run(page, flower), false);
      assert.equal((await snapshot(page)).writes, 0);
      return {saved: state.saved, readonly: state.readonly, writes: state.writes};
    });
  }

  await scenario('storage-getter-denied', {denyStorage: true}, async page => {
    const state = await snapshot(page);
    assert.equal(state.status, 'fault'); assert.equal(state.code, 'storage_unavailable');
    assert.equal(state.raw, null); assert.equal(state.saved, false); assert.equal(await run(page, flower), false);
    return {code: state.code, saved: state.saved, raw: state.raw};
  });

  await scenario('first-seed-quota-retry', {failWrites: true}, async page => {
    const failed = await snapshot(page);
    assert.equal(failed.status, 'fault'); assert.equal(failed.saved, false); assert.equal(failed.pending.kind, 'initial');
    assert.equal(await run(page, flower), false);
    await page.evaluate(() => {window.failWrites = false;});
    await page.getByRole('button', {name: '重试', exact: true}).click(); await settled(page);
    const saved = await snapshot(page);
    assert.equal(saved.saved, true); assert.equal(saved.world.bp, 30); assert.equal(saved.writes, 1); assert.equal(saved.world.objects.length, 1);
    return {saved: saved.saved, writes: saved.writes, bp: saved.world.bp};
  });

  for (const width of [320, 390]) await scenario(`phone-${width}-touch-persistence`, {mobile: true, width}, async page => {
    await page.getByRole('button', {name: '建野花', exact: true}).tap(); await settled(page);
    assert.equal((await snapshot(page)).world.bp, 28);
    await page.getByRole('button', {name: '模拟努力25分钟', exact: true}).tap(); await settled(page);
    assert.equal((await snapshot(page)).world.xp, 25); assert.equal((await snapshot(page)).world.bp, 33);
    await page.reload(); await settled(page);
    const state = await snapshot(page);
    assert.equal(state.world.bp, 33); assert.equal(state.world.xp, 25); assert.equal(state.world.objects.length, 2);
    assert.deepEqual(await sentinels(page), ['isolated-p1', 'isolated-v3', 'isolated-v4']);
    return {width, bp: state.world.bp, xp: state.world.xp, revision: state.world.revision};
  });
} finally {
  await writeFile(`${prefix}.json`, JSON.stringify({url, chromeVersion: browser.version(), results}, null, 2));
  console.log(JSON.stringify({url, chromeVersion: browser.version(), results}, null, 2));
  await browser.close(); await server.close();
}

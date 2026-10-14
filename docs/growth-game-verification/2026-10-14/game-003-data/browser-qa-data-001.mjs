import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {applyGameCommand, createGameWorld} from '../../../../src/growth/game/world.js';

const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('./', import.meta.url)), repository = fileURLToPath(new URL('../../../../', import.meta.url));
const prefix = `${output}qa-data-001-browser-${process.env.GAME_DATA_RUN_ID || Date.now()}`;
const key = 'mingrifu-growth-game-v1';
let world = applyGameCommand(createGameWorld(), {type: 'effort', event: {id: 'preserved-browser-effort', source: 'simulation', minutes: 25, occurredAt: '2026-10-14T00:00:00.000Z', label: '保留努力'}});
world = applyGameCommand(world, {type: 'build', assetId: 'wildflowers', x: 1, y: 0});
world = applyGameCommand(world, {type: 'store', id: 'o-1'});
const raw = ` \n${JSON.stringify(world, null, 2)}\n`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>QA-DATA-001 回归</title><style>body{font:16px system-ui;background:#f8f5ee;margin:18px}output,pre{display:block;white-space:pre-wrap;word-break:break-all}button{font:inherit;padding:10px}</style></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {useGameWorld} from '/src/growth/game/useGameWorld.js';
function Probe(){const game=useGameWorld();window.game=game;if(!window.firstReload)window.firstReload=game.reload;return React.createElement('main',null,
React.createElement('h1',null,'QA-DATA-001 权限恢复'),React.createElement('p',null,'隔离存档故障注入，验证同一个Hook恢复读取。'),
React.createElement('output',null,JSON.stringify({status:game.status,busy:game.busy,readonly:game.readonly,saved:game.saved,code:game.error?.code??null,xp:game.world.xp,bp:game.world.bp,revision:game.world.revision,nextId:game.world.nextId,efforts:game.world.efforts.map(e=>e.id),objects:game.world.objects.map(o=>({id:o.id,stored:o.stored}))})),
React.createElement('pre',null,game.error?.message??'原存档完整恢复'),React.createElement('button',{disabled:game.busy,onClick:async()=>{window.lastReload=await game.reload();}},'重新读取'));}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Probe)));
</script></body></html>`;
const server = await createServer({configFile: `${repository}vite.game.config.mjs`, server: {host: '127.0.0.1', port: 5194, strictPort: true}, plugins: [{name: 'qa-data-001-probe', configureServer(dev) {
  dev.middlewares.use(async (request, response, next) => {
    if (request.url?.split('?')[0] !== '/__qa-data-001.html') return next();
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(await dev.transformIndexHtml('/__qa-data-001.html', html));
  });
}}]});
await server.listen();
const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const results = [], url = 'http://127.0.0.1:5194/__qa-data-001.html';
const settled = page => page.waitForFunction(() => window.game && !window.game.busy && window.game.status !== 'loading');
const state = page => page.evaluate(() => ({world: window.game.world, raw: window.game.raw, saved: window.game.saved, readonly: window.game.readonly, status: window.game.status, code: window.game.error?.code ?? null, writes: window.saveWrites, sameHook: window.firstReload === window.game.reload}));
try {
  for (const [name, width, mobile] of [['desktop', 1280, false], ['phone320', 320, true], ['phone390', 390, true]]) {
    const context = await browser.newContext({viewport: {width, height: mobile ? 700 : 800}, isMobile: mobile, hasTouch: mobile, locale: 'zh-CN'});
    await context.addInitScript(({key, raw}) => {
      const nativeStorage = window.localStorage;
      nativeStorage.setItem(key, raw);
      nativeStorage.setItem('mingrifu-growth-world-p1-v1', 'isolated-p1');
      sessionStorage.setItem('mingrifu-v3-demo-1', 'isolated-v3');
      nativeStorage.setItem('mingrifu-v4', 'isolated-v4');
      window.denyStorage = true;
      window.saveWrites = 0;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) {setItem.call(this, name, value);if (name === key) window.saveWrites++;};
      Object.defineProperty(window, 'localStorage', {configurable: true, get() {
        if (window.denyStorage) throw new DOMException('temporary injected permission denial', 'SecurityError');
        return nativeStorage;
      }});
    }, {key, raw});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    try {
      await page.goto(url);await settled(page);
      const rejected = await state(page);
      assert.equal(rejected.status, 'fault');assert.equal(rejected.code, 'storage_unavailable');assert.equal(rejected.readonly, true);assert.equal(rejected.saved, false);assert.equal(rejected.writes, 0);
      await page.screenshot({path: `${prefix}-${name}-denied.png`, fullPage: true});
      await page.getByRole('button', {name: '重新读取'}).click();await settled(page);
      assert.equal((await state(page)).code, 'storage_unavailable');assert.equal((await state(page)).writes, 0);
      await page.evaluate(() => {window.denyStorage = false;});
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), raw);
      if (mobile) await page.getByRole('button', {name: '重新读取'}).tap();else await page.getByRole('button', {name: '重新读取'}).click();
      await settled(page);
      const recovered = await state(page);
      assert.equal(recovered.sameHook, true);assert.equal(recovered.status, 'ready');assert.equal(recovered.saved, true);assert.equal(recovered.readonly, false);assert.equal(recovered.code, null);assert.equal(recovered.raw, raw);assert.equal(recovered.writes, 0);
      assert.deepEqual(recovered.world, world);
      await page.screenshot({path: `${prefix}-${name}-recovered.png`, fullPage: true});
      const saved = await page.evaluate(() => window.game.run({type: 'effort', event: {id: 'after-recovery-effort', source: 'simulation', minutes: 10, occurredAt: '2026-10-14T01:00:00.000Z'}}));
      await settled(page);assert.equal(saved, true);
      const resumed = await state(page);
      assert.equal(resumed.world.xp, 35);assert.equal(resumed.world.bp, 35);assert.equal(resumed.world.revision, 4);assert.equal(resumed.writes, 1);
      assert.deepEqual(resumed.world.efforts.map(event => event.id), ['preserved-browser-effort', 'after-recovery-effort']);
      assert.equal(resumed.world.objects[0].id, 'o-1');assert.equal(resumed.world.objects[0].stored, true);assert.equal(resumed.world.objects[1].id, 'o-7');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), resumed.raw);
      assert.deepEqual(await page.evaluate(() => [localStorage.getItem('mingrifu-growth-world-p1-v1'), sessionStorage.getItem('mingrifu-v3-demo-1'), localStorage.getItem('mingrifu-v4')]), ['isolated-p1', 'isolated-v3', 'isolated-v4']);
      assert.deepEqual(errors, []);
      results.push({name, width, status: 'passed', sameHook: recovered.sameHook, recoveryWrites: recovered.writes, recoveredRevision: recovered.world.revision, recoveredXP: recovered.world.xp, recoveredBP: recovered.world.bp, resumedWrites: resumed.writes, resumedXP: resumed.world.xp, resumedBP: resumed.world.bp});
    } catch (error) {
      await page.screenshot({path: `${prefix}-${name}-failure.png`, fullPage: true});results.push({name, status: 'failed', error: error.stack, errors});throw error;
    } finally {await context.close();}
  }
} finally {
  await writeFile(`${prefix}.json`, JSON.stringify({chromeVersion: browser.version(), url, results}, null, 2));
  console.log(JSON.stringify({chromeVersion: browser.version(), url, results}, null, 2));
  await browser.close();await server.close();
}

import {createRequire} from 'node:module';
import {writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createGameWorld} from '../../../../../src/growth/game/world.js';
const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const runId = process.env.GAME_RACE_RUN_ID || Date.now();
const origin = 'http://127.0.0.1:5189', key = 'mingrifu-growth-game-v1', lockName = `${key}:save`, raw = JSON.stringify(createGameWorld());
const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}), runs = [];
const route = async (context, pageName) => {
  const page = await context.newPage();
  await page.route(`**/__builder-native-${pageName}`, request => request.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Native storage trace</title>'}));
  await page.goto(`${origin}/__builder-native-${pageName}`);
  return page;
};
try {
  for (const kind of ['production-service', 'native-protocol']) for (let index = 0; index < 12; index++) {
    const context = await browser.newContext({viewport: {width: 1000, height: 700}});
    try {
      const control = await route(context, 'control');
      await control.evaluate(({key, raw}) => localStorage.setItem(key, raw), {key, raw});
      const a = await context.newPage(), b = await context.newPage();
      await Promise.all([a.goto(origin + '/'), b.goto(origin + '/')]);
      await Promise.all([a,b].map(page => page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true' && document.querySelector('main').dataset.saved === 'true')));
      const setup = (page, client, minutes) => page.evaluate(async ({key, lockName, client, minutes, kind}) => {
        const trace = window.trace = [], log = item => trace.push({at: performance.timeOrigin + performance.now(), client, ...item});
        addEventListener('storage', event => {if (event.key === key) log({phase: 'storage-event', xp: JSON.parse(event.newValue).xp, nativeXP: JSON.parse(localStorage.getItem(key)).xp});});
        const {createGamePersistence} = await import('/src/growth/game/persistence.js');
        const {applyGameCommand} = await import('/src/growth/game/world.js');
        window.service = createGamePersistence();
        const loaded = window.loaded = service.read();
        const candidate = window.candidate = applyGameCommand(loaded.world, {type: 'effort', event: {id: `native-${client}`, source: 'simulation', minutes, occurredAt: '2026-10-14T00:00:00.000Z'}});
        window.start = () => {
          log({phase: 'queued', expectedXP: JSON.parse(loaded.token).xp});
          const saving = kind === 'production-service' ? service.save(candidate, loaded.token).then(result => ({ok: true, xp: result.world.xp})) : navigator.locks.request(lockName, {mode: 'exclusive'}, lock => {
            const actual = localStorage.getItem(key);
            log({phase: 'lock-enter-read', lockName: lock.name, actualXP: JSON.parse(actual).xp, expectedXP: JSON.parse(loaded.token).xp});
            if (actual !== loaded.token) {log({phase: 'conflict'});return {ok: false, code: 'conflict'};}
            localStorage.setItem(key, JSON.stringify(candidate));
            log({phase: 'write-return', nativeXP: JSON.parse(localStorage.getItem(key)).xp});
            return {ok: true, xp: candidate.xp};
          });
          window.done = saving.catch(error => ({ok: false, code: error.code, message: error.message})).then(result => {log({phase: 'resolved', ...result});return result;});
        };
        const button = document.createElement('button'); button.textContent = 'Native trace submit'; button.onclick = () => window.start(); button.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'; document.body.append(button);
        return {token: loaded.token, nativeFunctions: [Storage.prototype.getItem, Storage.prototype.setItem, navigator.locks.request].map(fn => Function.prototype.toString.call(fn).includes('[native code]'))};
      }, {key, lockName, client, minutes, kind});
      const initialA = await setup(a, 'A', 10), initialB = await setup(b, 'B', 25);
      if (initialA.token !== raw || initialB.token !== raw || initialA.nativeFunctions.some(value => !value) || initialB.nativeFunctions.some(value => !value)) throw Error('Invalid native fixture');
      await a.evaluate(lockName => {window.held = navigator.locks.request(lockName, {mode: 'exclusive'}, () => new Promise(resolve => {window.release = resolve;}));}, lockName);
      await a.waitForFunction(() => typeof window.release === 'function');
      await b.getByRole('button', {name:'Native trace submit', exact:true}).click();
      await a.getByRole('button', {name:'Native trace submit', exact:true}).click();
      const queue = await a.evaluate(() => navigator.locks.query());
      if (queue.pending.filter(item => item.name === lockName).length !== 2) throw Error('Both native saves must be queued');
      await a.evaluate(() => window.release());
      const outcomes = await Promise.all([a.evaluate(() => window.done), b.evaluate(() => window.done)]);
      const traces = (await Promise.all([a.evaluate(() => window.trace), b.evaluate(() => window.trace)])).flat().sort((left, right) => left.at - right.at);
      const fresh = await route(context, 'fresh');
      const finalRaw = await fresh.evaluate(key => localStorage.getItem(key), key);
      const run = {kind, index, initialTokensEqual: true, queue, outcomes, bothSucceeded: outcomes.every(result => result.ok), finalXP: JSON.parse(finalRaw).xp, traces};
      runs.push(run);
      console.log(JSON.stringify(run));
    } finally {await context.close();}
  }
} finally {
  const source = new URL('../../../../../src/growth/game/persistence.js', import.meta.url);
  const sha = createHash('sha256').update(await readFile(source)).digest('hex');
  await writeFile(`${output}native-visibility-${runId}.json`, JSON.stringify({chrome: browser.version(), persistenceSHA: sha, origin, key, lockName, runs}, null, 2));
  await browser.close();
}

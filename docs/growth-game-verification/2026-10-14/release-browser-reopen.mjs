import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const prefix = `release-browser-reopen-${process.env.GAME_RUN_ID || Date.now()}`;
const profile = await mkdtemp(join(tmpdir(), 'mingrifu-game-reopen-'));
const url = process.env.GAME_URL || 'http://127.0.0.1:5190/';
const options = {headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', viewport: {width: 1280, height: 900}, locale: 'zh-CN'};
let context;
const errors = [];
async function open() {
  context = await chromium.launchPersistentContext(profile, options);
  const page = context.pages()[0];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true' && document.querySelector('main')?.dataset.saved === 'true' && document.querySelector('main')?.dataset.saveStatus === 'ready');
  return page;
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const raw = localStorage.getItem('mingrifu-growth-game-v1');
    const guard = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mingrifu-growth-game-v1-checkpoint', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('checkpoint', 'readonly');
        const get = tx.objectStore('checkpoint').get('world');
        tx.oncomplete = () => {db.close(); resolve(get.result);};
        tx.onabort = () => {db.close(); reject(tx.error);};
      };
    });
    return {raw, guard, saved: document.querySelector('main').dataset.saved, readonly: document.querySelector('main').dataset.readonly};
  });
}
let result;
try {
  let page = await open();
  await page.getByRole('button', {name: '记录模拟努力', exact: true}).click();
  await page.getByRole('button', {name: '25 分钟', exact: true}).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mingrifu-growth-game-v1')).xp === 25 && document.querySelector('main')?.dataset.worldRevision === '1');
  await page.getByRole('dialog').waitFor({state: 'hidden'});
  const before = await snapshot(page);
  await page.screenshot({path: join(output, `${prefix}-before.png`), fullPage: true});
  await context.close(); context = null;
  // A new persistent-context launch starts a new owned Chrome process while
  // retaining only this isolated temporary profile, never the user's profile.
  page = await open();
  const after = await snapshot(page);
  assert.deepEqual(after, before);
  const world = JSON.parse(after.raw);
  assert.equal(world.xp, 25); assert.equal(world.bp, 35);
  assert.equal(world.efforts.length, 1); assert.equal(world.objects.length, 1);
  assert.equal(world.objects[0].id, 'o-1'); assert.equal(world.revision, 1);
  assert.deepEqual(errors, []);
  await page.screenshot({path: join(output, `${prefix}-after.png`), fullPage: true});
  result = {status: 'passed', url, profile, before, after, errors, scope: 'clean owned Chrome shutdown and new process using the same isolated temporary profile; not OS restart, crash or power loss'};
} catch (error) {result = {status: 'failed', url, profile, errors, error: error.stack}; throw error;}
finally {
  if (context) await context.close();
  await writeFile(join(output, `${prefix}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({status: result.status, errors, scope: result.scope, error: result.error}, null, 2));
}

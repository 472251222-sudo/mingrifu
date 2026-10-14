import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createGameWorld} from '../../../src/growth/game/world.js';

// GAME003-GUARD-UI-R1: real GameApp + real Hook/controller/IndexedDB guard.
// Only failed external writes are injected. No mocked Hook or click delay.
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const prefix = `release-game-guard-ui-${process.env.GAME_RUN_ID || Date.now()}`;
const base = process.env.GAME_BASE || 'http://127.0.0.1:5189/';
const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const seed = JSON.stringify(createGameWorld()), results = [], failures = [];
const key = 'mingrifu-growth-game-v1';
const text = page => page.locator('.game-operation-message').innerText();
const raw = page => page.evaluate(key => localStorage.getItem(key), key);
async function tap(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox(); assert.ok(b);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await settle(page);
}
async function settle(page) {await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));}
async function scenario(name, width, height, build, action) {
  const context = await browser.newContext({viewport: {width, height}, hasTouch: true, isMobile: true});
  await context.addInitScript(({seed, key}) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, seed);
    window.failWorldWrite = false; window.failRollback = false; window.worldAttempts = []; window.rollbackAborts = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, value) {
      if (k === key) {window.worldAttempts.push(value); if (window.failWorldWrite) throw new DOMException('isolated world quota', 'QuotaExceededError');}
      return set.call(this, k, value);
    };
    const del = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function(k) {
      const request = del.call(this, k), transaction = this.transaction;
      if (window.failRollback && this.name === 'checkpoint' && transaction.db.name === 'mingrifu-growth-game-v1-checkpoint') {
        request.addEventListener('success', () => {window.rollbackAborts++; transaction.abort();});
      }
      return request;
    };
  }, {seed, key});
  const page = await context.newPage(), result = {name, width, height};
  try {
    await page.goto(base);
    await page.locator('main[data-saved="true"][data-readonly="false"]').waitFor();
    await page.locator('canvas[data-ready="true"]').waitFor();
    await page.evaluate(() => {window.failWorldWrite = true; window.failRollback = true;});
    if (build) {
      await tap(page, page.getByRole('button', {name: '建造', exact: true}));
      await tap(page, page.getByRole('button', {name: '选择暖色野花', exact: true}));
      await settle(page);
      const p = await page.locator('canvas').evaluate(canvas => {
        const b = canvas.getBoundingClientRect(), scale = Number(canvas.dataset.scale);
        return {x: b.left + (Number(canvas.dataset.originX) + 144 * scale) * b.width / canvas.width,
          y: b.top + (Number(canvas.dataset.originY) + 144 * scale) * b.height / canvas.height};
      });
      await page.touchscreen.tap(p.x, p.y); await settle(page);
      await tap(page, page.getByRole('button', {name: '确认建造', exact: true}));
    } else {
      await tap(page, page.getByRole('button', {name: '记录模拟努力', exact: true}));
      await tap(page, page.getByRole('button', {name: '50 分钟', exact: true}));
    }
    await page.locator('main[data-readonly="true"] .game-save-error').waitFor();
    await settle(page);
    const beforeActions = await page.evaluate(() => ({raw: localStorage.getItem('mingrifu-growth-game-v1'),
      attempts: window.worldAttempts.slice(), rollbackAborts: window.rollbackAborts,
      preview: [document.querySelector('canvas').dataset.previewX, document.querySelector('canvas').dataset.previewY]}));
    assert.equal(beforeActions.raw, seed); assert.equal(beforeActions.rollbackAborts, 1);
    assert.equal(beforeActions.attempts.length, 1);
    result.checkpointPending = true; result.originalCandidate = beforeActions.attempts[0];
    if (action === 'cancel' || action === 'both') {
      await tap(page, page.getByRole('button', {name: '取消未保存操作', exact: true})); await settle(page);
      result.cancelMessage = await text(page);
      result.cancelPreserved = !result.cancelMessage.includes('已取消') && await page.getByRole('button', {name: '重试保存', exact: true}).isVisible();
      if (build) result.previewPreservedAfterCancel = await page.locator('canvas').getAttribute('data-preview-x') === '4';
    }
    if (action === 'reload' || action === 'both') {
      await tap(page, page.getByRole('button', {name: '重新读取', exact: true})); await settle(page);
      result.reloadPreserved = await page.getByRole('button', {name: '重试保存', exact: true}).isVisible();
      if (build) result.previewPreservedAfterReload = await page.locator('canvas').getAttribute('data-preview-x') === '4';
    }
    assert.equal(await raw(page), seed);
    await page.screenshot({path: `${output}${prefix}-${name}-pending.png`, fullPage: true});
    await page.evaluate(() => {window.failWorldWrite = false; window.failRollback = false;});
    await tap(page, page.getByRole('button', {name: '重试保存', exact: true}));
    await page.locator('main[data-readonly="false"][data-saved="true"]').waitFor(); await settle(page);
    result.after = await page.evaluate(() => ({raw: localStorage.getItem('mingrifu-growth-game-v1'), attempts: window.worldAttempts.slice(),
      world: JSON.parse(localStorage.getItem('mingrifu-growth-game-v1')), message: document.querySelector('.game-operation-message').textContent,
      selected: document.querySelector('.game-actions').dataset.objectId}));
    result.sameCandidate = result.after.attempts.length === 2 && result.after.attempts[0] === result.after.attempts[1];
    result.correctFeedback = build ? result.after.message.includes('已建造，消费 2 BP') && result.after.selected === 'o-7'
      : result.after.message.includes('模拟努力 +50 XP · +10 BP') && result.after.message.includes('自然成长 1 步');
    assert.equal(result.after.world.xp, build ? 0 : 50); assert.equal(result.after.world.bp, build ? 28 : 40);
    assert.equal(result.after.world.efforts.length, build ? 0 : 1);
    await page.screenshot({path: `${output}${prefix}-${name}-retried.png`, fullPage: true});
    for (const flag of ['cancelPreserved', 'reloadPreserved', 'previewPreservedAfterCancel', 'previewPreservedAfterReload', 'sameCandidate', 'correctFeedback']) {
      if (flag in result && !result[flag]) failures.push(`${name}: ${flag}`);
    }
    result.status = failures.some(item => item.startsWith(`${name}:`)) ? 'failed' : 'passed';
  } catch (error) {result.error = error.message; result.status = 'error'; failures.push(`${name}: ${error.message}`); await page.screenshot({path: `${output}${prefix}-${name}-error.png`, fullPage: true});}
  finally {results.push(result); await context.close();}
}
async function ordinaryRecovery() {
  const context = await browser.newContext({viewport: {width: 320, height: 568}, hasTouch: true, isMobile: true});
  const result = {name: 'ordinary-quota-cancel-and-serial-conflict-reload'};
  await context.addInitScript(({seed, key}) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, seed);
    window.failWorldWrite = false;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, value) {
      if (k === key && window.failWorldWrite) throw new DOMException('isolated ordinary quota', 'QuotaExceededError');
      return set.call(this, k, value);
    };
  }, {seed, key});
  const ready = async page => {await page.locator('main[data-saved="true"][data-readonly="false"]').waitFor(); await page.locator('canvas[data-ready="true"]').waitFor();};
  const effort = async (page, amount) => {await tap(page, page.getByRole('button', {name: '记录模拟努力', exact: true})); await tap(page, page.getByRole('button', {name: `${amount} 分钟`, exact: true}));};
  try {
    const a = await context.newPage(); await a.goto(base); await ready(a);
    await a.evaluate(() => {window.failWorldWrite = true;}); await effort(a, 25);
    await a.locator('.game-save-error').waitFor(); assert.equal(await raw(a), seed);
    await tap(a, a.getByRole('button', {name: '取消未保存操作', exact: true}));
    await a.locator('.game-save-error').waitFor({state: 'hidden'}); assert.match(await text(a), /已取消/);
    assert.equal(await raw(a), seed); result.ordinaryCancelPreserved = true;
    await a.evaluate(() => {window.failWorldWrite = false;});
    const b = await context.newPage(); await b.goto(base); await ready(b);
    await effort(a, 10); await a.getByRole('dialog').waitFor({state: 'hidden'});
    await a.waitForFunction(() => document.querySelector('[aria-label="永久XP"]').textContent === '10 XP');
    const winner = await raw(a);
    // Serial stale-token test only; native simultaneous race is independently QA'd.
    await effort(b, 25); await b.locator('main[data-readonly="true"] .game-save-error').waitFor();
    assert.equal(await b.getByRole('button', {name: '重试保存', exact: true}).count(), 0);
    assert.equal(await b.getByLabel('永久XP').innerText(), '0 XP');
    await tap(b, b.getByRole('button', {name: '重新读取', exact: true})); await ready(b);
    assert.equal(await b.getByLabel('永久XP').innerText(), '10 XP');
    assert.equal(await b.getByLabel('可用BP').innerText(), '32 BP');
    assert.equal(await raw(b), winner); assert.equal(await b.getByRole('dialog').count(), 0);
    assert.match(await text(b), /重新读取/); result.serialConflictReloaded = true; result.status = 'passed';
    await b.screenshot({path: `${output}${prefix}-ordinary-reloaded.png`, fullPage: true});
  } catch (error) {result.status = 'error'; result.error = error.message; failures.push(`${result.name}: ${error.message}`);}
  finally {results.push(result); await context.close();}
}
try {
  await scenario('effort-cancel-320', 320, 568, false, 'cancel');
  await scenario('effort-reload-390', 390, 700, false, 'reload');
  await scenario('build-both-320', 320, 568, true, 'both');
  await ordinaryRecovery();
} finally {
  const result = {chrome: browser.version(),base,results,failures};
  await writeFile(`${output}${prefix}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2)); await browser.close();
}
assert.deepEqual(failures, [], 'refused recovery must retain UI attempt/preview and same-candidate retry feedback');

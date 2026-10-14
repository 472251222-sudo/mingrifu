import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const prefix = `game-002-browser-${process.env.GAME_RUN_ID || Date.now()}`;
assert.match(prefix, /^game-002-browser-[a-z0-9-]+$/);
const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const results = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ready = page => page.locator('canvas[data-ready="true"]').waitFor();
const bp = async page => Number((await page.getByLabel('可用BP').innerText()).split(' ')[0]);
const revision = page => page.locator('main').getAttribute('data-world-revision');
const selected = page => page.locator('.game-actions').getAttribute('data-object-id');
const shot = (page, name) => page.screenshot({path: `${output}${prefix}-${name}.png`, fullPage: true});
async function tap(page, locator, mobile) {
  await locator.scrollIntoViewIfNeeded();
  if (!mobile) return locator.click();
  const bounds = await locator.boundingBox();
  await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}
async function worldPoint(page, x, y) {
  await settle(page);
  return page.locator('canvas').evaluate((element, point) => {
    const bounds = element.getBoundingClientRect(), scale = Number(element.dataset.scale);
    return {x: bounds.left + (Number(element.dataset.originX) + point.x * scale) * bounds.width / element.width, y: bounds.top + (Number(element.dataset.originY) + point.y * scale) * bounds.height / element.height};
  }, {x, y});
}
async function cell(page, x, y, mobile) {
  const point = await worldPoint(page, (x + .5) * 32, (y + .5) * 32);
  if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await settle(page);
}
async function choose(page, name, mobile) {
  if (await page.getByRole('button', {name: '取消选择', exact: true}).isVisible()) await tap(page, page.getByRole('button', {name: '取消选择', exact: true}), mobile);
  await tap(page, page.getByRole('button', {name: '建造', exact: true}), mobile);
  await tap(page, page.getByRole('button', {name: `选择${name}`, exact: true}), mobile);
  assert.equal(await page.getByRole('dialog').count(), 0, 'selection must close drawer');
}
async function onScreen(page) {
  const layout = await page.evaluate(() => {
    const map = document.querySelector('canvas').getBoundingClientRect(), actions = document.querySelector('.game-actions').getBoundingClientRect();
    return {mapHeight: map.height, mapTop: map.top, mapBottom: map.bottom, actionBottom: actions.bottom, height: innerHeight, scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, width: innerWidth};
  });
  assert.ok(layout.mapHeight >= 120 && layout.mapTop >= 0);
  assert.ok(layout.actionBottom <= layout.height + 1);
  assert.ok(layout.scrollHeight <= layout.height + 1);
  assert.ok(layout.scrollWidth <= layout.width);
  return layout;
}
try {
  for (const [name, base, width, height, mobile] of [
    ['desktop', 'http://127.0.0.1:5189/', 1280, 900, false],
    ['phone320-short', 'http://127.0.0.1:5189/', 320, 568, true],
    ['phone390', 'http://127.0.0.1:5189/', 390, 700, true],
    ['preview', 'http://127.0.0.1:5190/', 1280, 900, false],
  ]) {
    const context = await browser.newContext({viewport: {width, height}, hasTouch: mobile, isMobile: mobile, locale: 'zh-CN'});
    await context.addInitScript(() => {
      localStorage.setItem('mingrifu-growth-world-p1-v1', 'isolated-p1-sentinel');
      localStorage.setItem('mingrifu-growth-game-v1', 'isolated-game-sentinel');
      sessionStorage.setItem('mingrifu-v3-demo-1', 'isolated-v3-sentinel');
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    try {
      await page.goto(base); await ready(page); await settle(page);
      assert.equal(await bp(page), 30); assert.equal(await page.getByLabel('永久XP').innerText(), '0 XP');
      assert.match(await page.locator('.game-temporary').innerText(), /尚未保存/);
      const layout = await onScreen(page); await shot(page, `${name}-initial`);
      await choose(page, '暖色野花', mobile);
      await cell(page, 3, 2, mobile); assert.match(await page.locator('.game-operation-message').innerText(), /重叠/);
      assert.equal(await page.getByRole('button', {name: '确认建造', exact: true}).isDisabled(), true);
      await onScreen(page); await shot(page, `${name}-overlap`);
      await cell(page, -1, 5, mobile); assert.match(await page.locator('.game-operation-message').innerText(), /超出/);
      await tap(page, page.getByRole('button', {name: '取消', exact: true}), mobile);
      assert.equal(await bp(page), 30); assert.equal(await revision(page), '0');
      await choose(page, '林缘阔冠树', mobile); assert.match(await page.locator('.game-operation-message').innerText(), /120 XP/);
      assert.equal(await page.getByRole('button', {name: '确认建造', exact: true}).isDisabled(), true);
      await tap(page, page.getByRole('button', {name: '取消', exact: true}), mobile);
      await choose(page, '暖色野花', mobile); await cell(page, 5, 5, mobile);
      const canvas = page.locator('canvas'), beforePreview = {x: await canvas.getAttribute('data-preview-x'), y: await canvas.getAttribute('data-preview-y')};
      while (Number(await canvas.getAttribute('data-scale')) < 3) await tap(page, page.getByRole('button', {name: '放大世界'}), mobile);
      await settle(page);
      const bounds = await canvas.boundingBox(), beforeCamera = {x: await canvas.getAttribute('data-camera-x'), y: await canvas.getAttribute('data-camera-y')};
      let touchEvents = null;
      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await page.evaluate(() => {window.touchEvidence = []; const canvas = document.querySelector('canvas'); for (const type of ['pointerdown','pointermove','pointerup','pointercancel']) canvas.addEventListener(type, event => window.touchEvidence.push({type, pointerType: event.pointerType}));});
        const start = {x: bounds.x + bounds.width * .5, y: bounds.y + bounds.height * .65};
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...start, id: 1}]});
        for (let step = 1; step <= 6; step++) {await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: start.x + step * 8, y: start.y + step * 3, id: 1}]}); await settle(page);}
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await settle(page);
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...start, id: 2}]});
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []}); await settle(page);
        touchEvents = await page.evaluate(() => window.touchEvidence);
        assert.ok(touchEvents.some(event => event.type === 'pointermove' && event.pointerType === 'touch'));
        assert.ok(touchEvents.some(event => event.type === 'pointercancel' && event.pointerType === 'touch'));
        await cdp.detach();
      } else {
        await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .65); await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width * .5 + 48, bounds.y + bounds.height * .65 + 18, {steps: 6}); await page.mouse.up(); await settle(page);
      }
      assert.notDeepEqual({x: await canvas.getAttribute('data-camera-x'), y: await canvas.getAttribute('data-camera-y')}, beforeCamera);
      assert.equal(await canvas.getAttribute('data-preview-x'), beforePreview.x); assert.equal(await canvas.getAttribute('data-preview-y'), beforePreview.y);
      assert.equal(await bp(page), 30); assert.equal(await revision(page), '0');
      await tap(page, page.getByRole('button', {name: '世界总览'}), mobile); await settle(page);
      await onScreen(page); await shot(page, `${name}-legal-preview`);
      await tap(page, page.getByRole('button', {name: '确认建造', exact: true}), mobile);
      assert.equal(await bp(page), 28); const flowerId = await selected(page); assert.ok(flowerId);
      await tap(page, page.getByRole('button', {name: '取消选择', exact: true}), mobile);
      const roof = await worldPoint(page, 112, 48);
      if (mobile) await page.touchscreen.tap(roof.x, roof.y); else await page.mouse.click(roof.x, roof.y);
      assert.equal(await selected(page), 'o-1', 'opaque roof above footprint must select gift cabin');
      await shot(page, `${name}-cabin-selected`);
      await tap(page, page.getByRole('button', {name: '移动', exact: true}), mobile);
      await cell(page, 4, 0, mobile); await tap(page, page.getByRole('button', {name: '确认位置', exact: true}), mobile);
      assert.equal(await selected(page), 'o-1'); assert.equal(await bp(page), 28);
      await tap(page, page.getByRole('button', {name: '收纳', exact: true}), mobile);
      await tap(page, page.getByRole('button', {name: '收纳盒 (1)', exact: true}), mobile);
      const stored = page.getByRole('button', {name: '重新摆放暖木小屋', exact: true}); assert.equal(await stored.getAttribute('data-object-id'), 'o-1');
      await tap(page, stored, mobile); await cell(page, 2, 2, mobile); await tap(page, page.getByRole('button', {name: '确认位置', exact: true}), mobile);
      assert.equal(await selected(page), 'o-1'); assert.equal(await bp(page), 28);
      await tap(page, page.getByRole('button', {name: '取消选择', exact: true}), mobile);
      await choose(page, '暖木小屋', mobile); await cell(page, 0, 6, mobile); await tap(page, page.getByRole('button', {name: '确认建造', exact: true}), mobile);
      assert.equal(await bp(page), 4); await tap(page, page.getByRole('button', {name: '取消选择', exact: true}), mobile);
      await choose(page, '暖木小屋', mobile); assert.match(await page.locator('.game-operation-message').innerText(), /BP 不足/); await onScreen(page);
      await tap(page, page.getByRole('button', {name: '取消', exact: true}), mobile);
      await choose(page, '暖色野花', mobile); await cell(page, 6, 6, mobile);
      await canvas.focus(); await page.keyboard.press('ArrowRight'); assert.equal(await canvas.getAttribute('data-preview-x'), '7');
      await page.keyboard.press('Escape'); assert.equal(await bp(page), 4);
      await choose(page, '暖色野花', mobile); await cell(page, 7, 6, mobile); await canvas.focus(); await page.keyboard.press('Enter');
      assert.equal(await bp(page), 2); await shot(page, `${name}-after-free-adjustment`);
      if (!mobile) {
        const beforeWheel = Number(await canvas.getAttribute('data-scale'));
        const bounds = await canvas.boundingBox(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.wheel(0, -100); await settle(page);
        assert.ok(Number(await canvas.getAttribute('data-scale')) > beforeWheel);
      }
      assert.deepEqual(await page.evaluate(() => [localStorage.getItem('mingrifu-growth-world-p1-v1'), localStorage.getItem('mingrifu-growth-game-v1'), sessionStorage.getItem('mingrifu-v3-demo-1')]), ['isolated-p1-sentinel','isolated-game-sentinel','isolated-v3-sentinel']);
      await page.reload(); await ready(page); assert.equal(await bp(page), 30);
      assert.deepEqual(errors, []);
      results.push({name, base, width, height, mobile, layout, touchEvents, touchCancelVerified: mobile, status: 'passed', scenarios: ['overlap/outside/cancel','locked','drag-preserves-preview',...(mobile ? ['actual-touch-drag-and-cancel-no-command'] : ['mouse-drag']),'flower30to28','gift-roof-alpha','move-store-place-same-id-free','insufficient-BP','keyboard-arrows-Escape-Enter','temporary-refresh-reset','old-storage-unchanged']});
    } catch (error) {
      await shot(page, `${name}-failure`); results.push({name, status: 'failed', error: error.stack, errors}); throw error;
    } finally {await context.close();}
  }
} finally {
  await writeFile(`${output}${prefix}.json`, JSON.stringify({chromeVersion: browser.version(), results}, null, 2));
  console.log(JSON.stringify({chromeVersion: browser.version(), results}, null, 2)); await browser.close();
}

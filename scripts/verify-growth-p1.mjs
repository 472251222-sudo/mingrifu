// Uses installed Playwright and isolated browser contexts, never a user profile.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { seed } from '../src/domain/model.js';
import { STORAGE_KEY } from '../src/growth/persistence.js';
import { mapExtents } from '../src/growth/view.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:5186/';
const output = process.env.QA_OUTPUT || 'docs/growth-p1';
await mkdir(output, { recursive: true });
const v3Key = 'mingrifu-v3-demo-1';
const v3Snapshot = JSON.stringify(seed());
const results = [], pageErrors = [];
const worldOf = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const rawWorld = page => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
const capture = (page, name) => page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
async function cell(page, x, y, touch = false) {
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await settle();
  const canvas = page.locator('.gw-map-host canvas');
  await canvas.scrollIntoViewIfNeeded();
  const getPoint = () => canvas.evaluate((element, cell) => {
    const rect = element.getBoundingClientRect(), w = Number(element.dataset.tileWidth), h = Number(element.dataset.tileHeight), scale = Number(element.dataset.pixelScale);
    return { x: rect.left + (Number(element.dataset.originX) + (cell.x - cell.y) * w / 2 * scale) * rect.width / element.width, y: rect.top + (Number(element.dataset.originY) + (cell.x + cell.y + 1) * h / 2 * scale) * rect.height / element.height };
  }, { x, y });
  let point = await getPoint();
  const box = await canvas.boundingBox();
  if (point.x < box.x + 6 || point.x > box.x + box.width - 6 || point.y < box.y + 6 || point.y > box.y + box.height - 6) { await page.getByRole('button', { name: '查看完整地图' }).click(); await settle(); point = await getPoint(); }
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
}
async function openWorld(page) {
  await page.goto(new URL('growth-p1', base).href);
  await page.getByRole('heading', { name: /我的生长之地/ }).waitFor();
  await page.locator('[aria-label="选择林间小屋"]').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('[aria-label="选择林间小屋"]')?.disabled === false);
}
async function chooseBuilding(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  if (!await button.isVisible()) {
    const opener = page.getByRole('button', { name: name.startsWith('重新摆放') ? '打开收纳盒' : '打开建筑目录', exact: true });
    if (await opener.isVisible()) await opener.click();
    else { await page.getByRole('button', { name: '建造', exact: true }).click(); if (name.startsWith('重新摆放')) await page.getByRole('tab', { name: /收纳盒/ }).click(); }
  }
  await button.click();
}
async function inventory(page) {
  const tab = page.getByRole('tab', { name: /收纳盒/ });
  if (!await tab.isVisible()) await page.getByRole('button', { name: '打开收纳盒', exact: true }).click();
  await tab.click();
}
async function flows(browser, label, width, touch) {
  const context = await browser.newContext({ viewport: { width, height: touch ? 844 : 1000 }, hasTouch: touch, isMobile: touch, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(({ key, data }) => { if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, data); }, { key: v3Key, data: v3Snapshot });
  const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(`${label}: ${error.message}`));
  try {
    await openWorld(page); assert.equal(await rawWorld(page), null);
    await capture(page, `${label}-initial`);
    await chooseBuilding(page, '选择林间小屋');
    await cell(page, 2, 2, touch); await page.getByRole('button', { name: '确认放置', exact: true }).click();
    let world = await worldOf(page); assert.equal(world.buildings.length, 1); const id = world.buildings[0].id;
    await chooseBuilding(page, '选择街角茶屋');
    await cell(page, 3, 2, touch); assert.match(await page.locator('.gw-placement-message').innerText(), /重叠/);
    assert.equal(await page.getByRole('button', { name: '确认放置', exact: true }).isDisabled(), true);
    await cell(page, 7, 7, touch); assert.match(await page.locator('.gw-placement-message').innerText(), /超出/);
    assert.equal((await worldOf(page)).buildings.length, 1);
    await page.getByRole('button', { name: '取消放置', exact: true }).click();
    await cell(page, 2, 2, touch); await page.getByRole('button', { name: '移动建筑', exact: true }).click();
    await cell(page, 4, 3, touch); await page.getByRole('button', { name: '确认新位置', exact: true }).click();
    world = await worldOf(page); assert.equal(world.buildings[0].id, id); assert.equal(world.buildings[0].x, 4);
    await page.getByRole('button', { name: '收纳建筑', exact: true }).click();
    world = await worldOf(page); assert.equal(world.buildings[0].stored, true);
    await page.reload(); await page.waitForFunction(() => document.querySelector('[aria-label="选择林间小屋"]')?.disabled === false);
    await inventory(page);
    await chooseBuilding(page, `重新摆放林间小屋 ${id}`);
    await cell(page, 1, 3, touch); await page.getByRole('button', { name: '确认新位置', exact: true }).click();
    world = await worldOf(page); assert.equal(world.buildings.length, 1); assert.equal(world.buildings[0].id, id); assert.equal(world.buildings[0].stored, false);
    const buildings = world.buildings;
    const beforeImage = await page.locator('.gw-map-host canvas').screenshot();
    await page.getByRole('button', { name: /让自然生长一次/ }).click();
    world = await worldOf(page); assert.deepEqual(world.buildings, buildings); assert.equal(world.growth.step, 1);
    const afterImage = await page.locator('.gw-map-host canvas').screenshot(); assert.notDeepEqual(beforeImage, afterImage);
    await page.getByRole('button', { name: '扩张', exact: true }).click();
    await chooseBuilding(page, '选择北方区域 (0,-1)');
    await page.getByRole('button', { name: '确认扩张', exact: true }).click();
    world = await worldOf(page); assert.deepEqual(world.chunks, [{ x: 0, y: 0 }, { x: 0, y: -1 }]); assert.deepEqual(world.buildings, buildings);
    await page.getByRole('tab', { name: '基础建筑', exact: true }).click();
    await chooseBuilding(page, '选择小小书屋');
    await cell(page, 1, -6, touch); await page.getByRole('button', { name: '确认放置', exact: true }).click();
    world = await worldOf(page); assert.equal(world.buildings[1].y, -6);
    const saved = await rawWorld(page); await page.reload();
    await page.waitForFunction(() => document.querySelector('[aria-label="选择林间小屋"]')?.disabled === false);
    assert.equal(await rawWorld(page), saved); assert.deepEqual(await worldOf(page), world);
    await page.close(); const reopened = await context.newPage(); reopened.on('pageerror', error => pageErrors.push(`${label}: ${error.message}`));
    await openWorld(reopened); assert.equal(await rawWorld(reopened), saved);
    assert.equal(await reopened.evaluate(key => sessionStorage.getItem(key), v3Key), v3Snapshot);
    const overflow = await reopened.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.equal(overflow.scroll, overflow.client, `${label}: horizontal overflow`);
    await capture(reopened, `${label}-expanded`);

    const scaleOf = () => reopened.locator('.gw-map-host canvas').getAttribute('data-pixel-scale').then(Number);
    const beforeZoom = await scaleOf();
    await reopened.getByRole('button', { name: '缩小地图', exact: true }).click();
    assert.ok(await scaleOf() < beforeZoom, `${label}: zoom out after expansion`);
    while (await scaleOf() >= 1) await reopened.getByRole('button', { name: '缩小地图', exact: true }).click();
    const belowOne = await scaleOf();
    await reopened.getByRole('button', { name: '放大地图', exact: true }).click();
    assert.ok(await scaleOf() > belowOne);
    await reopened.getByRole('button', { name: '查看完整地图', exact: true }).click();
    const bounds = mapExtents(await worldOf(reopened));
    const camera = await reopened.locator('.gw-map-host canvas').evaluate(el => ({ width: el.width, height: el.height, cssWidth: el.getBoundingClientRect().width, cssHeight: el.getBoundingClientRect().height, x: Number(el.dataset.originX), y: Number(el.dataset.originY), scale: Number(el.dataset.pixelScale) }));
    assert.equal(camera.width, camera.cssWidth); assert.equal(camera.height, camera.cssHeight);
    assert.ok(camera.x + bounds.minX * camera.scale >= 15 && camera.x + bounds.maxX * camera.scale <= camera.width - 15, `${label}: full world width fits`);
    assert.ok(camera.y + bounds.minY * camera.scale >= 15 && camera.y + bounds.maxY * camera.scale <= camera.height - 15, `${label}: full world height fits`);

    if (!touch) {
      const canvas = reopened.locator('.gw-map-host canvas'); const origin = await canvas.getAttribute('data-origin-x'), box = await canvas.boundingBox();
      await reopened.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await reopened.mouse.down(); await reopened.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 20, { steps: 8 }); await reopened.mouse.up();
      assert.notEqual(await canvas.getAttribute('data-origin-x'), origin); await reopened.getByRole('button', { name: '查看完整地图' }).click();
      await chooseBuilding(reopened, '选择木质长椅'); await cell(reopened, 5, -3);
      const beforeFailure = await rawWorld(reopened);
      await reopened.evaluate(key => { window.__qaOriginalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('quota-test', 'QuotaExceededError'); return window.__qaOriginalSetItem.call(this, k, v); }; }, STORAGE_KEY);
      await reopened.getByRole('button', { name: '确认放置', exact: true }).click();
      await reopened.getByRole('alert').waitFor(); assert.match(await reopened.getByRole('alert').innerText(), /保存失败/); assert.equal(await rawWorld(reopened), beforeFailure);
      await capture(reopened, 'desktop-save-failure');
      await reopened.evaluate(() => { Storage.prototype.setItem = window.__qaOriginalSetItem; delete window.__qaOriginalSetItem; });
      await reopened.getByRole('button', { name: '重试保存', exact: true }).click(); assert.equal((await worldOf(reopened)).buildings.length, 3);
      // Keyboard preview and native controls also work without a pointing device.
      await chooseBuilding(reopened, '选择木质长椅'); await cell(reopened, 4, -5);
      await canvas.focus(); await reopened.keyboard.press('ArrowRight'); await reopened.keyboard.press('Enter');
      assert.equal((await worldOf(reopened)).buildings.at(-1).x, 5);
      const other = await context.newPage(); await openWorld(other);
      await other.getByRole('button', { name: /让自然生长一次/ }).click();
      await reopened.getByRole('alert').waitFor(); assert.match(await reopened.getByRole('alert').innerText(), /另一页面/);
      await reopened.getByRole('button', { name: '重新读取', exact: true }).click();
      assert.deepEqual(await worldOf(reopened), await worldOf(other)); await other.close();
      results.push({ label: 'desktop-extra', passed: true, checks: ['mouse pan', 'save failure rollback and retry', 'keyboard placement', 'multi-tab conflict and reload'] });
    }
    // The old app still mounts normally, with its original business state.
    await reopened.goto(base); await reopened.getByRole('heading', { name: '今天，也在慢慢向前。', exact: true }).waitFor();
    assert.equal(await reopened.evaluate(key => sessionStorage.getItem(key), v3Key), v3Snapshot);
    await reopened.getByRole('button', { name: '完成整理今日学习笔记', exact: true }).click();
    assert.equal(await reopened.evaluate(key => JSON.parse(sessionStorage.getItem(key)).events.length, v3Key), 1);
    await reopened.getByRole('button', { name: '撤销完成整理今日学习笔记', exact: true }).click();
    await reopened.getByRole('button', { name: /查看目标计划/ }).click();
    await reopened.getByRole('textbox', { name: '月目标标题', exact: true }).waitFor();
    if (!touch) {
      await reopened.getByRole('textbox', { name: '月目标标题', exact: true }).fill('P1 回归：月计划仍可编辑');
      await reopened.getByRole('heading', { name: '方向已清晰，节奏由你定。', exact: true }).click();
      assert.equal(await reopened.evaluate(key => JSON.parse(sessionStorage.getItem(key)).goals[0].months[0].title, v3Key), 'P1 回归：月计划仍可编辑');
      await reopened.getByRole('button', { name: '创建目标', exact: true }).click();
      await reopened.getByPlaceholder('例如：考研一年计划', { exact: true }).fill('P1 隔离回归目标');
      await reopened.getByRole('button', { name: '使用 Copilot 拆解', exact: true }).click();
      await reopened.getByRole('button', { name: '查看月度与周度计划', exact: true }).click({ timeout: 20000 });
      await reopened.getByRole('button', { name: '确认计划并生成每日任务', exact: true }).click();
      await reopened.locator('.planner-grid').waitFor();
      const state = await reopened.evaluate(key => JSON.parse(sessionStorage.getItem(key)), v3Key);
      const goal = state.goals.find(g => g.title === 'P1 隔离回归目标'); assert.ok(state.tasks.some(t => t.goalId === goal.id));
      assert.ok(await rawWorld(reopened));
      results.push({ label: 'v3-regression', passed: true, checks: ['task completion and undo', 'month plan editing', 'goal creation, research, review and daily task generation'] });
    }
    results.push({ label, passed: true, checks: ['initial world', 'isometric grid picking', 'place', 'overlap and boundary rejection', 'move', 'store and refresh', 'replace same object', 'visible growth without changing buildings', 'north expansion', 'build on new land', 'reload and reopen', 'zoom out below 100%', 'zoom back in', 'full world fit including roofs', 'viewport sized drawing buffer', 'V3 storage isolation', 'no horizontal overflow'] });
    console.log(`${label} PASS`);
  } finally { await context.close(); }
}
async function recovery(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(`recovery: ${error.message}`));
  try {
    await context.route('**/assets/growth-p1/city-atlas.png', route => route.abort());
    await page.goto(new URL('growth-p1', base).href); await page.getByRole('button', { name: '重试素材' }).waitFor();
    assert.equal(await rawWorld(page), null); assert.equal(await page.locator('[aria-label="选择林间小屋"]').isDisabled(), true);
    await context.unroute('**/assets/growth-p1/city-atlas.png'); await page.getByRole('button', { name: '重试素材' }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="选择林间小屋"]')?.disabled === false);
    await page.evaluate(key => localStorage.setItem(key, '{bad-save'), STORAGE_KEY); await page.reload();
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /原存档已保留/); assert.equal(await rawWorld(page), '{bad-save');
    assert.equal(await page.getByRole('button', { name: /让自然生长一次/ }).isDisabled(), true);
    await capture(page, 'corrupt-save-readonly');
    results.push({ label: 'recovery', passed: true, checks: ['asset failure retry', 'corrupt save preserved and read-only'] });
  } finally { await context.close(); }
}

async function expandedOverview(browser) {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(`overview: ${error.message}`));
  try {
    await openWorld(page);
    for (const [x, y, name] of [[0, -1, '北方'], [1, 0, '东方'], [0, 1, '南方'], [-1, 0, '西方']]) {
      await page.getByRole('button', { name: '扩张', exact: true }).click();
      await page.getByRole('button', { name: `选择${name}区域 (${x},${y})`, exact: true }).click();
      await page.getByRole('button', { name: '确认扩张', exact: true }).click();
    }
    assert.equal((await worldOf(page)).chunks.length, 5);
    await page.getByRole('button', { name: '查看完整地图', exact: true }).click();
    const saved = await rawWorld(page), bounds = mapExtents(await worldOf(page));
    const camera = await page.locator('.gw-map-host canvas').evaluate(el => ({ x: Number(el.dataset.originX), y: Number(el.dataset.originY), scale: Number(el.dataset.pixelScale), width: el.width, height: el.height }));
    assert.ok(camera.scale < 1);
    assert.ok(camera.x + bounds.minX * camera.scale >= 15 && camera.x + bounds.maxX * camera.scale <= camera.width - 15);
    assert.ok(camera.y + bounds.minY * camera.scale >= 15 && camera.y + bounds.maxY * camera.scale <= camera.height - 15);
    await page.getByRole('button', { name: '缩小地图', exact: true }).click();
    await page.getByRole('button', { name: '查看完整地图', exact: true }).click();
    assert.equal(await rawWorld(page), saved, 'camera changes must not rewrite a saved world');
    await capture(page, 'touch-320-five-regions');
    await chooseBuilding(page, '选择木质长椅');
    await cell(page, -5, 3, true); await page.getByRole('button', { name: '确认放置', exact: true }).click();
    assert.equal((await worldOf(page)).buildings[0].x, -5);
    results.push({ label: 'expanded-overview', passed: true, checks: ['four-direction expansion', 'five-region overview on 320px screen', 'camera does not rewrite save', 'negative-land placement at small zoom'] });
  } finally { await context.close(); }
}

const chrome = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await flows(chrome, 'desktop', 1440, false);
  await flows(chrome, 'touch-390', 390, true);
  await flows(chrome, 'touch-320', 320, true);
  await recovery(chrome);
  await expandedOverview(chrome);
} finally { await chrome.close(); }
let safari;
try { safari = await webkit.launch({ headless: true }); } catch (error) { results.push({ label: 'webkit', skipped: true, reason: error.message.split('\n')[0] }); console.log('WebKit unavailable; skipped.'); }
if (safari) { try { await flows(safari, 'webkit-touch', 390, true); } finally { await safari.close(); } }
assert.deepEqual(pageErrors, []);
await writeFile(`${output}/verification.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), base, results, pageErrors }, null, 2) + '\n');
console.log('All P1 browser checks passed; no page errors.');

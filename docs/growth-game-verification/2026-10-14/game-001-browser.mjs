// GAME-001 only. Uses an isolated Chrome context; never attaches to a user profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const prefix = `game-001-browser-${process.env.GAME_RUN_ID || Date.now()}`;
assert.match(prefix, /^game-001-browser-[a-z0-9-]+$/);
const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const results = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ready = page => page.locator('canvas[data-ready="true"]').waitFor();
const sentinel = {p1: 'GAME-001-isolated-P1', v3: 'GAME-001-isolated-V3', game: 'GAME-001-isolated-game'};

async function contextFor(width, mobile) {
  const context = await browser.newContext({viewport: {width, height: mobile ? 844 : 1000}, hasTouch: mobile, isMobile: mobile, locale: 'zh-CN'});
  await context.addInitScript(values => {
    localStorage.setItem('mingrifu-growth-world-p1-v1', values.p1);
    localStorage.setItem('mingrifu-growth-game-v1', values.game);
    sessionStorage.setItem('mingrifu-v3-demo-1', values.v3);
  }, sentinel);
  return context;
}
async function verifyStorage(page) {
  assert.deepEqual(await page.evaluate(() => ({
    p1: localStorage.getItem('mingrifu-growth-world-p1-v1'),
    v3: sessionStorage.getItem('mingrifu-v3-demo-1'),
    game: localStorage.getItem('mingrifu-growth-game-v1'),
  })), sentinel);
}

try {
  for (const [name, base, width, mobile] of [
    ['desktop-dev', 'http://127.0.0.1:5189/', 1280, false],
    ['desktop-preview', 'http://127.0.0.1:5190/', 1280, false],
    ['phone-320', 'http://127.0.0.1:5189/', 320, true],
    ['phone-390', 'http://127.0.0.1:5189/', 390, true],
  ]) {
    const context = await contextFor(width, mobile);
    const page = await context.newPage();
    const errors = [], failed = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('request', request => requests.push(request.url()));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base);
    await ready(page);
    await settle(page);
    assert.equal(await page.title(), '明日复·我的世界');
    assert.equal(await page.getByRole('heading', {name: '林缘小家'}).count(), 1);
    const canvas = page.locator('canvas');
    const canvasState = await canvas.evaluate(element => {
      const context = element.getContext('2d'), pixels = context.getImageData(0, 0, element.width, element.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return {width: element.width, height: element.height, smoothing: context.imageSmoothingEnabled, colors: colors.size, imageRendering: getComputedStyle(element).imageRendering, touchAction: getComputedStyle(element).touchAction};
    });
    assert.ok(canvasState.width > 200 && canvasState.height >= 240);
    assert.ok(canvasState.colors > 20, 'real world pixels must be rendered');
    assert.equal(canvasState.smoothing, false);
    assert.equal(canvasState.imageRendering, 'pixelated');
    assert.equal(canvasState.touchAction, 'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.screenshot({path: `${output}${prefix}-${name}-overview.png`, fullPage: true});
    const initialScale = Number(await canvas.getAttribute('data-scale'));
    if (mobile) {
      const button = await page.getByRole('button', {name: '放大世界'}).boundingBox();
      await page.touchscreen.tap(button.x + button.width / 2, button.y + button.height / 2);
    } else {
      await page.getByRole('button', {name: '放大世界'}).click();
    }
    assert.ok(Number(await canvas.getAttribute('data-scale')) > initialScale);
    while (Number(await canvas.getAttribute('data-scale')) < 4) await page.getByRole('button', {name: '放大世界'}).click();
    await settle(page);
    const beforeDrag = await canvas.screenshot();
    const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 72, bounds.y + bounds.height / 2 + 48, {steps: 8});
    await page.mouse.up();
    await settle(page);
    assert.notDeepEqual(await canvas.screenshot(), beforeDrag, 'drag must pan the zoomed world');
    await canvas.focus();
    const beforeKey = await canvas.screenshot();
    await page.keyboard.press('ArrowRight');
    await settle(page);
    assert.notDeepEqual(await canvas.screenshot(), beforeKey, 'keyboard arrows must pan');
    await page.screenshot({path: `${output}${prefix}-${name}-zoom.png`, fullPage: true});
    await page.getByRole('button', {name: '世界总览'}).click();
    assert.equal(Number(await canvas.getAttribute('data-scale')), initialScale);
    await verifyStorage(page);
    await page.reload();
    await ready(page);
    await verifyStorage(page);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.ok(!requests.some(url => /\/src\/(main\.jsx|App\.jsx|domain\/|components\/)/.test(url)), 'V3 must not load');
    results.push({name, base, width, mobile, initialScale, canvasState, errors, failed, storage: 'isolated sentinel values unchanged', requestCount: requests.length, status: 'passed'});
    await context.close();
  }
  const context = await contextFor(390, true);
  const page = await context.newPage();
  const missing = '**/assets/growth-p2-homestead/cabin-terracotta.png';
  await context.route(missing, route => route.fulfill({status: 404, contentType: 'image/png', body: ''}));
  await page.goto('http://127.0.0.1:5189/');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /暖木小屋资源加载失败/);
  await page.screenshot({path: `${output}${prefix}-resource-error.png`, fullPage: true});
  await context.unroute(missing);
  await page.getByRole('button', {name: '重新加载素材'}).click();
  await ready(page);
  await settle(page);
  assert.equal(await page.getByRole('alert').count(), 0);
  await verifyStorage(page);
  results.push({name: 'resource-failure-retry', status: 'passed', failure: 'isolated cabin PNG 404', retry: 'renders real world successfully'});
  await context.close();
  await writeFile(`${output}${prefix}.json`, JSON.stringify({chromeVersion: browser.version(), results}, null, 2));
  console.log(JSON.stringify({chromeVersion: browser.version(), results}, null, 2));
} finally {
  await browser.close();
}

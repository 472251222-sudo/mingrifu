import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build, createServer, preview, resolveConfig} from 'vite';

const repository = fileURLToPath(new URL('../', import.meta.url));
const configFile = resolve(repository, 'vite.game.config.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('independent dev dependency artifacts have a separate cache from V3', async () => {
  const [main, game] = await Promise.all([resolve(repository, 'vite.config.mjs'), configFile].map(configFile => resolveConfig({configFile, logLevel: 'silent'}, 'serve')));
  assert.notEqual(game.cacheDir, main.cacheDir, 'running two entry points must not invalidate each other through a shared optimizer cache');
});

test('independent game builds and serves its own shell and original resources without V3', async t => {
  const output = await mkdtemp(join(tmpdir(), 'mingrifu-game-build-'));
  t.after(() => rm(output, {recursive: true, force: true}));
  const manifest = JSON.parse(await readFile(resolve(repository, 'public/assets/growth-p2-homestead/manifest.json')));
  const resources = ['/assets/growth-p2-homestead/manifest.json', manifest.terrain.atlas, ...manifest.assets.map(asset => asset.png)];
  const originals = new Map(await Promise.all(resources.map(async url => [url, await readFile(resolve(repository, `public${url}`))])));
  const modules = [];
  let result;
  try {
    result = await build({configFile, logLevel: 'silent', build: {outDir: output, emptyOutDir: true}, plugins: [{
      name: 'test-game-module-boundary',
      generateBundle() { modules.push(...this.getModuleIds()); },
    }]});
  } catch (error) {
    assert.fail(`The independent game must build successfully: ${error.message}`);
  }
  assert.ok(result.output.some(item => item.type === 'chunk' && item.isEntry));
  assert.ok(modules.some(id => id.endsWith('/src/growth/game/main.jsx')), 'game entry must be bundled');
  assert.ok(modules.some(id => id.endsWith('/src/growth/homestead/renderer.js')), 'real renderer must be bundled');
  const forbidden = modules.filter(id => id === resolve(repository, 'src/main.jsx') || id === resolve(repository, 'src/App.jsx') || id.startsWith(resolve(repository, 'src/domain') + '/') || id.startsWith(resolve(repository, 'src/components') + '/'));
  assert.deepEqual(forbidden, [], 'game bundle must not load V3 business modules');
  const html = await readFile(join(output, 'index.html'), 'utf8');
  assert.match(html, /<title>明日复·我的世界<\/title>/);
  const entry = html.match(/<script[^>]+src="([^"]+)"/)[1];
  assert.ok((await readFile(join(output, entry.replace(/^\//, '')))).length > 0, 'built HTML must resolve to a real game chunk');
  for (const url of resources) {
    assert.equal(hash(await readFile(join(output, url.slice(1)))), hash(originals.get(url)), `${url} must be copied unchanged`);
    assert.equal(hash(await readFile(resolve(repository, `public${url}`))), hash(originals.get(url)), `${url} source must not change`);
  }
  assert.deepEqual((await readdir(join(output, 'assets/growth-p2-homestead'))).sort(), resources.map(url => url.split('/').at(-1)).sort(), 'only game runtime resources may be copied');
  assert.deepEqual((await readdir(output)).sort(), ['assets', 'index.html'], 'game build must exclude unrelated public pages and documents');

  await t.test('dev root resolves game HTML, aliased entry and runtime assets', async () => {
    // These HTTP checks do not run dependency imports in a browser. Avoid
    // cancelling Vite's background dependency scan during immediate teardown.
    const server = await createServer({configFile, logLevel: 'silent', optimizeDeps: {include: [], noDiscovery: true}, server: {host: '127.0.0.1', port: 5189, strictPort: false}});
    try {
      await server.listen();
      const base = server.resolvedUrls.local[0];
      const response = await fetch(base);
      assert.equal(response.status, 200);
      const devHtml = await response.text();
      assert.match(devHtml, /<title>明日复·我的世界<\/title>/);
      const source = devHtml.match(/<script[^>]+src="([^"]*growth\/game\/main\.jsx)"/)[1];
      const entryResponse = await fetch(new URL(source, base));
      assert.equal(entryResponse.status, 200);
      assert.match(entryResponse.headers.get('content-type'), /javascript/);
      assert.match(await entryResponse.text(), /GameApp/);
      for (const url of resources) {
        const assetResponse = await fetch(new URL(url, base));
        assert.equal(assetResponse.status, 200, url);
        assert.equal(hash(Buffer.from(await assetResponse.arrayBuffer())), hash(originals.get(url)), url);
      }
    } finally {
      await server.close();
    }
  });
  await t.test('preview root resolves built game HTML, chunk and every runtime asset', async () => {
    const server = await preview({configFile, logLevel: 'silent', build: {outDir: output}, preview: {host: '127.0.0.1', port: 5190, strictPort: false}});
    try {
      const base = server.resolvedUrls.local[0];
      const response = await fetch(base);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), html);
      assert.equal((await fetch(new URL(entry, base))).status, 200);
      for (const url of resources) {
        const assetResponse = await fetch(new URL(url, base));
        assert.equal(assetResponse.status, 200, url);
        assert.equal(hash(Buffer.from(await assetResponse.arrayBuffer())), hash(originals.get(url)), url);
      }
    } finally {
      await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
    }
  });
});

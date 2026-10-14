import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const repository = fileURLToPath(new URL('./', import.meta.url));
const manifestUrl = '/assets/growth-p2-homestead/manifest.json';
const manifest = JSON.parse(readFileSync(new URL(`./public${manifestUrl}`, import.meta.url)));
const resourceUrls = [manifestUrl, manifest.terrain.atlas, ...manifest.assets.map(asset => asset.png)];

// Reuse original runtime assets without exposing or copying the V3 public tree.
function gameResources() {
  const resources = new Map(resourceUrls.map(url => {
    if (!/^\/assets\/growth-p2-homestead\/[a-z0-9-]+\.(png|json)$/.test(url)) throw Error(`Invalid game resource URL: ${url}`);
    return [url, readFileSync(new URL(`./public${url}`, import.meta.url))];
  }));
  return {
    name: 'growth-game-resources',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0];
        const bytes = resources.get(url);
        if (!bytes || !['GET', 'HEAD'].includes(request.method)) return next();
        response.setHeader('Content-Type', url.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8');
        response.setHeader('Content-Length', bytes.length);
        response.end(request.method === 'HEAD' ? undefined : bytes);
      });
    },
    generateBundle() {
      for (const [url, source] of resources) this.emitFile({type: 'asset', fileName: url.slice(1), source});
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./game/', import.meta.url)),
  base: '/',
  publicDir: false,
  resolve: {alias: {'/src': fileURLToPath(new URL('./src/', import.meta.url))}},
  plugins: [react(), gameResources()],
  optimizeDeps: {include: ['react', 'react-dom/client']},
  server: {host: '127.0.0.1', port: 5189, strictPort: true, fs: {allow: [repository]}},
  preview: {host: '127.0.0.1', port: 5190, strictPort: true},
  build: {outDir: fileURLToPath(new URL('./dist/game/', import.meta.url)), emptyOutDir: true},
});

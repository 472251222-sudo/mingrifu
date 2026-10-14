// Deterministic native-resolution export. No AI service, scaling, drawing of the building, or game storage.
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const {PNG} = require(process.env.PNGJS_MODULE || 'pngjs');
const here = dirname(fileURLToPath(import.meta.url));
const flags = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, array) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), array[index + 1]]);
  return pairs;
}, []));
const config = JSON.parse(readFileSync(resolve(flags.config || resolve(here, 'cabin-config.json'))));
const palette = config.pixelOutput.palette.map(hex => ({hex, rgb: Buffer.from(hex.slice(1), 'hex')}));
const read = path => PNG.sync.read(readFileSync(path));
const save = (path, png) => writeFileSync(path, PNG.sync.write(png), {flag: 'wx'});
const hexAt = (data, p) => '#' + data.subarray(p, p + 3).toString('hex');

export function pixelize(src) {
  const result = new PNG({width: src.width, height: src.height});
  for (let p = 0; p < src.data.length; p += 4) {
    if (src.data[p + 3] < config.pixelOutput.alphaThreshold) continue;
    const rgb = src.data.subarray(p, p + 3);
    let nearest = palette[0], error = Infinity;
    for (const color of palette) {
      const d = [0.30, 0.59, 0.11].reduce((n, weight, i) => n + weight * (rgb[i] - color.rgb[i]) ** 2, 0);
      if (d < error) {nearest = color; error = d;}
    }
    result.data.set([...nearest.rgb, 255], p);
  }
  // An exact one-native-pixel outer contour; building interiors still come from the 3D model.
  const silhouette = Buffer.from(result.data);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const p = (y * src.width + x) * 4;
    if (silhouette[p + 3]) continue;
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    if (neighbors.some(([a, b]) => a >= 0 && b >= 0 && a < src.width && b < src.height && silhouette[(b * src.width + a) * 4 + 3])) {
      const outline = Buffer.from((x < src.width / 2 && y < src.height * .75 ? '#594036' : '#3b2926').slice(1), 'hex');
      result.data.set([...outline, 255], p);
    }
  }
  return result;
}

function inspect(image) {
  const colors = new Set(), alphas = new Set();
  let minX = image.width, minY = image.height, maxX = -1, maxY = -1, visible = 0, partial = 0;
  for (let p = 0; p < image.data.length; p += 4) {
    const a = image.data[p + 3]; alphas.add(a); if (a && a !== 255) partial++;
    if (!a) continue;
    visible++; colors.add(hexAt(image.data, p));
    const i = p / 4, x = i % image.width, y = Math.floor(i / image.width);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return {width: image.width, height: image.height, visiblePixels: visible, transparentPixels: image.width * image.height - visible,
    partialAlphaPixels: partial, alphaValues: [...alphas].sort((a,b) => a-b), colorCount: colors.size,
    outsidePaletteCount: [...colors].filter(c => !config.pixelOutput.palette.includes(c)).length,
    outsidePaletteSample: [...colors].filter(c => !config.pixelOutput.palette.includes(c)).slice(0,16),
    boundingBox: {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1},
    touchesCanvasEdge: minX === 0 || minY === 0 || maxX === image.width - 1 || maxY === image.height - 1};
}

if (!flags.input || !flags.output) throw new Error('Usage: node pixel_export.mjs --input RAW.png --output SPRITE.png [--config CONFIG.json] [--roof-mask RAW-MASK.png]');
const src = read(flags.input), sprite = pixelize(src);
if (src.width !== config.render.width || src.height !== config.render.height) throw new Error('Native render dimensions mismatch; this exporter never resizes input');
save(flags.output, sprite);
const record = {input: flags.input, output: flags.output, raw: inspect(src), sprite: inspect(sprite),
  inputSha256: createHash('sha256').update(readFileSync(flags.input)).digest('hex'),
  outputSha256: createHash('sha256').update(readFileSync(flags.output)).digest('hex'),
  operations: ['native-resolution alpha threshold', 'fixed 32-color palette mapping', '1px outer contour'],
  imageResized: false, anchor: config.game.anchor, footprint: config.game.footprint,
  technicalPassed: sprite.width === 96 && sprite.height === 128 && inspect(sprite).partialAlphaPixels === 0
    && inspect(sprite).outsidePaletteCount === 0 && !inspect(sprite).touchesCanvasEdge,
  humanVisualReviewRequired: true};
writeFileSync(flags.output.replace(/\.png$/, '-quality.json'), JSON.stringify(record, null, 2) + '\n', {flag:'wx'});
if (flags['roof-mask']) {
  const maskRaw = read(flags['roof-mask']), mask = new PNG({width: src.width, height: src.height});
  if (maskRaw.width !== src.width || maskRaw.height !== src.height) throw new Error('Mask size mismatch');
  // Include filter coverage; edits to a rendered roof edge can influence mixed edge pixels.
  for (let p = 0; p < mask.data.length; p += 4) {
    const selected = maskRaw.data[p + 3] > 0 && maskRaw.data[p] > 0;
    mask.data.set(selected ? [255,255,255,255] : [0,0,0,255], p);
  }
  save(resolve(dirname(flags.output), 'roof-visible-mask.png'), mask);
}
console.log(JSON.stringify(record, null, 2));

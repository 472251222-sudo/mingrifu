import { buildingConfig } from './buildings.js';
import { CHUNK_SIZE, allCells, hasCell, placementCheck } from './grid.js';
import { project, viewOrigin, TILE_WIDTH } from './view.js';
import { groundBitmap, pixelLine, pixelPolygon } from './isometric-art.js';

import { entryRect, sceneEntries } from './scene.js';
import { sampleGroundBitmap } from './sample-art.js';

const ASSET_ROOT = '/assets/growth-p1/';
let assetPromise;
export function loadAssets(retry = false) {
  if (retry) assetPromise = null;
  if (!assetPromise) assetPromise = (async () => {
    const response = await fetch(`${ASSET_ROOT}manifest.json`);
    if (!response.ok) throw new Error('像素素材清单没有加载成功。');
    const manifest = await response.json();
    const load = name => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('像素图集没有加载成功，世界存档仍然保留。'));
      image.src = ASSET_ROOT + name;
    });
    const [tree, city] = await Promise.all([load('tree-atlas.png'), load('city-atlas.png')]);
    return { sprites: manifest.sprites, images: { 'tree-atlas.png': tree, 'city-atlas.png': city } };
  })();
  return assetPromise;
}
export function drawSprite(context, assets, key, x, y, alpha = 1) {
  const sprite = assets?.sprites[key];
  if (!sprite) return;
  context.save(); context.globalAlpha = alpha; context.imageSmoothingEnabled = false;
  context.drawImage(assets.images[sprite.file], sprite.x, sprite.y, 48, 48, Math.round(x), Math.round(y), 48, 48);
  context.restore();
}
function noise(x, y) {
  return ((Math.imul(x + 713, 374761393) ^ Math.imul(y + 929, 668265263)) >>> 0);
}
export function paintMap(context, world, assets, view, options = {}) {
  const { width, height, scale } = view, origin = viewOrigin(view, { width, height });
  const screen = point => ({ x: Math.round(origin.x + point.x * scale), y: Math.round(origin.y + point.y * scale) });
  const at = (x, y) => screen(project(x, y));
  const visible = (point, margin = 80 * scale) => point.x + margin > 0 && point.y + margin > 0 && point.x - margin < width && point.y - margin < height;
  const rect = (x, y, w, h, color) => { context.fillStyle = color; context.fillRect(x, y, w, h); };
  const imageAt = (image, point, anchorX, anchorY, alpha = 1) => {
    const destination = screen({ x: point.x - anchorX, y: point.y - anchorY });
    context.save(); context.globalAlpha = alpha;
    context.drawImage(image, destination.x, destination.y, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    context.restore();
  };
  const shape = (x, y, w, h, fill, line) => {
    const points = [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h)];
    if (fill) pixelPolygon(context, points, fill);
    if (line) for (let i = 0; i < 4; i++) pixelLine(context, points[i], points[(i + 1) % 4], line);
  };
  // The drawing buffer always matches the viewport, even at very small zoom.
  context.imageSmoothingEnabled = false;
  rect(0, 0, width, height, '#c5dbd5');
  for (let y = 0; y < height; y += 48) for (let x = 0; x < width; x += 48) {
    const n = noise(x, y);
    rect(x + n % 23, y + n % 29, 7, 1, '#b4d0cb');
    if (n % 3 === 0) rect(x + 11, y + 28, 3, 1, '#d7e6dc');
  }
  const cells = allCells(world).sort((a, b) => a.x + a.y - b.x - b.y);
  for (const cell of cells) {
    const point = project(cell.x, cell.y);
    if (!visible(screen(point))) continue;
    const edge = (!hasCell(world, cell.x + 1, cell.y) ? 1 : 0) | (!hasCell(world, cell.x, cell.y + 1) ? 2 : 0)
      | (!hasCell(world, cell.x - 1, cell.y) ? 4 : 0) | (!hasCell(world, cell.x, cell.y - 1) ? 8 : 0);
    imageAt(options.art === 'candidate' ? sampleGroundBitmap(cell.x, cell.y, edge, options.grid) : groundBitmap(noise(cell.x, cell.y) % 12, edge, options.grid), point, TILE_WIDTH / 2, 0);
  }
  if (options.expansionCandidates) for (const [index, region] of options.expansionCandidates.entries()) {
    const selected = region.x === options.expansion?.x && region.y === options.expansion?.y;
    const x = region.x * CHUNK_SIZE, y = region.y * CHUNK_SIZE;
    shape(x, y, CHUNK_SIZE, CHUNK_SIZE, selected ? '#e9e0ae90' : '#e4ead940', selected ? '#927745' : '#8aab8b');
    const center = at(x + CHUNK_SIZE / 2, y + CHUNK_SIZE / 2);
    rect(center.x - 17, center.y - 10, 34, 20, selected ? '#faf0cf' : '#eef5e6');
    context.fillStyle = selected ? '#7e623e' : '#557456'; context.font = '12px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(`+${index + 1}`, center.x, center.y);
  }
  // All ground feedback is below objects. Silhouettes are never cut through
  // by a selected footprint line, and previews participate in painter order.
  for (const b of world.buildings) if (!b.stored && options.selectedId === b.id) {
    const config = buildingConfig(b.type); shape(b.x, b.y, config.width, config.height, '#f5efc940', '#fcf3cc');
  }
  if (options.preview) {
    const { type, x, y, id } = options.preview, config = buildingConfig(type), valid = placementCheck(world, type, x, y, id).valid;
    shape(x, y, config.width, config.height, valid ? '#f5f7d480' : '#c8797180', valid ? '#3d6950' : '#974b44');
  }
  const entries = sceneEntries(world, assets, options);
  if (options.art === 'candidate') for (const entry of entries) {
    // Contact/cast shadows are ground-only and do not belong to hit masks.
    const p = project(entry.x, entry.y), shadow = entry.kind === 'plant'
      ? [[-9, 2], [-6, -1], [0, -3], [10, -1], [17, 2], [19, 4], [15, 7], [6, 9], [-2, 7], [-8, 4]].map(([x, y]) => ({ x: p.x + x, y: p.y + y }))
      : [project(entry.x + .2, entry.y + .2), project(entry.x + 2, entry.y + .2), project(entry.x + 2.4, entry.y + 1.8), project(entry.x + .6, entry.y + 2.2)];
    pixelPolygon(context, shadow.map(screen), '#5f704f35');
  }
  for (const entry of entries) {
    const bounds = entryRect(entry, view);
    if (bounds.x + bounds.width < 0 || bounds.y + bounds.height < 0 || bounds.x > width || bounds.y > height) continue;
    context.save(); context.globalAlpha = entry.kind === 'preview' ? .75 : entry.id === options.movingId ? .35 : 1;
    context.drawImage(entry.image, bounds.x, bounds.y, bounds.width, bounds.height); context.restore();
    if (entry.kind === 'plant' && options.changedIds?.includes(entry.id)) {
      const point = at(entry.x, entry.y); rect(point.x, point.y - 34 * scale - 2, 1, 5, '#fff3bc'); rect(point.x - 2, point.y - 34 * scale, 5, 1, '#fff3bc');
    }
  }
}

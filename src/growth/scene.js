import { buildingConfig } from './buildings.js';
import { buildingAt } from './grid.js';
import { project, screenCell, viewOrigin } from './view.js';
import { buildingBitmap } from './isometric-art.js';
import { cabinBitmap, treeBitmap } from './sample-art.js';

const crops = new WeakMap(), masks = new WeakMap();
function plantBitmap(assets, plant) {
  const sprite = assets?.sprites[`tree:${plant.kind}:${plant.stage}`];
  if (!sprite) return null;
  const atlas = assets.images[sprite.file];
  if (!crops.has(atlas)) crops.set(atlas, new Map());
  const cache = crops.get(atlas), key = `${sprite.x}:${sprite.y}`;
  if (!cache.has(key)) {
    const image = document.createElement('canvas'); image.width = 48; image.height = 48;
    image.getContext('2d').drawImage(atlas, sprite.x, sprite.y, 48, 48, 0, 0, 48, 48); cache.set(key, image);
  }
  return cache.get(key);
}
export function sceneEntries(world, assets, options = {}) {
  const entries = world.nature.map(plant => ({
    kind: 'plant', id: plant.id, plant, x: plant.x + .5, y: plant.y + .5, depth: plant.x + plant.y + 1,
    image: options.art === 'candidate' && plant.kind === 'tree' ? treeBitmap() : plantBitmap(assets, plant),
    anchorX: options.art === 'candidate' && plant.kind === 'tree' ? 32 : 24,
    anchorY: options.art === 'candidate' && plant.kind === 'tree' ? 52 : 44,
  }));
  const buildingEntry = (building, kind) => {
    const config = buildingConfig(building.type);
    return { kind, id: building.id, building, x: building.x, y: building.y, depth: building.x + building.y + config.width + config.height,
      image: options.art === 'candidate' && building.type === 'cottage' ? cabinBitmap() : buildingBitmap(building.type, options.art === 'legacy'), anchorX: 40, anchorY: 40 };
  };
  entries.push(...world.buildings.filter(b => !b.stored).map(b => buildingEntry(b, 'building')));
  if (options.preview) entries.push(buildingEntry(options.preview, 'preview'));
  return entries.filter(e => e.image).sort((a, b) => a.depth - b.depth || (a.kind === 'preview' ? -1 : b.kind === 'preview' ? 1 : 0));
}
export function entryRect(entry, view) {
  const origin = viewOrigin(view, view), point = project(entry.x, entry.y);
  return { x: Math.round(origin.x + (point.x - entry.anchorX) * view.scale), y: Math.round(origin.y + (point.y - entry.anchorY) * view.scale), width: Math.max(1, Math.round(entry.image.width * view.scale)), height: Math.max(1, Math.round(entry.image.height * view.scale)) };
}
export function alphaAt(mask, width, height, rect, x, y) {
  if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) return 0;
  const px = Math.min(width - 1, Math.floor((x - rect.x) * width / rect.width));
  const py = Math.min(height - 1, Math.floor((y - rect.y) * height / rect.height));
  return mask[(py * width + px) * 4 + 3];
}
export function entryAlpha(entry, view, x, y) {
  const rect = entryRect(entry, view), key = `${rect.width}:${rect.height}`;
  if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) return 0;
  if (!masks.has(entry.image)) masks.set(entry.image, new Map());
  const cache = masks.get(entry.image);
  if (!cache.has(key)) {
    // Match the browser's actual nearest-neighbour raster, including skipped
    // logical pixels below 100%. An inverse source-coordinate approximation
    // can hit an invisible edge pixel at fractional zoom.
    const mask = document.createElement('canvas'); mask.width = rect.width; mask.height = rect.height;
    const context = mask.getContext('2d'); context.imageSmoothingEnabled = false;
    context.drawImage(entry.image, 0, 0, rect.width, rect.height);
    cache.set(key, context.getImageData(0, 0, rect.width, rect.height).data);
  }
  return alphaAt(cache.get(key), rect.width, rect.height, rect, x, y);
}
export function hitTestScene(world, assets, view, x, y, options = {}) {
  const entries = sceneEntries(world, assets, options);
  // Walk the same painter order backwards. An opaque tree blocks a hidden
  // building; transparent sprite margins do not steal a click.
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entryAlpha(entry, view, x, y) >= 128) return entry.kind === 'building' ? entry.building : null;
  }
  const cell = screenCell(x, y, view, view);
  return buildingAt(world, cell.x, cell.y) || null;
}

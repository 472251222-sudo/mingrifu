import {BALANCE} from './balance.js';
import {tileId} from '../homestead/tile-rules.js';
import {objectOrder, objectRect} from '../homestead/world.js';

export const ZOOMS = [.125, .25, .5, 1, 2, 3, 4];
export const spriteRect = objectRect;

export function projectObject(object, assets, kind = 'artificial') {
  const assetId = object.assetId || object.asset;
  const asset = assets.get(assetId);
  if (!asset) throw Error(`未找到世界素材：${assetId}`);
  return {...object, kind, assetId, asset, ground: [(object.x - asset.footprintOffset[0]) * BALANCE.tileSize, (object.y - asset.footprintOffset[1]) * BALANCE.tileSize]};
}

export function worldToScene(world, manifest) {
  if (manifest.tileSize !== BALANCE.tileSize) throw Error('世界与素材网格规格不一致。');
  const assets = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const cells = Object.create(null);
  for (const chunk of world.chunks) for (let dy = 0; dy < BALANCE.chunkSize; dy++) for (let dx = 0; dx < BALANCE.chunkSize; dx++) {
    const x = chunk.x * BALANCE.chunkSize + dx, y = chunk.y * BALANCE.chunkSize + dy;
    (cells[y] ||= Object.create(null))[x] = 'grass';
  }
  for (const {x, y} of world.path) if (cells[y]?.[x]) cells[y][x] = 'path';
  const tiles = Object.entries(cells).flatMap(([y, row]) => Object.keys(row).map(x => {
    x = Number(x); y = Number(y);
    const id = tileId(cells, x, y), tile = manifest.terrain.tiles[id];
    if (!tile) throw Error(`未找到地形素材：${id}`);
    return {x, y, id, tile};
  }));
  const objects = [...world.objects.filter(object => !object.stored).map(object => projectObject(object, assets)), ...world.nature.map(object => projectObject(object, assets, 'natural'))];
  const bounds = sceneBounds(tiles, objects);
  return {tiles, objects, assets, cells, bounds};
}

export function sceneBounds(tiles, objects) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const tile of tiles) {x0 = Math.min(x0, tile.x * 32); y0 = Math.min(y0, tile.y * 32); x1 = Math.max(x1, (tile.x + 1) * 32); y1 = Math.max(y1, (tile.y + 1) * 32);}
  for (const object of objects) {
    const [x, y] = spriteRect(object), [bx, by, width, height] = object.asset.visualBounds;
    x0 = Math.min(x0, x + bx); y0 = Math.min(y0, y + by); x1 = Math.max(x1, x + bx + width); y1 = Math.max(y1, y + by + height);
  }
  if (!Number.isFinite(x0)) return {x0: -12, y0: -12, x1: 12, y1: 12};
  return {x0: x0 - 12, y0: y0 - 12, x1: x1 + 12, y1: y1 + 12};
}

export function hitScene(scene, point, masks, screenAlpha = null) {
  const objects = objectOrder(scene.objects).reverse();
  for (const object of objects) {
    if (screenAlpha) {if (screenAlpha(object)) return object; continue;}
    const [x, y] = spriteRect(object), mask = masks.get(object.assetId);
    if (!mask) continue;
    const px = Math.floor(point.x - x), py = Math.floor(point.y - y);
    if (px >= 0 && py >= 0 && px < mask.width && py < mask.height && mask.alpha[py * mask.width + px] > 0) return object;
  }
  // Ground occupancy is a secondary hit target, after all foreground alpha.
  return objects.find(object => object.kind === 'artificial' && point.x >= object.x * 32 && point.y >= object.y * 32 && point.x < (object.x + object.asset.footprint[0]) * 32 && point.y < (object.y + object.asset.footprint[1]) * 32) || null;
}

export function cameraOrigin(camera, width, height) {return [Math.round(width / 2 - camera.x * camera.scale), Math.round(height / 2 - camera.y * camera.scale)];}
export function screenToWorld(point, camera, width, height) {const [x, y] = cameraOrigin(camera, width, height); return {x: (point.x - x) / camera.scale, y: (point.y - y) / camera.scale};}
export function screenToCell(point, camera, width, height) {const world = screenToWorld(point, camera, width, height); return {x: Math.floor(world.x / 32), y: Math.floor(world.y / 32)};}
export function fitSceneCamera(scene, width, height) {
  const {x0, y0, x1, y1} = scene.bounds;
  const fit = Math.min(width / (x1 - x0), height / (y1 - y0));
  return {x: (x0 + x1) / 2, y: (y0 + y1) / 2, scale: ZOOMS.filter(scale => scale <= fit).at(-1) || fit};
}
export function constrainSceneCamera(camera, scene, width, height) {
  const {x0, y0, x1, y1} = scene.bounds;
  const clamp = (value, low, high, visible) => visible >= high - low ? (low + high) / 2 : Math.max(low + visible * .15, Math.min(high - visible * .15, value));
  return {...camera, x: clamp(camera.x, x0, x1, width / camera.scale), y: clamp(camera.y, y0, y1, height / camera.scale)};
}
export function zoomSceneCamera(camera, direction, scene, width, height, screenPoint = null) {
  const scale = direction > 0 ? ZOOMS.find(scale => scale > camera.scale + 1e-9) ?? camera.scale : ZOOMS.filter(scale => scale < camera.scale - 1e-9).at(-1) ?? camera.scale;
  let next = {...camera, scale};
  if (screenPoint) {
    const before = screenToWorld(screenPoint, camera, width, height), after = screenToWorld(screenPoint, next, width, height);
    next = {...next, x: next.x + before.x - after.x, y: next.y + before.y - after.y};
  }
  return constrainSceneCamera(next, scene, width, height);
}

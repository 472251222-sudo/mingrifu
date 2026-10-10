import { CHUNK_SIZE, TILE_SIZE } from './grid.js';

export const TILE_WIDTH = TILE_SIZE;
export const TILE_HEIGHT = TILE_SIZE / 2;
export const BASE_ZOOM_LEVELS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 1.5, 2, 3, 4];

// All ground geometry, object anchors and picking share the same 2:1 projection.
export function project(x, y) {
  return { x: (x - y) * TILE_WIDTH / 2, y: (x + y) * TILE_HEIGHT / 2 };
}
export function unproject(x, y) {
  return { x: x / TILE_WIDTH + y / TILE_HEIGHT, y: y / TILE_HEIGHT - x / TILE_WIDTH };
}
export function mapExtents(world, candidate) {
  const chunks = candidate ? [...world.chunks, ...(Array.isArray(candidate) ? candidate : [candidate])] : world.chunks;
  const corners = chunks.flatMap(c => [
    project(c.x * CHUNK_SIZE, c.y * CHUNK_SIZE),
    project((c.x + 1) * CHUNK_SIZE, c.y * CHUNK_SIZE),
    project(c.x * CHUNK_SIZE, (c.y + 1) * CHUNK_SIZE),
    project((c.x + 1) * CHUNK_SIZE, (c.y + 1) * CHUNK_SIZE),
  ]);
  // Include upright roofs and foliage, not just the ground diamond.
  return {
    minX: Math.min(...corners.map(p => p.x)) - 24,
    maxX: Math.max(...corners.map(p => p.x)) + 24,
    minY: Math.min(...corners.map(p => p.y)) - 40,
    maxY: Math.max(...corners.map(p => p.y)) + 12,
  };
}
export function availableScale(world, size, candidate) {
  const bounds = mapExtents(world, candidate);
  return Math.min(Math.max(1, size.width - 32) / (bounds.maxX - bounds.minX), Math.max(1, size.height - 32) / (bounds.maxY - bounds.minY));
}
export function zoomLevels(world, size, candidate) {
  const levels = [...BASE_ZOOM_LEVELS], required = availableScale(world, size, candidate);
  while (levels[0] > required) levels.unshift(levels[0] / 2);
  return levels;
}
export function fitCamera(world, size, candidate) {
  const bounds = mapExtents(world, candidate), required = availableScale(world, size, candidate);
  const scale = zoomLevels(world, size, candidate).filter(s => s <= required && s <= 3).at(-1);
  return { centerX: (bounds.minX + bounds.maxX) / 2, centerY: (bounds.minY + bounds.maxY) / 2, scale };
}
export function stepZoom(scale, direction, levels) {
  return direction < 0 ? levels.filter(s => s < scale - 1e-9).at(-1) ?? levels[0] : levels.find(s => s > scale + 1e-9) ?? levels.at(-1);
}
export function viewOrigin(camera, size) {
  return { x: Math.round(size.width / 2 - camera.centerX * camera.scale), y: Math.round(size.height / 2 - camera.centerY * camera.scale) };
}
export function screenCell(x, y, camera, size) {
  const origin = viewOrigin(camera, size), cell = unproject((x - origin.x) / camera.scale, (y - origin.y) / camera.scale);
  return { x: Math.floor(cell.x + 1e-9), y: Math.floor(cell.y + 1e-9) };
}

// Keep an interior point of unlocked land in view. Unlike a rectangular world
// bound, this also works near concave coastlines and long chains of chunks.
export function constrainCamera(camera, world, size, candidate, elastic = false) {
  const chunks = candidate ? [...world.chunks, ...(Array.isArray(candidate) ? candidate : [candidate])] : world.chunks;
  let closest = null, distance = Infinity;
  for (const chunk of chunks) {
    const x = chunk.x * CHUNK_SIZE, y = chunk.y * CHUNK_SIZE;
    const corners = [project(x + .5, y + .5), project(x + 7.5, y + .5), project(x + 7.5, y + 7.5), project(x + .5, y + 7.5)];
    const cell = unproject(camera.centerX, camera.centerY);
    if (cell.x >= x + .5 && cell.x <= x + 7.5 && cell.y >= y + .5 && cell.y <= y + 7.5) return camera;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((camera.centerX - a.x) * dx + (camera.centerY - a.y) * dy) / (dx * dx + dy * dy)));
      const point = { x: a.x + t * dx, y: a.y + t * dy }, d = (point.x - camera.centerX) ** 2 + (point.y - camera.centerY) ** 2;
      if (d < distance) { closest = point; distance = d; }
    }
  }
  if (!closest) return camera;
  const limitX = Math.max(1, size.width / 2 - Math.min(36, size.width / 4)) / camera.scale;
  const limitY = Math.max(1, size.height / 2 - Math.min(36, size.height / 4)) / camera.scale;
  const clamp = (value, anchor, limit) => {
    const bound = Math.max(anchor - limit, Math.min(anchor + limit, value));
    return elastic ? bound + Math.max(-8 / camera.scale, Math.min(8 / camera.scale, (value - bound) * .12)) : bound;
  };
  return { ...camera, centerX: clamp(camera.centerX, closest.x, limitX), centerY: clamp(camera.centerY, closest.y, limitY) };
}

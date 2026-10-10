import { buildingConfig } from './buildings.js';

export const CHUNK_SIZE = 8;
export const TILE_SIZE = 24;
export const DIRECTIONS = [
  { id: 'north', x: 0, y: -1, label: '北' },
  { id: 'east', x: 1, y: 0, label: '东' },
  { id: 'south', x: 0, y: 1, label: '南' },
  { id: 'west', x: -1, y: 0, label: '西' },
];
export const cellKey = (x, y) => `${x},${y}`;
export const sameCell = (a, b) => a.x === b.x && a.y === b.y;
export const hasChunk = (world, x, y) => world.chunks.some(c => c.x === x && c.y === y);
export const hasCell = (world, x, y) => Number.isSafeInteger(x) && Number.isSafeInteger(y) && hasChunk(world, Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));

export function footprint(x, y, width, height) {
  return Array.from({ length: width * height }, (_, i) => ({ x: x + i % width, y: y + Math.floor(i / width) }));
}
export function buildingCells(building) {
  if (building.stored) return [];
  const config = buildingConfig(building.type);
  return footprint(building.x, building.y, config.width, config.height);
}
export function occupiedCells(world, excludeId) {
  return new Set(world.buildings.filter(b => b.id !== excludeId).flatMap(buildingCells).map(c => cellKey(c.x, c.y)));
}
export function buildingAt(world, x, y) {
  return world.buildings.find(b => buildingCells(b).some(c => c.x === x && c.y === y));
}
export function placementCheck(world, type, x, y, excludeId) {
  const { width, height } = buildingConfig(type);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return { valid: false, reason: '请选择完整的网格位置。' };
  const cells = footprint(x, y, width, height);
  if (cells.some(c => !hasCell(world, c.x, c.y))) return { valid: false, reason: '建筑超出已开放土地，请换个位置或先扩张。' };
  const occupied = occupiedCells(world, excludeId);
  if (cells.some(c => occupied.has(cellKey(c.x, c.y)))) return { valid: false, reason: '这里与已有建筑重叠，请换个位置。' };
  return { valid: true, reason: '可以放在这里，植物会为建筑让出空间。' };
}
export function frontierChunks(world) {
  const result = new Map();
  for (const chunk of world.chunks) for (const direction of DIRECTIONS) {
    const x = chunk.x + direction.x, y = chunk.y + direction.y;
    if (!hasChunk(world, x, y)) result.set(cellKey(x, y), { x, y });
  }
  return [...result.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
export function worldBounds(world) {
  const minX = Math.min(...world.chunks.map(c => c.x)) * CHUNK_SIZE;
  const minY = Math.min(...world.chunks.map(c => c.y)) * CHUNK_SIZE;
  const maxX = (Math.max(...world.chunks.map(c => c.x)) + 1) * CHUNK_SIZE;
  const maxY = (Math.max(...world.chunks.map(c => c.y)) + 1) * CHUNK_SIZE;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
export function allCells(world) {
  return world.chunks.flatMap(c => footprint(c.x * CHUNK_SIZE, c.y * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE));
}

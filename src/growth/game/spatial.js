import {ASSETS, BALANCE} from './balance.js';

export const cellKey = (x, y) => `${x},${y}`;
const directions = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const validCoordinate = value => Number.isSafeInteger(value) && value >= -BALANCE.limits.maxChunkCoordinate * BALANCE.chunkSize && value < (BALANCE.limits.maxChunkCoordinate + 1) * BALANCE.chunkSize;

export function footprintCells(assetId, x, y) {
  if (!Object.hasOwn(ASSETS, assetId)) throw new Error('这类对象的素材暂不可用。');
  if (!validCoordinate(x) || !validCoordinate(y)) throw new Error('请选择有效的整数网格位置。');
  const [width, height] = ASSETS[assetId].footprint;
  return Array.from({length: width * height}, (_, index) => ({x: x + index % width, y: y + Math.floor(index / width)}));
}

export function hasWorldCell(world, x, y) {
  if (!validCoordinate(x) || !validCoordinate(y)) return false;
  const chunkX = Math.floor(x / BALANCE.chunkSize), chunkY = Math.floor(y / BALANCE.chunkSize);
  return world.chunks.some(chunk => chunk.x === chunkX && chunk.y === chunkY);
}

export function placementCheck(world, assetId, x, y, ignoreId = null) {
  let cells;
  try { cells = footprintCells(assetId, x, y); }
  catch (error) { return {ok: false, message: error.message}; }
  if (cells.some(cell => !hasWorldCell(world, cell.x, cell.y))) return {ok: false, message: '对象超出已开放土地，请换个位置或先扩张。'};
  const occupied = new Set(world.objects.filter(item => !item.stored && item.id !== ignoreId).flatMap(item => footprintCells(item.asset, item.x, item.y)).map(cell => cellKey(cell.x, cell.y)));
  if (cells.some(cell => occupied.has(cellKey(cell.x, cell.y)))) return {ok: false, message: '这里与已有人工对象重叠，请换个位置。'};
  return {ok: true, message: '可以放在这里，相交的自然植被会让出空间。'};
}

export function frontierChunks(world) {
  if (world.chunks.length >= BALANCE.limits.maxChunks) return [];
  const existing = new Set(world.chunks.map(chunk => cellKey(chunk.x, chunk.y)));
  const frontier = new Map();
  for (const chunk of world.chunks) for (const [dx, dy] of directions) {
    const x = chunk.x + dx, y = chunk.y + dy;
    if (Math.abs(x) <= BALANCE.limits.maxChunkCoordinate && Math.abs(y) <= BALANCE.limits.maxChunkCoordinate && !existing.has(cellKey(x, y))) frontier.set(cellKey(x, y), {x, y});
  }
  return [...frontier.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

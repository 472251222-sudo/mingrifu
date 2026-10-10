import { buildingConfig } from './buildings.js';
import { buildingCells, cellKey, frontierChunks, hasCell, placementCheck } from './grid.js';
import { NATURE_KINDS, initialNature, growNature } from './nature.js';

export const WORLD_VERSION = 1;
export function createWorld() {
  return { version: WORLD_VERSION, id: 'my-world', revision: 0, nextId: 8, chunks: [{ x: 0, y: 0 }], buildings: [], nature: initialNature(), growth: { step: 0 }, updatedAt: null };
}
function changed(world, patch, now) {
  return { ...world, ...patch, revision: world.revision + 1, updatedAt: now };
}
export function applyWorldCommand(world, command, now = new Date().toISOString()) {
  if (command.type === 'place') {
    const existing = command.id ? world.buildings.find(b => b.id === command.id) : null;
    if (command.id && !existing) throw new Error('找不到这栋建筑，请重新选择。');
    const type = existing?.type || command.buildingType;
    const check = placementCheck(world, type, command.x, command.y, existing?.id);
    if (!check.valid) throw new Error(check.reason);
    const placed = { id: existing?.id || `b-${world.nextId}`, type, x: command.x, y: command.y, stored: false };
    const cells = new Set(buildingCells(placed).map(c => cellKey(c.x, c.y)));
    return changed(world, {
      buildings: existing ? world.buildings.map(b => b.id === existing.id ? placed : b) : [...world.buildings, placed],
      nature: world.nature.filter(n => !cells.has(cellKey(n.x, n.y))),
      nextId: existing ? world.nextId : world.nextId + 1,
    }, now);
  }
  if (command.type === 'store') {
    const building = world.buildings.find(b => b.id === command.id);
    if (!building || building.stored) throw new Error('这栋建筑已经不在地图上了。');
    return changed(world, { buildings: world.buildings.map(b => b.id === command.id ? { ...b, x: null, y: null, stored: true } : b) }, now);
  }
  if (command.type === 'expand') {
    if (!frontierChunks(world).some(c => c.x === command.x && c.y === command.y)) throw new Error('请选择与现有土地相邻、尚未开放的区域。');
    return changed(world, { chunks: [...world.chunks, { x: command.x, y: command.y }] }, now);
  }
  if (command.type === 'grow') {
    const result = growNature(world);
    return changed(world, { nature: result.nature, nextId: world.nextId + (result.added ? 1 : 0), growth: { step: world.growth.step + 1, changedIds: result.changedIds, copy: result.copy } }, now);
  }
  throw new Error('这项操作暂不可用。');
}

// Validate persisted input before it can become editable. Never silently reset.
export function validateWorld(world) {
  const fail = () => { throw new Error('世界存档格式不完整，原存档已保留，请检查或恢复后重试。'); };
  if (!world || world.version !== WORLD_VERSION) throw new Error('世界存档版本暂不支持，原存档已保留。');
  if (world.id !== 'my-world' || !Number.isSafeInteger(world.revision) || world.revision < 0 || !Number.isSafeInteger(world.nextId) || world.nextId < 8) fail();
  if (!Array.isArray(world.chunks) || !world.chunks.length || !Array.isArray(world.buildings) || !Array.isArray(world.nature) || !Number.isSafeInteger(world.growth?.step) || world.growth.step < 0) fail();
  if (world.updatedAt !== null && (typeof world.updatedAt !== 'string' || !Number.isFinite(Date.parse(world.updatedAt)))) fail();
  const chunkKeys = new Set();
  for (const c of world.chunks) {
    if (!c || !Number.isSafeInteger(c.x) || !Number.isSafeInteger(c.y) || Math.abs(c.x) > 10000 || Math.abs(c.y) > 10000 || chunkKeys.has(cellKey(c.x, c.y))) fail();
    chunkKeys.add(cellKey(c.x, c.y));
  }
  if (!chunkKeys.has('0,0')) fail();
  const visited = new Set(['0,0']), queue = [{ x: 0, y: 0 }];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const key = cellKey(c.x + dx, c.y + dy);
      if (chunkKeys.has(key) && !visited.has(key)) { visited.add(key); queue.push({ x: c.x + dx, y: c.y + dy }); }
    }
  }
  if (visited.size !== chunkKeys.size) fail();
  const ids = new Set(), occupied = new Set();
  const identify = (item, prefix) => {
    if (!item || typeof item.id !== 'string' || !new RegExp(`^${prefix}-[1-9]\\d*$`).test(item.id) || Number(item.id.slice(2)) >= world.nextId || ids.has(item.id)) fail();
    ids.add(item.id);
  };
  for (const b of world.buildings) {
    identify(b, 'b');
    try { buildingConfig(b.type); } catch { fail(); }
    if (typeof b.stored !== 'boolean') fail();
    if (b.stored) { if (b.x !== null || b.y !== null) fail(); continue; }
    if (!Number.isSafeInteger(b.x) || !Number.isSafeInteger(b.y)) fail();
    for (const c of buildingCells(b)) {
      const key = cellKey(c.x, c.y);
      if (!hasCell(world, c.x, c.y) || occupied.has(key)) fail();
      occupied.add(key);
    }
  }
  const natureCells = new Set();
  for (const n of world.nature) {
    identify(n, 'n');
    const key = cellKey(n.x, n.y);
    if (!NATURE_KINDS.includes(n.kind) || !Number.isSafeInteger(n.stage) || n.stage < 1 || n.stage > 5 || !hasCell(world, n.x, n.y) || occupied.has(key) || natureCells.has(key)) fail();
    natureCells.add(key);
  }
  if (world.growth.changedIds !== undefined && (!Array.isArray(world.growth.changedIds) || world.growth.changedIds.some(id => typeof id !== 'string'))) fail();
  if (world.growth.copy !== undefined && typeof world.growth.copy !== 'string') fail();
  return world;
}

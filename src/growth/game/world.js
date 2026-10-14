import {ASSETS, BALANCE} from './balance.js';
import {cellKey, footprintCells, placementCheck} from './spatial.js';

export function createGameWorld() {
  return {schemaVersion: BALANCE.schemaVersion, ...structuredClone(BALANCE.initial)};
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const fail = message => { throw new Error(`世界存档${message}，原存档已保留，请检查后重试。`); };

function shape(value, required, optional = []) {
  if (!record(value)) fail('格式不完整');
  const keys = Object.keys(value);
  if (keys.length > required.length + optional.length || required.some(key => !Object.hasOwn(value, key)) || keys.some(key => !required.includes(key) && !optional.includes(key))) fail('字段格式不完整');
}

function boundedArray(value, limit) {
  if (!Array.isArray(value) || value.length > limit) fail('列表缺失或超过数量上限');
}

function validISO(value) {
  if (typeof value !== 'string' || value.length > 40) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, zoneHour = '0', zoneMinute = '0'] = match.map((part, index) => index ? Number(part) : part);
  if (hour > 23 || minute > 59 || second > 59 || zoneHour > 23 || zoneMinute > 59) return false;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day;
}

function finish(world, patch) {
  if (world.revision === Number.MAX_SAFE_INTEGER) throw new Error('世界版本已达安全整数上限，操作未保存。');
  return validateGameWorld({...world, ...patch, revision: world.revision + 1});
}

function yieldingNature(world, asset, x, y) {
  const target = new Set(footprintCells(asset, x, y).map(cell => cellKey(cell.x, cell.y)));
  return world.nature.filter(item => !footprintCells(item.asset, item.x, item.y).some(cell => target.has(cellKey(cell.x, cell.y))));
}

export function applyGameCommand(world, command) {
  validateGameWorld(world);
  if (!record(command) || typeof command.type !== 'string') throw new Error('请选择有效的操作。');
  if (command.type === 'build') {
    if (typeof command.assetId !== 'string' || !Object.hasOwn(ASSETS, command.assetId)) throw new Error('这类对象的素材暂不可用。');
    const asset = ASSETS[command.assetId];
    if (world.xp < asset.unlockXP) throw new Error(`${asset.name}需要累计 ${asset.unlockXP} XP 才能解锁。`);
    if (world.bp < asset.cost) throw new Error(`BP 不足，${asset.name}首次建造需要 ${asset.cost} BP。`);
    const check = placementCheck(world, asset.id, command.x, command.y);
    if (!check.ok) throw new Error(check.message);
    if (world.objects.length >= BALANCE.limits.maxObjects) throw new Error('人工对象已达数量上限，无法继续创建。');
    if (world.nextId === Number.MAX_SAFE_INTEGER) throw new Error('对象编号已达安全整数上限，无法继续创建。');
    const item = {id: `o-${world.nextId}`, asset: asset.id, x: command.x, y: command.y, stored: false};
    return finish(world, {bp: world.bp - asset.cost, nextId: world.nextId + 1, objects: [...world.objects, item], nature: yieldingNature(world, item.asset, item.x, item.y)});
  }
  if (['move', 'store', 'place'].includes(command.type)) {
    const item = world.objects.find(object => object.id === command.id);
    if (!item) throw new Error('找不到这个人工对象，请重新选择。');
    if (command.type === 'place' && !item.stored) throw new Error('这个对象已在地图上，请使用移动；重摆只用于已收纳对象。');
    if (command.type !== 'place' && item.stored) throw new Error('这个对象已经收纳，请从收纳列表重新摆放。');
    if (command.type === 'store') return finish(world, {objects: world.objects.map(object => object.id === item.id ? {...object, x: null, y: null, stored: true} : object)});
    const check = placementCheck(world, item.asset, command.x, command.y, item.id);
    if (!check.ok) throw new Error(check.message);
    if (command.type === 'move' && item.x === command.x && item.y === command.y) return world;
    const placed = {...item, x: command.x, y: command.y, stored: false};
    return finish(world, {objects: world.objects.map(object => object.id === item.id ? placed : object), nature: yieldingNature(world, item.asset, command.x, command.y)});
  }
  throw new Error('这项操作暂不可用。');
}

export function validateGameWorld(world) {
  if (!world || world.schemaVersion !== BALANCE.schemaVersion) throw new Error('世界存档版本暂不支持，原存档已保留。');
  shape(world, ['schemaVersion', 'revision', 'nextId', 'chunks', 'xp', 'bp', 'efforts', 'objects', 'nature', 'path']);
  if (![world.revision, world.xp, world.bp].every(nonnegativeInteger)) fail('资源与版本必须是非负安全整数');
  if (!Number.isSafeInteger(world.nextId) || world.nextId < BALANCE.initial.nextId) fail('对象编号无效');
  boundedArray(world.chunks, BALANCE.limits.maxChunks);
  boundedArray(world.objects, BALANCE.limits.maxObjects);
  boundedArray(world.nature, BALANCE.limits.maxNature);
  boundedArray(world.efforts, BALANCE.limits.maxEfforts);
  boundedArray(world.path, BALANCE.limits.maxPathCells);

  const chunks = new Set();
  for (const chunk of world.chunks) {
    shape(chunk, ['x', 'y']);
    if (!Number.isSafeInteger(chunk.x) || !Number.isSafeInteger(chunk.y) || Math.abs(chunk.x) > BALANCE.limits.maxChunkCoordinate || Math.abs(chunk.y) > BALANCE.limits.maxChunkCoordinate) fail('土地区块坐标无效');
    const key = cellKey(chunk.x, chunk.y);
    if (chunks.has(key)) fail('土地区块重复');
    chunks.add(key);
  }
  if (!chunks.has('0,0')) fail('缺少初始土地');
  const visited = new Set(['0,0']), queue = [{x: 0, y: 0}];
  for (let i = 0; i < queue.length; i++) {
    const chunk = queue[i];
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const x = chunk.x + dx, y = chunk.y + dy, key = cellKey(x, y);
      if (chunks.has(key) && !visited.has(key)) { visited.add(key); queue.push({x, y}); }
    }
  }
  if (visited.size !== chunks.size) fail('土地区块未连通');
  const hasCell = (x, y) => Number.isSafeInteger(x) && Number.isSafeInteger(y) && chunks.has(cellKey(Math.floor(x / BALANCE.chunkSize), Math.floor(y / BALANCE.chunkSize)));

  let totalXP = BALANCE.initial.xp, earnedBP = BALANCE.initial.bp;
  const eventIds = new Set();
  for (const event of world.efforts) {
    shape(event, ['id', 'source', 'minutes', 'occurredAt'], ['label']);
    if (typeof event.id !== 'string' || !event.id.trim() || event.id.length > BALANCE.effort.maxIdLength || eventIds.has(event.id)) fail('努力事件编号无效或重复');
    if (event.source !== 'simulation' || !Number.isSafeInteger(event.minutes) || event.minutes < BALANCE.effort.minMinutes || event.minutes > BALANCE.effort.maxMinutes || !validISO(event.occurredAt)) fail('努力事件内容无效');
    if (event.label !== undefined && (typeof event.label !== 'string' || event.label.length > BALANCE.effort.maxLabelLength)) fail('努力事件标签无效');
    eventIds.add(event.id);
    totalXP += event.minutes * BALANCE.effort.xpPerMinute;
    earnedBP += Math.floor(event.minutes / BALANCE.effort.minutesPerBP);
    if (!Number.isSafeInteger(totalXP) || !Number.isSafeInteger(earnedBP)) fail('努力事件资源溢出');
  }
  if (world.xp !== totalXP) fail('XP 与努力事件累计不一致');
  // Spending is irreversible and there is no trading/refund command. The save
  // format does not introduce a second economy ledger; at minimum it cannot
  // claim BP that was never issued by the initial gift or recorded events.
  if (world.bp > earnedBP) fail('BP 超过已获得资源');

  const suffixes = new Set();
  const identify = (item, prefix) => {
    if (typeof item.id !== 'string' || item.id.length > 19 || !new RegExp(`^${prefix}-[1-9]\\d*$`).test(item.id)) fail('对象 ID 格式无效');
    const suffix = Number(item.id.slice(2));
    if (!Number.isSafeInteger(suffix) || suffix >= world.nextId || suffixes.has(suffix)) fail('对象编号重复或未递增');
    suffixes.add(suffix);
    if (typeof item.asset !== 'string' || !Object.hasOwn(ASSETS, item.asset)) fail('对象素材未知');
  };
  const groundCells = item => {
    if (!hasCell(item.x, item.y)) fail('对象占地超出已开放土地');
    const cells = footprintCells(item.asset, item.x, item.y);
    if (cells.some(cell => !hasCell(cell.x, cell.y))) fail('对象占地超出已开放土地');
    return cells;
  };
  const occupied = new Set();
  for (const item of world.objects) {
    shape(item, ['id', 'asset', 'x', 'y', 'stored']);
    identify(item, 'o');
    if (typeof item.stored !== 'boolean') fail('人工对象收纳状态无效');
    if (item.stored) {
      if (item.x !== null || item.y !== null) fail('收纳对象的坐标必须为空');
      continue;
    }
    for (const cell of groundCells(item)) {
      const key = cellKey(cell.x, cell.y);
      if (occupied.has(key)) fail('人工对象占地重叠');
      occupied.add(key);
    }
  }

  const path = new Set();
  for (const cell of world.path) {
    shape(cell, ['x', 'y']);
    const key = cellKey(cell.x, cell.y);
    if (!hasCell(cell.x, cell.y) || path.has(key)) fail('道路坐标越界或重复');
    path.add(key);
  }
  const natureCells = new Set();
  for (const item of world.nature) {
    shape(item, ['id', 'asset', 'x', 'y', 'stage']);
    identify(item, 'n');
    if (typeof item.stage !== 'string' || !Object.hasOwn(BALANCE.ecology.stages, item.stage) || !BALANCE.ecology.stages[item.stage].includes(item.asset)) fail('自然对象阶段与素材不一致');
    for (const cell of groundCells(item)) {
      const key = cellKey(cell.x, cell.y);
      if (occupied.has(key) || path.has(key) || natureCells.has(key)) fail('自然占地与人工对象、道路或其他自然重叠');
      natureCells.add(key);
    }
  }
  return world;
}

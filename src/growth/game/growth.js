import {BALANCE} from './balance.js';
import {cellKey, footprintCells, hasWorldCell} from './spatial.js';

function validISO(value) {
  if (typeof value !== 'string' || value.length > BALANCE.effort.maxOccurredAtLength) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, zoneHour, zoneMinute] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || Number(zoneHour || 0) > 23 || Number(zoneMinute || 0) > 59) return false;
  const calendar = new Date(0);
  calendar.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  return calendar.getUTCFullYear() === Number(year) && calendar.getUTCMonth() === Number(month) - 1 && calendar.getUTCDate() === Number(day);
}

// Shared by commands and save validation, so a command cannot issue a reward
// for an event that would be rejected when that same world is re-opened.
export function validateEffortEvent(event) {
  const fail = message => { throw new Error(`模拟努力事件${message}，操作未改变世界。`); };
  if (!event || typeof event !== 'object' || Array.isArray(event) || ![Object.prototype, null].includes(Object.getPrototypeOf(event))) fail('格式不完整');
  const required = ['id', 'source', 'minutes', 'occurredAt'];
  const keys = Object.keys(event);
  if (keys.length > required.length + 1 || required.some(key => !Object.hasOwn(event, key)) || keys.some(key => !required.includes(key) && key !== 'label')) fail('字段格式不完整');
  if (typeof event.id !== 'string' || !event.id.trim() || event.id.length > BALANCE.effort.maxIdLength) fail('编号无效');
  if (event.source !== 'simulation') fail('来源必须是 simulation');
  if (!Number.isSafeInteger(event.minutes) || event.minutes < BALANCE.effort.minMinutes || event.minutes > BALANCE.effort.maxMinutes) fail(`分钟数须为 ${BALANCE.effort.minMinutes}..${BALANCE.effort.maxMinutes} 的整数`);
  if (!validISO(event.occurredAt)) fail('时间须为有效 ISO 日期时间');
  if (event.label !== undefined && (typeof event.label !== 'string' || event.label.length > BALANCE.effort.maxLabelLength)) fail('标签无效或过长');
  return event;
}

export function sameEffortContent(a, b) {
  return ['id', 'source', 'minutes', 'occurredAt', 'label'].every(key => a[key] === b[key]);
}

const coordinateOrder = (a, b) => a.y - b.y || a.x - b.x || (a.id || '').localeCompare(b.id || '');

function ecologyStep(world) {
  const blocked = new Set(world.path.map(cell => cellKey(cell.x, cell.y)));
  for (const object of world.objects) if (!object.stored) {
    for (const cell of footprintCells(object.asset, object.x, object.y)) blocked.add(cellKey(cell.x, cell.y));
  }
  const natureCells = new Set(world.nature.flatMap(item => footprintCells(item.asset, item.x, item.y)).map(cell => cellKey(cell.x, cell.y)));
  const available = (asset, x, y, ownCells = new Set()) => footprintCells(asset, x, y).every(cell => {
    const key = cellKey(cell.x, cell.y);
    return hasWorldCell(world, cell.x, cell.y) && !blocked.has(key) && (!natureCells.has(key) || ownCells.has(key));
  });
  const candidates = world.nature.filter(item => Object.hasOwn(BALANCE.ecology.upgrades, item.stage)).slice().sort(coordinateOrder);
  for (const candidate of candidates) {
    const upgrade = BALANCE.ecology.upgrades[candidate.stage];
    const ownCells = new Set(footprintCells(candidate.asset, candidate.x, candidate.y).map(cell => cellKey(cell.x, cell.y)));
    if (available(upgrade.asset, candidate.x, candidate.y, ownCells)) return {
      nature: world.nature.map(item => item.id === candidate.id ? {...item, ...upgrade} : item),
      nextId: world.nextId,
    };
  }

  // Enumerate only opened cells. Sorting the bounded sparse set yields one
  // stable y/x order even when chunks were acquired in a different order.
  const cells = world.chunks.flatMap(chunk => Array.from({length: BALANCE.chunkSize ** 2}, (_, index) => ({x: chunk.x * BALANCE.chunkSize + index % BALANCE.chunkSize, y: chunk.y * BALANCE.chunkSize + Math.floor(index / BALANCE.chunkSize)}))).sort(coordinateOrder);
  const cell = cells.find(item => available(BALANCE.ecology.seed.asset, item.x, item.y));
  if (!cell) return {nature: world.nature, nextId: world.nextId};
  if (world.nature.length >= BALANCE.limits.maxNature) throw new Error('自然对象已达数量上限，努力事件未提交。');
  if (world.nextId === Number.MAX_SAFE_INTEGER) throw new Error('自然对象编号已达安全整数上限，努力事件未提交。');
  return {nature: [...world.nature, {id: `n-${world.nextId}`, ...BALANCE.ecology.seed, x: cell.x, y: cell.y}], nextId: world.nextId + 1};
}

// The caller has validated the world and reward first. A blocked ecology step
// changes nothing; it is still consumed by the permanent XP boundary, rather
// than saved as debt that might replay on a later render or event retry.
export function growNatureForXP(world, nextXP) {
  if (!Number.isSafeInteger(nextXP) || nextXP < world.xp) throw new Error('成长 XP 必须是安全整数且不能降低。');
  const steps = Math.floor(nextXP / BALANCE.ecology.xpInterval) - Math.floor(world.xp / BALANCE.ecology.xpInterval);
  let patch = {nature: world.nature, nextId: world.nextId};
  for (let index = 0; index < steps; index++) patch = ecologyStep({...world, ...patch});
  return patch;
}

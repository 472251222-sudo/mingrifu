// Pure, deliberately small gameplay configuration. PNG metadata stays in the
// asset manifest; these dimensions describe occupied ground cells only.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const ASSETS = freeze({
  'cabin-terracotta': {id: 'cabin-terracotta', name: '暖木小屋', cost: 24, footprint: [3, 2], unlockXP: 0},
  'oak-broad': {id: 'oak-broad', name: '林缘阔冠树', cost: 10, footprint: [2, 2], unlockXP: 120},
  'pine-slender': {id: 'pine-slender', name: '高冠青杉', cost: 10, footprint: [1, 1], unlockXP: 300},
  'grass-tuft': {id: 'grass-tuft', name: '弯叶草丛', cost: 1, footprint: [1, 1], unlockXP: 0},
  wildflowers: {id: 'wildflowers', name: '暖色野花', cost: 2, footprint: [1, 1], unlockXP: 0},
  bush: {id: 'bush', name: '圆叶灌木', cost: 4, footprint: [1, 1], unlockXP: 0},
  rock: {id: 'rock', name: '苔色岩石', cost: 3, footprint: [1, 1], unlockXP: 0},
  'fence-horizontal': {id: 'fence-horizontal', name: '木栅栏·横向', cost: 3, footprint: [2, 1], unlockXP: 120},
  'fence-vertical': {id: 'fence-vertical', name: '木栅栏·纵向', cost: 3, footprint: [1, 2], unlockXP: 120},
  mailbox: {id: 'mailbox', name: '林间信箱', cost: 6, footprint: [1, 1], unlockXP: 120},
});

export const BALANCE = freeze({
  schemaVersion: 1,
  tileSize: 32,
  chunkSize: 8,
  expansion: {cost: 20, unlockXP: 120},
  effort: {minMinutes: 1, maxMinutes: 180, xpPerMinute: 1, minutesPerBP: 5, presets: [10, 25, 50], maxIdLength: 120, maxLabelLength: 80, maxOccurredAtLength: 40},
  ecology: {
    xpInterval: 50,
    stages: {young: ['grass-tuft'], bush: ['bush'], mature: ['oak-broad', 'pine-slender'], static: ['wildflowers']},
    upgrades: {young: {asset: 'bush', stage: 'bush'}, bush: {asset: 'oak-broad', stage: 'mature'}},
    seed: {asset: 'grass-tuft', stage: 'young'},
  },
  stages: [
    {id: 'sprout', name: '萌芽', unlockXP: 0, nextXP: 120},
    {id: 'rooted', name: '扎根', unlockXP: 120, nextXP: 300},
    {id: 'lush', name: '丰茂', unlockXP: 300, nextXP: null},
  ],
  // Limits bound malformed saves and later map growth without allocating a
  // rectangle spanning distant chunks. History is rejected at capacity, never
  // trimmed, so event deduplication remains trustworthy.
  limits: {maxChunkCoordinate: 64, maxChunks: 256, maxObjects: 4096, maxNature: 16384, maxEfforts: 10000, maxPathCells: 16384},
  initial: {
    revision: 0, nextId: 7, xp: 0, bp: 30,
    chunks: [{x: 0, y: 0}],
    efforts: [],
    objects: [{id: 'o-1', asset: 'cabin-terracotta', x: 2, y: 2, stored: false}],
    nature: [
      {id: 'n-2', asset: 'oak-broad', x: 0, y: 2, stage: 'mature'},
      {id: 'n-3', asset: 'pine-slender', x: 6, y: 3, stage: 'mature'},
      {id: 'n-4', asset: 'grass-tuft', x: 0, y: 6, stage: 'young'},
      {id: 'n-5', asset: 'grass-tuft', x: 6, y: 6, stage: 'young'},
      {id: 'n-6', asset: 'wildflowers', x: 2, y: 5, stage: 'static'},
    ],
    path: [{x: 3, y: 4}, {x: 3, y: 5}, {x: 3, y: 6}, {x: 3, y: 7}],
  },
});

export function stageForXP(xp) {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new Error('XP 必须是非负安全整数。');
  const stage = BALANCE.stages.findLast(item => xp >= item.unlockXP);
  return {...stage, xp};
}

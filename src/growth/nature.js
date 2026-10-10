import { allCells, cellKey, occupiedCells } from './grid.js';

export const NATURE_KINDS = ['fern', 'flower', 'bush', 'tree'];
export const NATURE_NAMES = { fern: '蕨叶', flower: '野花', bush: '灌木', tree: '幼树' };

export function initialNature() {
  return [
    { id: 'n-1', kind: 'tree', x: 0, y: 1, stage: 3 },
    { id: 'n-2', kind: 'tree', x: 7, y: 0, stage: 4 },
    { id: 'n-3', kind: 'bush', x: 6, y: 6, stage: 2 },
    { id: 'n-4', kind: 'flower', x: 1, y: 6, stage: 2 },
    { id: 'n-5', kind: 'fern', x: 6, y: 2, stage: 1 },
    { id: 'n-6', kind: 'tree', x: 7, y: 6, stage: 3 },
    { id: 'n-7', kind: 'bush', x: 0, y: 7, stage: 3 },
  ];
}

// Environmental changes only touch nature; building records never change.
export function growNature(world) {
  const occupied = occupiedCells(world);
  const candidates = world.nature.filter(n => n.stage < 5 && !occupied.has(cellKey(n.x, n.y)));
  if (candidates.length) {
    const chosen = candidates.slice(0, 3);
    const ids = new Set(chosen.map(n => n.id));
    return { nature: world.nature.map(n => ids.has(n.id) ? { ...n, stage: n.stage + 1 } : n), changedIds: [...ids], copy: `${chosen.map(n => NATURE_NAMES[n.kind]).join('、')}舒展了一些。` };
  }
  const existing = new Set(world.nature.map(n => cellKey(n.x, n.y)));
  const free = allCells(world).filter(c => !occupied.has(cellKey(c.x, c.y)) && !existing.has(cellKey(c.x, c.y)));
  if (!free.length) throw new Error('土地已经很充实了。扩张一块新土地，再看看自然的变化。');
  const cell = free[(world.growth.step * 7) % free.length];
  const kind = NATURE_KINDS[world.growth.step % NATURE_KINDS.length];
  const plant = { id: `n-${world.nextId}`, kind, ...cell, stage: 1 };
  return { nature: [...world.nature, plant], changedIds: [plant.id], copy: `空地上长出了一点新的${NATURE_NAMES[kind]}。`, added: true };
}

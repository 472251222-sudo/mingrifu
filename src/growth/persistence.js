import { createWorld, validateWorld } from './world.js';

export const STORAGE_KEY = 'mingrifu-growth-world-p1-v1';
export function loadWorld(storage) {
  const token = storage.getItem(STORAGE_KEY);
  if (token === null) return { world: createWorld(), token };
  let world;
  try { world = JSON.parse(token); } catch { throw new Error('世界存档无法读取，原存档已保留。请恢复正确存档后重新读取。'); }
  return { world: validateWorld(world), token };
}
export function saveWorld(storage, world, expectedToken) {
  validateWorld(world);
  if (storage.getItem(STORAGE_KEY) !== expectedToken) throw new Error('另一页面已更新这个世界。请重新读取，再继续操作。');
  const token = JSON.stringify(world);
  storage.setItem(STORAGE_KEY, token);
  return token;
}

// P1 has no prices, rewards, goal IDs, or task dependencies.
export const BUILDINGS = {
  cottage: { name: '林间小屋', width: 2, height: 2, sprite: 'city:house:5', description: '一扇暖暖的窗，安放日常。' },
  library: { name: '小小书屋', width: 2, height: 2, sprite: 'city:book:5', description: '给阅读和灵感留一个角落。' },
  cafe: { name: '街角茶屋', width: 2, height: 2, sprite: 'city:cafe:5', description: '坐下来，让时间慢一点。' },
  bench: { name: '木质长椅', width: 2, height: 1, sprite: 'city:bench:5', description: '在喜欢的风景里歇一会儿。' },
};

export function buildingConfig(type) {
  if (!Object.hasOwn(BUILDINGS, type)) throw new Error('这类建筑暂不可用。');
  return BUILDINGS[type];
}

import { project, TILE_WIDTH, TILE_HEIGHT } from './view.js';

// Rasterize at logical pixel resolution; never smooth polygons or atlas images.
export function pixelPolygon(context, vertices, color) {
  context.fillStyle = color;
  const points = vertices.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const start = Math.max(0, Math.min(...points.map(p => p.y))), end = Math.min(context.canvas.height - 1, Math.max(...points.map(p => p.y)));
  for (let y = start; y <= end; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a.y <= y + .5 && b.y > y + .5) || (b.y <= y + .5 && a.y > y + .5)) xs.push(a.x + (y + .5 - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const left = Math.max(0, Math.ceil(xs[i])), right = Math.min(context.canvas.width, Math.ceil(xs[i + 1]));
      if (right > left) context.fillRect(left, y, right - left, 1);
    }
  }
}
export function pixelLine(context, a, b, color) {
  let x = Math.round(a.x), y = Math.round(a.y);
  const tx = Math.round(b.x), ty = Math.round(b.y), dx = Math.abs(tx - x), dy = -Math.abs(ty - y), sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
  let error = dx + dy; context.fillStyle = color;
  while (true) {
    context.fillRect(x, y, 1, 1);
    if (x === tx && y === ty) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}
const buildings = new Map(), tiles = new Map();
function bitmap(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}
const PALETTES = {
  cottage: { wall: '#ead5aa', shade: '#bea57d', roof: '#b27159', roofDark: '#865a4d', trim: '#695545', glow: '#e9bc69' },
  library: { wall: '#e5dbc4', shade: '#b6baa3', roof: '#6c8c8a', roofDark: '#496b70', trim: '#62634f', glow: '#dcc99a' },
  cafe: { wall: '#eee0b8', shade: '#c3ac82', roof: '#9c7054', roofDark: '#705e49', trim: '#695443', glow: '#e5bb79' },
};
export function buildingBitmap(type, legacy = false) {
  const key = `${type}:${legacy}`;
  if (buildings.has(key)) return buildings.get(key);
  const canvas = bitmap(80, 80), context = canvas.getContext('2d');
  const p = (x, y, z = 0) => { const point = project(x, y); return { x: point.x + 40, y: point.y + 40 - z }; };
  const poly = (points, color) => pixelPolygon(context, points, color);
  const line = (a, b, color) => pixelLine(context, a, b, color);
  const rect = (x, y, w, h, color) => { context.fillStyle = color; context.fillRect(Math.round(x), Math.round(y), w, h); };
  if (type === 'bench') {
    const leg = (x, y) => poly([p(x, y, 0), p(x + .12, y, 0), p(x + .12, y, 6), p(x, y, 6)], '#655c48');
    leg(.2, .3); leg(1.7, .3); leg(.2, .8); leg(1.7, .8);
    for (let i = 0; i < 3; i++) poly([p(.1, .25 + i * .2, 6), p(1.9, .25 + i * .2, 6), p(1.9, .4 + i * .2, 6), p(.1, .4 + i * .2, 6)], i % 2 ? '#b58e61' : '#c9a477');
    for (let i = 0; i < 2; i++) poly([p(.1, .2, 9 + i * 3), p(1.9, .2, 9 + i * 3), p(1.9, .2, 11 + i * 3), p(.1, .2, 11 + i * 3)], '#b48b61');
    line(p(.1, .2, 14), p(1.9, .2, 14), '#dbc29a');
  } else {
    const c = PALETTES[type] || PALETTES.cottage;
    poly([p(.12, .12), p(1.88, .12), p(1.88, 1.88), p(.12, 1.88)], '#c6bb96');
    poly([p(1.8, .2), p(1.8, 1.8), p(1.8, 1.8, 19), p(1.8, .2, 19)], c.shade);
    poly([p(.2, 1.8), p(1.8, 1.8), p(1.8, 1.8, 19), p(.2, 1.8, 19)], c.wall);
    line(p(1.8, .2), p(1.8, 1.8), c.trim); line(p(.2, 1.8), p(1.8, 1.8), c.trim);
    line(p(1.8, 1.8), p(1.8, 1.8, 19), c.trim);
    const window = (axis, a, b, z0, z1) => {
      const q = (value, z) => axis === 'front' ? p(value, 1.81, z) : p(1.81, value, z);
      poly([q(a, z0), q(b, z0), q(b, z1), q(a, z1)], c.trim);
      poly([q(a + .08, z0 + 1), q(b - .08, z0 + 1), q(b - .08, z1 - 1), q(a + .08, z1 - 1)], c.glow);
      line(q((a + b) / 2, z0 + 1), q((a + b) / 2, z1 - 1), c.trim);
      line(q(a + .08, (z0 + z1) / 2), q(b - .08, (z0 + z1) / 2), c.trim);
    };
    window('front', .3, .8, 6, 14); window('side', .45, 1.2, 6, 14);
    poly([p(1.02, 1.81), p(1.55, 1.81), p(1.55, 1.81, 13), p(1.02, 1.81, 13)], c.trim);
    poly([p(1.1, 1.82, 1), p(1.47, 1.82, 1), p(1.47, 1.82, 12), p(1.1, 1.82, 12)], '#9b7a54');
    const knob = p(1.4, 1.83, 6); rect(knob.x, knob.y, 1, 1, '#ecd5a4');
    poly([p(.94, 1.8), p(1.63, 1.8), p(1.63, 2.04), p(.94, 2.04)], '#d0c3a2');
    // Both roof slopes use the exact same ground axes as the footprint.
    const a = p(.08, .08, 20), b = p(1.92, .08, 20), d = p(.08, 1.92, 20), e = p(1.92, 1.92, 20);
    const r1 = p(.08, 1, 31), r2 = p(1.92, 1, 31);
    if (!legacy) {
      // Close both gable ends before the roof. This is a structural repair,
      // independent of the candidate art direction in the sample scene.
      poly([p(.2, .2, 19), p(.2, 1.8, 19), p(.2, 1, 31)], c.wall);
      poly([p(1.8, .2, 19), p(1.8, 1.8, 19), p(1.8, 1, 31)], c.shade);
    }
    poly([a, b, r2, r1], c.roof); poly([r1, r2, e, d], c.roofDark);
    for (let i = 1; i < 5; i++) {
      const t = i / 5, lerp = (u, v) => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
      line(lerp(a, r1), lerp(b, r2), '#c18f6b'); line(lerp(r1, d), lerp(r2, e), type === 'library' ? '#698582' : '#947259');
    }
    line(a, b, '#e0b78d'); line(r1, r2, type === 'library' ? '#97aaa1' : '#d2a175'); line(d, e, '#5f5946');
    // Raised chimney, books and striped awning distinguish the temporary houses.
    const chimney = p(.6, .45, 25);
    rect(chimney.x - 2, chimney.y - 9, 4, 9, '#8f7660'); rect(chimney.x - 3, chimney.y - 10, 6, 2, '#c3ad87');
    rect(chimney.x, chimney.y - 7, 1, 5, '#b09a7d');
    if (type === 'library') {
      for (let i = 0; i < 4; i++) { const book = p(.35 + i * .1, 1.83, 8); rect(book.x, book.y - 1, 1, 3, ['#788e90', '#b97764', '#e4cc8f', '#84976e'][i]); }
      poly([p(.25, 1.83, 15), p(.85, 1.83, 15), p(.85, 1.83, 18), p(.25, 1.83, 18)], '#e0d4af');
      line(p(.55, 1.84, 15), p(.55, 1.84, 18), '#6b7969');
    } else if (type === 'cafe') {
      for (let i = 0; i < 6; i++) {
        const x = .18 + i * .27;
        poly([p(x, 1.8, 16), p(x + .27, 1.8, 16), p(x + .27, 2.12, 13), p(x, 2.12, 13)], i % 2 ? '#e8d6ae' : '#83946e');
      }
      line(p(.18, 2.12, 13), p(1.8, 2.12, 13), '#61735a');
    } else {
      const box = p(.55, 1.9, 5); rect(box.x - 3, box.y, 6, 2, '#977451');
      rect(box.x - 2, box.y - 2, 5, 2, '#7d9663'); rect(box.x - 1, box.y - 3, 1, 1, '#d8b17c'); rect(box.x + 2, box.y - 3, 1, 1, '#b98472');
    }
  }
  buildings.set(key, canvas); return canvas;
}
export function groundBitmap(variant, edgeMask, grid) {
  const key = `${variant}:${edgeMask}:${grid}`;
  if (tiles.has(key)) return tiles.get(key);
  const canvas = bitmap(TILE_WIDTH + 1, TILE_HEIGHT + 4), context = canvas.getContext('2d');
  const a = { x: TILE_WIDTH / 2, y: 0 }, b = { x: TILE_WIDTH, y: TILE_HEIGHT / 2 }, c = { x: TILE_WIDTH / 2, y: TILE_HEIGHT }, d = { x: 0, y: TILE_HEIGHT / 2 };
  const lower = p => ({ x: p.x, y: p.y + 3 });
  if (edgeMask & 1) pixelPolygon(context, [b, c, lower(c), lower(b)], '#849573');
  if (edgeMask & 2) pixelPolygon(context, [c, d, lower(d), lower(c)], '#97a17c');
  pixelPolygon(context, [a, b, c, d], ['#a8bd87', '#adc08d', '#aabd89', '#afc18d'][variant % 4]);
  context.fillStyle = '#91aa75'; context.fillRect(9 + variant % 5, 6 + variant % 3, 1, 2); context.fillRect(13 + variant % 3, 8, 1, 1);
  if (variant % 3 === 0) { context.fillStyle = '#c4cf9f'; context.fillRect(14, 9, 2, 1); }
  if (edgeMask & 4) pixelLine(context, a, d, '#c7c9a0');
  if (edgeMask & 8) pixelLine(context, a, b, '#d0ceaa');
  if (grid) { pixelLine(context, a, b, '#9aaf7f'); pixelLine(context, a, d, '#9aaf7f'); }
  tiles.set(key, canvas); return canvas;
}

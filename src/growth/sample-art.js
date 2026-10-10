import { project, TILE_WIDTH, TILE_HEIGHT } from './view.js';
import { pixelLine, pixelPolygon } from './isometric-art.js';

// Original Canvas pixel artwork for one candidate scene only. Logical pixels
// use the existing 24 × 12 ground diamond; light comes from the upper left.
const cache = new Map();
const colors = { outline: '#514e3c', wood: '#c9a573', woodShade: '#a48055', roof: '#bb815e', roofShade: '#92644c', grass: '#a8b985' };
const bitmap = (width, height) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; };
export function cabinBitmap() {
  if (cache.has('cabin')) return cache.get('cabin');
  const canvas = bitmap(80, 80), ctx = canvas.getContext('2d');
  const p = (x, y, z = 0) => { const v = project(x, y); return { x: v.x + 40, y: v.y + 40 - z }; };
  const poly = (points, fill, edge) => { pixelPolygon(ctx, points, fill); if (edge) for (let i = 0; i < points.length; i++) pixelLine(ctx, points[i], points[(i + 1) % points.length], edge); };
  const line = (a, b, c) => pixelLine(ctx, a, b, c);
  // Ground plinth, two solid walls and the visible triangular gable.
  poly([p(.14, .14), p(1.86, .14), p(1.86, 1.86), p(.14, 1.86)], '#b5ae87', '#91886b');
  poly([p(1.78, .22), p(1.78, 1.78), p(1.78, 1.78, 18), p(1.78, .22, 18)], colors.woodShade, colors.outline);
  poly([p(.22, 1.78), p(1.78, 1.78), p(1.78, 1.78, 18), p(.22, 1.78, 18)], colors.wood, colors.outline);
  poly([p(1.78, .22, 18), p(1.78, 1.78, 18), p(1.78, 1, 29)], '#b59161', colors.outline);
  poly([p(.22, .22, 18), p(.22, 1.78, 18), p(.22, 1, 29)], colors.wood, colors.outline);
  for (let z = 3; z < 18; z += 4) {
    line(p(.25, 1.79, z), p(1.75, 1.79, z), '#af8b5e');
    line(p(1.79, .25, z), p(1.79, 1.75, z), '#8f714d');
    line(p(.28, 1.79, z + 1), p(1.72, 1.79, z + 1), '#d6b483');
  }
  for (let z = 20; z <= 25; z += 3) {
    const half = (29 - z) / 11 * .78;
    line(p(1.79, 1 - half, z), p(1.79, 1 + half, z), '#9c7b51');
  }
  // A warm divided window on each face, and a proper framed door.
  const window = (front, a, b) => {
    const q = (v, z) => front ? p(v, 1.8, z) : p(1.8, v, z);
    poly([q(a, 7), q(b, 7), q(b, 14), q(a, 14)], colors.outline);
    poly([q(a + .08, 8), q(b - .08, 8), q(b - .08, 13), q(a + .08, 13)], '#edc482');
    line(q((a + b) / 2, 8), q((a + b) / 2, 13), '#796647');
    line(q(a + .08, 10), q(b - .08, 10), '#796647');
    line(q(a - .04, 6), q(b + .04, 6), '#786247');
  };
  window(true, .34, .84); window(false, .6, 1.28);
  poly([p(1.04, 1.8), p(1.58, 1.8), p(1.58, 1.8, 14), p(1.04, 1.8, 14)], colors.outline);
  poly([p(1.12, 1.81, 1), p(1.5, 1.81, 1), p(1.5, 1.81, 13), p(1.12, 1.81, 13)], '#98714e');
  line(p(1.3, 1.82, 2), p(1.3, 1.82, 11), '#795d43');
  const knob = p(1.43, 1.83, 7); ctx.fillStyle = '#e9cf95'; ctx.fillRect(Math.round(knob.x), Math.round(knob.y), 1, 1);
  poly([p(.97, 1.82), p(1.65, 1.82), p(1.65, 2.05), p(.97, 2.05)], '#c5baa0', '#8a8167');
  // Roof overhang encloses the wall/gable silhouette, with no grass-filled gap.
  const a = p(.1, .1, 19), b = p(1.9, .1, 19), c = p(1.9, 1.9, 19), d = p(.1, 1.9, 19), r = p(.1, 1, 30), s = p(1.9, 1, 30);
  poly([a, b, s, r], colors.roof, colors.outline); poly([r, s, c, d], colors.roofShade, colors.outline);
  const blend = (u, v, t) => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
  for (let i = 1; i < 4; i++) {
    line(blend(a, r, i / 4), blend(b, s, i / 4), '#cb9870');
    line(blend(r, d, i / 4), blend(s, c, i / 4), '#a47856');
  }
  for (let i = 1; i < 6; i++) {
    const t = i / 6, row = i % 3;
    line(blend(blend(r, s, t), blend(d, c, t), row / 4), blend(blend(r, s, t), blend(d, c, t), (row + 1) / 4), '#795840');
  }
  line(r, s, '#dbad7f'); line(a, b, '#d5a474'); line(d, c, '#614d3b');
  // A small squared chimney belongs to the same pixel scale.
  const ch = p(.65, .45, 26); ctx.fillStyle = '#786d59'; ctx.fillRect(Math.round(ch.x - 2), Math.round(ch.y - 8), 4, 8);
  ctx.fillStyle = '#ad9b79'; ctx.fillRect(Math.round(ch.x - 3), Math.round(ch.y - 9), 6, 2);
  ctx.fillStyle = '#c4b294'; ctx.fillRect(Math.round(ch.x - 2), Math.round(ch.y - 7), 1, 6);
  cache.set('cabin', canvas); return canvas;
}
export function treeBitmap() {
  if (cache.has('tree')) return cache.get('tree');
  const canvas = bitmap(64, 64), ctx = canvas.getContext('2d');
  const poly = (points, color) => pixelPolygon(ctx, points.map(([x, y]) => ({ x, y })), color);
  // Upright trunk with a projected root base; rounded crown has lit upper-left
  // planes and darker lower-right planes, not a second ground projection.
  poly([[29, 51], [34, 49], [39, 52], [33, 55], [25, 53]], '#807350');
  poly([[30, 34], [35, 34], [35, 52], [30, 54]], '#826644');
  ctx.fillStyle = '#b39465'; ctx.fillRect(31, 35, 1, 17);
  poly([[33, 42], [33, 38], [41, 32], [41, 36]], '#826644');
  poly([[18, 31], [15, 27], [16, 21], [21, 17], [24, 10], [31, 7], [38, 8], [43, 13], [47, 16], [49, 22], [48, 29], [42, 34], [31, 36], [24, 34]], colors.outline);
  poly([[19, 30], [16, 26], [17, 22], [22, 18], [25, 11], [31, 8], [37, 9], [42, 14], [46, 17], [48, 23], [47, 28], [41, 33], [31, 35], [24, 33]], '#688653');
  poly([[19, 25], [21, 21], [26, 20], [27, 14], [32, 11], [37, 12], [40, 16], [38, 21], [29, 22], [26, 28], [22, 28]], '#8fa770');
  poly([[29, 15], [32, 12], [36, 13], [36, 16], [32, 17]], '#b0bd88');
  poly([[20, 24], [23, 21], [27, 21], [26, 24], [23, 26]], '#a8b781');
  poly([[38, 23], [44, 21], [46, 25], [42, 28], [36, 29]], '#7e9861');
  poly([[27, 29], [32, 26], [36, 27], [34, 31], [29, 32]], '#78955e');
  cache.set('tree', canvas); return canvas;
}
export function sampleGroundBitmap(x, y, edgeMask, grid) {
  // Texture placement uses global cell coordinates, so chunk seams share the
  // same base and are never outlined as separate internal shores.
  const variant = ((Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663)) >>> 0) % 8;
  const key = `grass:${variant}:${edgeMask}:${grid}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = bitmap(TILE_WIDTH + 1, TILE_HEIGHT + 4), ctx = canvas.getContext('2d');
  const a = { x: 12, y: 0 }, b = { x: 24, y: 6 }, c = { x: 12, y: 12 }, d = { x: 0, y: 6 }, lower = v => ({ x: v.x, y: v.y + 3 });
  if (edgeMask & 1) pixelPolygon(ctx, [b, c, lower(c), lower(b)], '#7d8e65');
  if (edgeMask & 2) pixelPolygon(ctx, [c, d, lower(d), lower(c)], '#909b70');
  pixelPolygon(ctx, [a, b, c, d], colors.grass);
  const patches = [[[7, 5], [11, 3], [15, 5], [11, 7]], [[10, 8], [14, 6], [18, 8], [14, 10]]];
  pixelPolygon(ctx, patches[variant % 2].map(([px, py]) => ({ x: px, y: py })), variant < 4 ? '#aebc89' : '#a1b380');
  ctx.fillStyle = '#8da371'; ctx.fillRect(7 + variant, 6, 1, 1); ctx.fillRect(11 + variant % 4, 8, 1, 1);
  if (variant === 3) { ctx.fillStyle = '#c6ca99'; ctx.fillRect(13, 5, 1, 1); }
  if (edgeMask & 4) pixelLine(ctx, a, d, '#bfca97');
  if (edgeMask & 8) pixelLine(ctx, a, b, '#c3cd9b');
  if (grid) { pixelLine(ctx, a, b, '#96ab79'); pixelLine(ctx, a, d, '#96ab79'); }
  cache.set(key, canvas); return canvas;
}

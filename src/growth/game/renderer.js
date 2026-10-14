import {drawWorld} from '../homestead/renderer.js';
import {objectOrder} from '../homestead/world.js';
import {cameraOrigin, hitScene, projectObject, screenToWorld, spriteRect} from './scene.js';

const hitContexts = new WeakMap();

export function hitScreenScene(scene, point, resources, camera, width, height) {
  const px = Math.floor(point.x), py = Math.floor(point.y);
  if (px < 0 || py < 0 || px >= width || py >= height) return null;
  let context = hitContexts.get(resources);
  if (!context) {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    context = canvas.getContext('2d', {willReadFrequently: true});
    context.imageSmoothingEnabled = false;
    hitContexts.set(resources, context);
  }
  const origin = cameraOrigin(camera, width, height);
  return hitScene(scene, screenToWorld(point, camera, width, height), resources.masks, object => {
    const [x, y, w, h] = spriteRect(object), scale = camera.scale;
    // Coarse screen bounds only prune impossible objects; Canvas determines
    // actual visible alpha, including downsampled and fractional pointer cases.
    if (px < Math.floor(origin[0] + x * scale) || px >= Math.ceil(origin[0] + (x + w) * scale) || py < Math.floor(origin[1] + y * scale) || py >= Math.ceil(origin[1] + (y + h) * scale)) return false;
    context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, 1, 1);
    // Translate by whole device pixels so the 1px probe has precisely the
    // same raster grid and nearest-neighbour sampling as the visible canvas.
    context.setTransform(scale, 0, 0, scale, origin[0] - px, origin[1] - py);
    context.drawImage(resources.images.get(object.assetId), x, y);
    return context.getImageData(0, 0, 1, 1).data[3] > 0;
  });
}

export function externalOutline({width, height, alpha}) {
  const stride = width + 2, total = stride * (height + 2), outside = new Uint8Array(total), queue = [0];
  const opaque = (x, y) => x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x] > 0;
  outside[0] = 1;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % stride, y = Math.floor(index / stride);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy, next = ny * stride + nx;
      if (nx < 0 || ny < 0 || nx >= stride || ny >= height + 2 || outside[next] || opaque(nx - 1, ny - 1)) continue;
      outside[next] = 1; queue.push(next);
    }
  }
  return queue.map(index => [index % stride - 1, Math.floor(index / stride) - 1]).filter(([x, y]) => [[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy]) => opaque(x + dx, y + dy)));
}

export function createSpriteMasks(resources) {
  const masks = new Map();
  for (const asset of resources.manifest.assets) {
    const [width, height] = asset.nativeSize, canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(resources.images.get(asset.id), 0, 0);
    const rgba = context.getImageData(0, 0, width, height).data, alpha = Uint8Array.from({length: width * height}, (_, index) => rgba[index * 4 + 3]);
    const mask = {width, height, alpha};
    masks.set(asset.id, {...mask, outline: externalOutline(mask)});
  }
  return masks;
}

export function composeRenderObjects(scene, preview) {
  let objects = scene.objects;
  if (preview && Number.isInteger(preview.x) && Number.isInteger(preview.y)) {
    if (preview.type !== 'build') objects = objects.filter(object => object.id !== preview.id);
    objects = [...objects, {...projectObject({id: preview.id || '~preview', assetId: preview.assetId, x: preview.x, y: preview.y}, scene.assets), preview: true}];
  }
  return objectOrder(objects);
}

export function paintGame(context, scene, resources, camera, width, height, {preview = null, placement = null, selectedId = null} = {}) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#e8e7d3'; context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  const origin = cameraOrigin(camera, width, height);
  context.save(); context.translate(...origin); context.scale(camera.scale, camera.scale);
  drawWorld(context, {...scene, objects: []}, resources);
  if (preview && Number.isInteger(preview.x) && Number.isInteger(preview.y)) {
    const asset = scene.assets.get(preview.assetId), [w, h] = asset.footprint;
    context.fillStyle = placement?.ok ? 'rgba(70,119,71,.35)' : 'rgba(173,63,48,.35)';
    context.fillRect(preview.x * 32, preview.y * 32, w * 32, h * 32);
    context.strokeStyle = placement?.ok ? '#3b6550' : '#995347'; context.lineWidth = 1;
    context.strokeRect(preview.x * 32 + .5, preview.y * 32 + .5, w * 32 - 1, h * 32 - 1);
  }
  for (const object of composeRenderObjects(scene, preview)) {
    if (object.preview || object.id === selectedId) {
      const [x, y] = spriteRect(object);
      context.fillStyle = object.preview ? placement?.ok ? '#cadb8c' : '#df9c6b' : '#fff1d2';
      for (const [dx, dy] of resources.masks.get(object.assetId).outline) context.fillRect(x + dx, y + dy, 1, 1);
    }
    context.globalAlpha = object.preview ? .7 : 1;
    drawWorld(context, {tiles: [], objects: [object]}, resources);
    context.globalAlpha = 1;
  }
  context.restore();
  return origin;
}

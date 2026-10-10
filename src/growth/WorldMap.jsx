import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { constrainCamera, fitCamera, project, screenCell, stepZoom, viewOrigin, zoomLevels, TILE_WIDTH, TILE_HEIGHT } from './view.js';
import { hitTestScene } from './scene.js';
import { paintMap } from './renderer.js';

export const WorldMap = forwardRef(function WorldMap({ world, assets, preview, expansion, grid, selectedId, changedIds, movingId, onCell, onHover, onConfirm, onCancel, onViewChange, expansionCandidates, art }, ref) {
  const host = useRef(), canvas = useRef(), gesture = useRef(null), fitMode = useRef(true), fitCandidate = useRef();
  const [size, setSize] = useState({ width: 600, height: 500 });
  const [camera, setCamera] = useState(() => fitCamera(world, { width: 600, height: 500 }));
  const levels = zoomLevels(world, size, expansion);
  const fit = candidate => {
    fitMode.current = true; fitCandidate.current = candidate;
    setCamera(fitCamera(world, size, candidate));
  };
  useImperativeHandle(ref, () => ({
    fit,
    buildView: position => {
      fitMode.current = false;
      setCamera(c => {
        const point = position ? project(position.x + 1, position.y + 1) : { x: c.centerX, y: c.centerY };
        return constrainCamera({ centerX: point.x, centerY: point.y, scale: Math.max(2, c.scale) }, world, size);
      });
    },
    zoom: amount => { fitMode.current = false; setCamera(c => constrainCamera({ ...c, scale: stepZoom(c.scale, amount, levels) }, world, size, expansionCandidates)); },
    pan: (x, y) => { fitMode.current = false; const delta = project(x, y); setCamera(c => constrainCamera({ ...c, centerX: c.centerX + delta.x, centerY: c.centerY + delta.y }, world, size, expansionCandidates)); },
  }));
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setSize({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!expansionCandidates?.length) fitCandidate.current = undefined;
    if (fitMode.current) setCamera(fitCamera(world, size, fitCandidate.current));
    else setCamera(c => constrainCamera(c, world, size, expansionCandidates));
  }, [size.width, size.height, world.chunks, !!expansionCandidates]);
  useEffect(() => { onViewChange?.({ scale: camera.scale, min: levels[0], max: levels.at(-1) }); }, [camera.scale, levels[0], levels.at(-1), onViewChange]);
  const { width, height } = size, origin = viewOrigin(camera, size);
  useEffect(() => {
    paintMap(canvas.current.getContext('2d'), world, assets, { width, height, ...camera }, { grid, preview, expansion, expansionCandidates, selectedId, changedIds, movingId, art });
  }, [world, assets, camera, width, height, grid, preview, expansion, selectedId, changedIds, movingId, expansionCandidates, art]);
  const pointAt = event => {
    const rect = canvas.current.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
  };
  const cellAt = event => { const point = pointAt(event); return screenCell(point.x, point.y, camera, size); };
  const down = event => {
    if (event.button !== 0 || gesture.current) return;
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = event => {
    const g = gesture.current;
    if (g && event.pointerId === g.pointerId) {
      const dx = event.clientX - g.x, dy = event.clientY - g.y;
      if (Math.hypot(dx, dy) > 7) g.moved = true;
      if (g.moved) {
        fitMode.current = false;
        setCamera(constrainCamera({ ...g.camera, centerX: g.camera.centerX - dx / g.camera.scale, centerY: g.camera.centerY - dy / g.camera.scale }, world, size, expansionCandidates, true));
      }
    } else if (event.pointerType === 'mouse') onHover(cellAt(event));
  };
  const up = event => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    gesture.current = null;
    if (!g.moved) {
      const point = pointAt(event);
      onCell(cellAt(event), hitTestScene(world, assets, { ...camera, ...size }, point.x, point.y, { art })?.id || null);
    } else setCamera(c => constrainCamera(c, world, size, expansionCandidates));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="gw-map-host" ref={host}>
    <canvas ref={canvas} width={width} height={height} style={{ width, height }}
      data-origin-x={origin.x} data-origin-y={origin.y} data-tile-width={TILE_WIDTH} data-tile-height={TILE_HEIGHT} data-pixel-scale={camera.scale}
      aria-label="成长世界地图：点击网格选择位置，拖动平移；方向键调整位置，回车确认，Escape 取消" tabIndex={0}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gesture.current = null; }}
      onKeyDown={event => {
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (directions[event.key]) {
          event.preventDefault(); const [x, y] = directions[event.key];
          if (preview) onCell({ x: preview.x + x, y: preview.y + y });
          else { fitMode.current = false; const delta = project(x, y); setCamera(c => constrainCamera({ ...c, centerX: c.centerX + delta.x, centerY: c.centerY + delta.y }, world, size, expansionCandidates)); }
        }
        if (event.key === 'Enter' && preview) { event.preventDefault(); onConfirm(); }
        if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
      }} />
    <div className="gw-map-compass" aria-hidden="true"><span>N</span>↗</div>
    <div className="gw-map-tag">{world.chunks.length === 1 ? '初始林地 · 8 × 8' : `${world.chunks.length} 块相连土地`}<span>每一格，都可以有自己的安排</span></div>
  </div>;
});

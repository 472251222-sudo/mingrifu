import React, {useEffect, useMemo, useRef, useState} from 'react';
import {cameraOrigin, constrainSceneCamera, fitSceneCamera, screenToCell, withExpansionBounds, worldToScene, zoomSceneCamera, ZOOMS} from './scene.js';
import {hitScreenScene, paintGame} from './renderer.js';
import {BALANCE} from './balance.js';

export default function WorldCanvas({world, resources, preview, placement, selectedId, onCell, onSelect, onConfirm, onCancel, expansionCandidates = [], overviewToken = 0}) {
  const baseScene = useMemo(() => worldToScene(world, resources.manifest), [world, resources]);
  const expand = preview?.type === 'expand';
  const scene = useMemo(() => expand ? withExpansionBounds(baseScene, Number.isInteger(preview.x) ? [{x: preview.x, y: preview.y}] : expansionCandidates) : baseScene, [baseScene, expand, expand ? preview.x : null, expand ? preview.y : null, expansionCandidates]);
  const [size, setSize] = useState({width: 1, height: 1}), [camera, setCamera] = useState(null);
  const host = useRef(null), canvas = useRef(null), gesture = useRef(null);
  const latest = useRef({camera, scene, size}); latest.current = {camera, scene, size};
  useEffect(() => {
    const update = () => {const bounds = host.current.getBoundingClientRect(); setSize({width: Math.max(1, Math.floor(bounds.width)), height: Math.max(1, Math.floor(bounds.height))});};
    const observer = new ResizeObserver(update); observer.observe(host.current); update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {setCamera(fitSceneCamera(scene, size.width, size.height));}, [size.width, size.height]);
  useEffect(() => {setCamera(fitSceneCamera(scene, size.width, size.height));}, [overviewToken, expand, expand ? preview.x : null, expand ? preview.y : null]);
  useEffect(() => {setCamera(current => current ? constrainSceneCamera(current, scene, size.width, size.height) : fitSceneCamera(scene, size.width, size.height));}, [scene]);
  useEffect(() => {
    if (!camera || !canvas.current) return;
    const element = canvas.current; element.width = size.width; element.height = size.height;
    paintGame(element.getContext('2d'), scene, resources, camera, size.width, size.height, {preview, placement, selectedId, expansionCandidates});
  }, [scene, resources, camera, size, preview, placement, selectedId]);
  useEffect(() => {if (preview) canvas.current?.focus({preventScroll: true});}, [preview?.type, preview?.id, preview?.assetId]);
  useEffect(() => {
    const element = canvas.current;
    const wheel = event => {
      event.preventDefault();
      const {camera, scene, size} = latest.current; if (!camera || event.deltaY === 0) return;
      const bounds = element.getBoundingClientRect(), point = {x: (event.clientX - bounds.left) * size.width / bounds.width, y: (event.clientY - bounds.top) * size.height / bounds.height};
      setCamera(zoomSceneCamera(camera, event.deltaY < 0 ? 1 : -1, scene, size.width, size.height, point));
    };
    element.addEventListener('wheel', wheel, {passive: false});
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const pointOf = event => {const bounds = canvas.current.getBoundingClientRect(); return {x: (event.clientX - bounds.left) * size.width / bounds.width, y: (event.clientY - bounds.top) * size.height / bounds.height};};
  const pan = event => {
    const start = gesture.current; if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.dragged && Math.hypot(dx, dy) <= 6) return;
    start.dragged = true;
    setCamera(constrainSceneCamera({...start.camera, x: start.camera.x - dx / start.camera.scale, y: start.camera.y - dy / start.camera.scale}, scene, size.width, size.height));
  };
  const release = (event, cancelled = false) => {
    const start = gesture.current; if (!start || start.id !== event.pointerId) return;
    const dragged = start.dragged || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled || dragged || !camera) return;
    const point = pointOf(event);
    if (preview) onCell(screenToCell(point, camera, size.width, size.height));
    else onSelect(hitScreenScene(scene, point, resources, camera, size.width, size.height));
  };
  const keys = event => {
    if (event.key === 'Escape') {event.preventDefault(); onCancel(); return;}
    if (event.key === 'Enter' && preview) {event.preventDefault(); onConfirm(); return;}
    const direction = {ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1]}[event.key];
    if (!direction || !camera) return;
    event.preventDefault();
    if (expand) {const side = BALANCE.chunkSize; onCell({x: ((preview.x ?? Math.floor(camera.x / (side * 32))) + direction[0]) * side + side / 2, y: ((preview.y ?? Math.floor(camera.y / (side * 32))) + direction[1]) * side + side / 2});}
    else if (preview) onCell({x: (preview.x ?? Math.floor(camera.x / 32)) + direction[0], y: (preview.y ?? Math.floor(camera.y / 32)) + direction[1]});
    else setCamera(constrainSceneCamera({...camera, x: camera.x + direction[0] * 16, y: camera.y + direction[1] * 16}, scene, size.width, size.height));
  };
  const origin = camera ? cameraOrigin(camera, size.width, size.height) : [0,0];
  return <section className="game-map-panel" aria-label="我的世界地图">
    <div className="game-world-host" ref={host}><canvas ref={canvas} role="img" tabIndex={0} aria-label="林缘正交世界" data-ready={Boolean(camera && size.width > 1)} data-scale={camera?.scale ?? 1} data-origin-x={origin[0]} data-origin-y={origin[1]} data-camera-x={camera?.x} data-camera-y={camera?.y} data-preview-x={preview?.x ?? ''} data-preview-y={preview?.y ?? ''} onPointerDown={event => {
      if (!camera || event.button !== 0 || gesture.current) return;
      canvas.current.focus({preventScroll: true}); gesture.current = {id: event.pointerId, x: event.clientX, y: event.clientY, camera, dragged: false}; event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={pan} onPointerUp={event => release(event)} onPointerCancel={event => release(event, true)} onLostPointerCapture={() => {gesture.current = null;}} onKeyDown={keys} /></div>
    <nav className="game-camera-tools" aria-label="世界视角"><button onClick={() => setCamera(fitSceneCamera(scene, size.width, size.height))}>世界总览</button><div className="game-zoom-tools"><button aria-label="缩小世界" disabled={!camera || camera.scale <= ZOOMS[0]} onClick={() => setCamera(zoomSceneCamera(camera, -1, scene, size.width, size.height))}>−</button><output aria-label="观看倍率">{camera ? Number(camera.scale.toFixed(3)) : 1}×</output><button aria-label="放大世界" disabled={!camera || camera.scale >= ZOOMS.at(-1)} onClick={() => setCamera(zoomSceneCamera(camera, 1, scene, size.width, size.height))}>＋</button></div></nav>
    <span className="game-map-hint">拖动地图 · 滚轮缩放</span>
  </section>;
}

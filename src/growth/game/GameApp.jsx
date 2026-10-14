import React, {useEffect, useRef, useState} from 'react';
import scene from '../homestead/scene.json';
import {loadHomesteadAssets, paintHomestead} from '../homestead/renderer.js';
import {constrainCamera, fitCamera, prepareScene, ZOOMS} from '../homestead/world.js';

export default function GameApp() {
  const [load, setLoad] = useState({status: 'loading'});
  const [retry, setRetry] = useState(0);
  const [camera, setCamera] = useState(null);
  const [size, setSize] = useState({width: 800, height: 600});
  const host = useRef(null), canvas = useRef(null), gesture = useRef(null);

  useEffect(() => {
    let active = true;
    setLoad({status: 'loading'});
    loadHomesteadAssets().then(resources => {
      const world = prepareScene(scene, resources.manifest);
      if (active) setLoad({status: 'ready', resources, world});
    }).catch(error => {
      if (active) setLoad({status: 'error', message: error.message});
    });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!host.current) return;
    const update = () => {
      const bounds = host.current.getBoundingClientRect();
      setSize({width: Math.floor(bounds.width), height: Math.floor(bounds.height)});
    };
    const observer = new ResizeObserver(update);
    observer.observe(host.current);
    update();
    return () => observer.disconnect();
  }, [load.status]);

  useEffect(() => {
    if (load.status === 'ready') setCamera(fitCamera(load.world, size.width, size.height));
  }, [load.status, size.width, size.height]);

  useEffect(() => {
    if (load.status !== 'ready' || !camera || !canvas.current) return;
    const element = canvas.current;
    element.width = size.width;
    element.height = size.height;
    paintHomestead(element.getContext('2d'), load.world, load.resources, camera, size.width, size.height);
  }, [load, camera, size]);

  const constrain = next => constrainCamera(next, load.world, size.width, size.height);
  const zoom = step => {
    if (!camera) return;
    const index = Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(camera.scale) + step));
    setCamera(constrain({...camera, scale: ZOOMS[index]}));
  };
  const startDrag = event => {
    if (!camera || event.button !== 0) return;
    gesture.current = {id: event.pointerId, x: event.clientX, y: event.clientY, camera};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = event => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < 4) return;
    setCamera(constrain({...start.camera, x: start.camera.x - dx / start.camera.scale, y: start.camera.y - dy / start.camera.scale}));
  };
  const endDrag = event => {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const panWithKeyboard = event => {
    const offsets = {ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16]};
    if (!camera || !offsets[event.key]) return;
    event.preventDefault();
    const [dx, dy] = offsets[event.key];
    setCamera(constrain({...camera, x: camera.x + dx, y: camera.y + dy}));
  };

  return <main className="game-page">
    <header className="game-header">
      <div><p className="game-eyebrow">明日复 · 我的世界</p><h1>林缘小家</h1><p>路通向门口，空地留给明天。</p></div>
      <span className="game-badge">候选预览</span>
    </header>
    {load.status === 'loading' && <section className="game-message" role="status">正在打开小屋的窗…</section>}
    {load.status === 'error' && <section className="game-message" role="alert"><h2>世界素材没有完整加载</h2><p>{load.message}</p><button onClick={() => setRetry(value => value + 1)}>重新加载素材</button></section>}
    {load.status === 'ready' && <section className="game-world-panel" aria-label="我的世界">
      <nav className="game-camera-tools" aria-label="世界视角">
        <button onClick={() => setCamera(fitCamera(load.world, size.width, size.height))}>世界总览</button>
        <div className="game-zoom-tools">
          <button aria-label="缩小世界" disabled={!camera || camera.scale === ZOOMS[0]} onClick={() => zoom(-1)}>−</button>
          <output aria-label="观看倍率">{camera?.scale ?? 1}×</output>
          <button aria-label="放大世界" disabled={!camera || camera.scale === ZOOMS.at(-1)} onClick={() => zoom(1)}>＋</button>
        </div>
      </nav>
      <div className="game-world-host" ref={host}>
        <canvas ref={canvas} role="img" aria-label="林缘小家正交像素世界" tabIndex={0} data-ready={Boolean(camera)} data-scale={camera?.scale ?? 1} onPointerDown={startDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { gesture.current = null; }} onKeyDown={panWithKeyboard} />
      </div>
      <p className="game-world-hint">拖动查看 · 放大欣赏 · 总览回到家园</p>
    </section>}
    <p className="game-note">当前为只读家园预览。木屋沿用已验收素材，其余美术与构图仍为候选。</p>
  </main>;
}

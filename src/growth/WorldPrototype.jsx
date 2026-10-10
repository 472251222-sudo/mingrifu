import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowsOut, Check, Compass, Cube, GridFour, Hand, House, Leaf, Minus, Plus, Sun, Tree, X, Archive } from '@phosphor-icons/react';
import { BUILDINGS, buildingConfig } from './buildings.js';
import { buildingAt, frontierChunks, placementCheck, CHUNK_SIZE } from './grid.js';
import { loadAssets } from './renderer.js';
import { buildingBitmap } from './isometric-art.js';
import { WorldMap } from './WorldMap.jsx';
import { ArtSample } from './ArtSample.jsx';
import { useWorld } from './useWorld.js';
import './styles.css';

function Sprite({ assets, type }) {
  const ref = useRef();
  useEffect(() => {
    const context = ref.current.getContext('2d');
    context.clearRect(0, 0, 80, 80);
    context.imageSmoothingEnabled = false;
    context.drawImage(buildingBitmap(type), 0, 0);
  }, [assets, type]);
  return <canvas ref={ref} width="80" height="80" className="gw-sprite" aria-hidden="true" />;
}
function regionName(region) {
  if (region.y < 0) return region.x < 0 ? '西北方' : region.x > 0 ? '东北方' : '北方';
  if (region.y > 0) return region.x < 0 ? '西南方' : region.x > 0 ? '东南方' : '南方';
  return region.x < 0 ? '西方' : '东方';
}

function SavedWorld() {
  const { world, execute, error, blocked, pending, reload, retry, dismissPending } = useWorld();
  const [assets, setAssets] = useState(null), [assetError, setAssetError] = useState(''), [assetAttempt, setAssetAttempt] = useState(0);
  const [mode, setMode] = useState('browse'), [tab, setTab] = useState('catalog'), [placement, setPlacement] = useState(null), [cell, setCell] = useState(null), [hover, setHover] = useState(null);
  const [selectedId, setSelectedId] = useState(null), [expansion, setExpansion] = useState(null), [grid, setGrid] = useState(false), [message, setMessage] = useState(''), [changedIds, setChangedIds] = useState([]);
  const [view, setView] = useState({ scale: 1, min: 1 / 16, max: 4 });
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    document.body.classList.add('gw-page');
    const media = window.matchMedia('(max-width: 600px)'), changed = () => setMobile(media.matches);
    media.addEventListener('change', changed);
    return () => { document.body.classList.remove('gw-page'); media.removeEventListener('change', changed); };
  }, []);
  const map = useRef(), lastAction = useRef();
  const selected = world.buildings.find(b => b.id === selectedId && !b.stored);
  const stored = world.buildings.filter(b => b.stored), placed = world.buildings.filter(b => !b.stored);
  const locked = blocked || !!pending, unavailable = locked || !assets;
  const position = cell || hover;
  const preview = placement && position ? { ...placement, ...position } : null;
  const check = preview ? placementCheck(world, preview.type, preview.x, preview.y, preview.id) : null;
  const regions = frontierChunks(world);

  useEffect(() => {
    let cancelled = false;
    setAssetError('');
    loadAssets(assetAttempt > 0).then(result => { if (!cancelled) setAssets(result); }).catch(problem => { if (!cancelled) setAssetError(problem.message); });
    return () => { cancelled = true; };
  }, [assetAttempt]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 5000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => { if (!changedIds.length) return; const timer = setTimeout(() => setChangedIds([]), 2400); return () => clearTimeout(timer); }, [changedIds]);

  const cancel = () => { setPlacement(null); setCell(null); setHover(null); setExpansion(null); setMode('browse'); setDrawerOpen(false); };
  const finish = next => {
    if (!next) return;
    const action = lastAction.current;
    setMessage(action.message);
    if (action.command.type === 'grow') { setChangedIds(next.growth.changedIds); setMessage(next.growth.copy); }
    if (action.command.type === 'place') { setSelectedId(action.command.id || next.buildings.at(-1).id); setDrawerOpen(false); }
    if (action.command.type === 'store') { setSelectedId(null); setTab('inventory'); setDrawerOpen(true); }
    if (action.command.type === 'expand') {
      setExpansion(null); setMode('build'); setTab('catalog'); setDrawerOpen(true);
      // Fit on the next frame, after WorldMap receives the new world.
      setTimeout(() => map.current?.fit(), 0);
    }
    setPlacement(null); setCell(null); setHover(null);
  };
  const run = (command, text) => { lastAction.current = { command, message: text }; const result = execute(command); finish(result); };
  const chooseBuilding = (type, id) => { setMode('build'); setPlacement({ type, ...(id ? { id } : {}) }); setCell(null); setHover(null); setExpansion(null); setSelectedId(id || null); setDrawerOpen(false); if (mobile) map.current?.buildView(id ? world.buildings.find(b => b.id === id) : null); };
  const changeMode = next => { cancel(); setSelectedId(null); setMode(next); setDrawerOpen(next !== 'browse'); if (next === 'build') setTab('catalog'); if (next === 'expand') setTimeout(() => map.current?.fit(regions), 0); };
  const chooseCell = (next, hitId) => {
    if (locked) return;
    if (placement) setCell(next);
    else if (mode === 'expand') {
      const region = { x: Math.floor(next.x / CHUNK_SIZE), y: Math.floor(next.y / CHUNK_SIZE) };
      if (regions.some(r => r.x === region.x && r.y === region.y)) { setExpansion(region); map.current?.fit(region); }
    } else { setSelectedId(hitId === undefined ? buildingAt(world, next.x, next.y)?.id || null : hitId); setDrawerOpen(false); }
  };
  const confirmPlacement = () => {
    if (!placement || !cell || !check?.valid || unavailable) return;
    run({ type: 'place', buildingType: placement.type, id: placement.id, ...cell }, `${buildingConfig(placement.type).name}放好了。`);
  };
  const savedTime = world.updatedAt ? new Date(world.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null;

  return <div className="gw-root">
    <aside className="gw-rail" aria-label="原型导航"><a className="gw-mark" href="/" aria-label="返回明日复"><Leaf size={26} weight="fill" /></a><div className="gw-rail-link active"><Compass size={23} /><span>世界</span></div><a className="gw-rail-link" href="/" aria-label="返回目标与任务"><ArrowLeft size={22} /><span>返回</span></a><span className="gw-rail-line" /><Tree className="gw-rail-tree" size={23} /></aside>
    <div className="gw-shell">
      <header className="gw-header"><a href="/" className="gw-wordmark">明日复<span>让每一天，都留下生长。</span></a><div className="gw-header-right"><a className="gw-art-link" href="/growth-p1?view=art">美术样板</a><span className="gw-prototype-badge">交互原型 P1.1</span><span className={`gw-save ${locked ? 'problem' : ''}`} role="status"><span />{locked ? '存档待处理' : savedTime ? `已保存于 ${savedTime}` : '初始世界 · 本机保存'}</span></div></header>
      <main className="gw-main">
        <section className="gw-intro"><div><div className="gw-eyebrow">A LITTLE WORLD, ALL YOUR OWN</div><h1>我的生长之地<span>慢慢生长，自由创造。</span></h1><p>这片世界属于你。安放喜欢的建筑，让自然一点点回应。</p></div><button className="gw-button primary gw-grow" disabled={unavailable} onClick={() => run({ type: 'grow' }, '')}><Leaf size={19} />让自然生长一次<span>模拟成长</span></button></section>
        {error && <div className="gw-error" role="alert"><div><b>{blocked ? '存档需要处理 · 当前为只读预览' : pending ? '保存失败 · 本次变化尚未生效' : '这次操作没有完成'}</b><p>{error}</p></div><div>{pending && !blocked && <><button className="gw-button" onClick={() => finish(retry())}>重试保存</button><button className="gw-button" onClick={dismissPending}>放弃本次变化</button></>}<button className="gw-button" onClick={() => { if (reload()) { cancel(); setSelectedId(null); setMessage('已重新读取保存的世界。'); } }}>重新读取</button></div></div>}
        <div className="gw-layout">
          <section className="gw-map-card" aria-label="世界与建造操作">
            <div className="gw-map-toolbar"><div className="gw-tools" role="group" aria-label="地图工具">{[['browse', Hand, '浏览'], ['build', Cube, '建造'], ['expand', ArrowsOut, '扩张']].map(([id, Symbol, label]) => <button key={id} className={mode === id ? 'active' : ''} aria-pressed={mode === id} disabled={locked} onClick={() => changeMode(id)}><Symbol size={17} />{label}</button>)}</div><button className={`gw-grid-toggle ${grid ? 'active' : ''}`} aria-label="显示网格" aria-pressed={grid} onClick={() => setGrid(!grid)}><GridFour size={17} /><span>网格</span></button></div>
            <WorldMap ref={map} {...{ world, assets, preview, expansion, selectedId, changedIds }} expansionCandidates={mode === 'expand' ? regions : null} grid={grid || !!placement || mode === 'expand'} onViewChange={setView} movingId={placement?.id} onCell={chooseCell} onHover={next => { if (placement && !cell) setHover(next); }} onConfirm={confirmPlacement} onCancel={cancel} />
            {!assets && <div className="gw-asset-notice" role="status">{assetError || '正在准备像素风景…'}{assetError && <button className="gw-button" onClick={() => setAssetAttempt(n => n + 1)}>重试素材</button>}</div>}
            <div className="gw-camera"><button aria-label="缩小地图" disabled={view.scale <= view.min} onClick={() => map.current?.zoom(-1)}><Minus size={16} /></button><span className="gw-zoom-level" aria-label="地图缩放比例">{Number((view.scale * 100).toFixed(2))}%</span><button aria-label="放大地图" disabled={view.scale >= view.max} onClick={() => map.current?.zoom(1)}><Plus size={16} /></button><span className="gw-camera-divider" /><button aria-label="查看完整地图" onClick={() => map.current?.fit(expansion)}><ArrowsOut size={16} /><span className="gw-fit-label">回到世界</span></button></div>
            <div className="gw-map-bottom"><span><Hand size={14} />拖动平移 · 点击选择</span><b>{world.chunks.length * 64} 格土地<span> / </span>{placed.length} 栋建筑</b></div>
          </section>
          <aside className={`gw-panel ${drawerOpen ? 'drawer-open' : ''} ${placement ? 'placing' : ''} ${selected && !placement ? 'inspecting' : ''} ${mode === 'expand' ? 'expanding' : ''}`} aria-label="世界工具面板">
            {message && !placement && <p className="gw-dock-feedback" role="status"><Check size={14} />{message}</p>}
            <div className="gw-mobile-launcher"><button className="gw-button" aria-label="打开建筑目录" disabled={locked} onClick={() => { setMode('build'); setTab('catalog'); setDrawerOpen(true); }}><Cube size={17} />建筑目录</button><button className="gw-button" aria-label="打开收纳盒" disabled={locked} onClick={() => { setMode('build'); setTab('inventory'); setDrawerOpen(true); }}><Archive size={17} />收纳盒 {stored.length}</button></div>
            <div className="gw-drawer-heading"><b>{mode === 'expand' ? '选择相邻土地' : tab === 'inventory' ? '收纳盒' : '建筑目录'}</b><button aria-label="收起建筑目录" onClick={() => { setDrawerOpen(false); if (mode === 'expand') cancel(); }}><X size={19} /></button></div>
            {mode === 'expand' ? <>
              <div className="gw-panel-heading"><span className="gw-eyebrow">A LITTLE MORE ROOM</span><h2>向远处走一点</h2><p>选择相邻土地。原来的建筑与布局都会留下。</p></div>
              <div className="gw-regions">{regions.map((region, index) => <button key={`${region.x},${region.y}`} className={expansion?.x === region.x && expansion?.y === region.y ? 'selected' : ''} aria-pressed={expansion?.x === region.x && expansion?.y === region.y} aria-label={`选择${regionName(region)}区域 (${region.x},${region.y})`} disabled={unavailable} onClick={() => { setExpansion(region); map.current?.fit(region); }}><Compass size={21} /><div><b>{index + 1} · {regionName(region)}新土地</b><small>8 × 8 格 · 区域 {region.x}, {region.y}</small></div><ArrowRight size={16} /></button>)}</div>
              <div className="gw-expansion-confirm"><p>{expansion ? `已选择${regionName(expansion)}区域，高亮范围是即将开放的土地。` : '也可以直接点击地图周围的区域。'}</p><div className="gw-dock-actions"><button className="gw-button" aria-label="取消扩张" onClick={cancel}>取消</button><button className="gw-button primary" disabled={!expansion || unavailable} onClick={() => run({ type: 'expand', ...expansion }, '新土地已开放，可以继续自由建造。')}><Plus size={17} />确认扩张</button></div></div>
            </> : <>
              <div className="gw-panel-heading"><span className="gw-eyebrow">MAKE YOURSELF AT HOME</span><h2>{placement ? placement.id ? '给它换个位置' : '为世界添一点日常' : '随心安放，慢慢成形'}</h2><p>建筑自由摆放，不需要领取或消耗奖励。</p></div>
              <div className="gw-tabs" role="tablist" aria-label="建筑分类"><button role="tab" id="gw-catalog-tab" aria-controls="gw-catalog" aria-selected={tab === 'catalog'} onClick={() => setTab('catalog')}>基础建筑</button><button role="tab" id="gw-inventory-tab" aria-controls="gw-inventory" aria-selected={tab === 'inventory'} onClick={() => setTab('inventory')}>收纳盒 <span>{stored.length}</span></button></div>
              {tab === 'catalog' ? <div id="gw-catalog" role="tabpanel" aria-labelledby="gw-catalog-tab" className="gw-catalog">{Object.entries(BUILDINGS).map(([id, config]) => <button key={id} className={`gw-building-option ${placement?.type === id && !placement?.id ? 'selected' : ''}`} aria-label={`选择${config.name}`} aria-pressed={placement?.type === id && !placement?.id} disabled={unavailable} onClick={() => chooseBuilding(id)}><span className="gw-sprite-tile"><Sprite assets={assets} type={id} /></span><div><b>{config.name}</b><small>{config.description}</small><span className="gw-footprint">{config.width} × {config.height} 格</span></div>{placement?.type === id && !placement?.id && <Check size={17} />}</button>)}</div> : <div id="gw-inventory" role="tabpanel" aria-labelledby="gw-inventory-tab" className="gw-inventory">{stored.length ? stored.map(b => <button key={b.id} className="gw-building-option" aria-label={`重新摆放${BUILDINGS[b.type].name} ${b.id}`} disabled={unavailable} onClick={() => chooseBuilding(b.type, b.id)}><span className="gw-sprite-tile"><Sprite assets={assets} type={b.type} /></span><div><b>{BUILDINGS[b.type].name}</b><small>建筑已收好，随时可以再放回世界。</small></div><ArrowRight size={17} /></button>) : <div className="gw-empty"><Archive size={32} /><b>先把喜欢的建筑放进世界</b><p>选中已有建筑后可以收纳；再次摆放时，它仍是原来那一栋。</p></div>}</div>}
              {placement && <div className={`gw-placement ${check && !check.valid ? 'invalid' : ''}`}><div className="gw-placement-title"><b>{BUILDINGS[placement.type].name}</b><span>{placement.id ? '移动中' : '选择位置'}</span></div><p className="gw-placement-message" role="status">{cell ? `位置 ${cell.x + 1}, ${cell.y + 1} · ${check.reason}` : '点击地图选择位置。绿色可以放置，红色需要调整。'}</p><div className="gw-dock-actions"><button className="gw-button" aria-label="取消放置" onClick={cancel}>取消</button><button className="gw-button primary" disabled={!cell || !check?.valid || unavailable} onClick={confirmPlacement}><Check size={17} />{placement.id ? '确认新位置' : '确认放置'}</button></div></div>}
              {selected && !placement && <div className="gw-inspector"><div><House size={18} /><b>{BUILDINGS[selected.type].name}</b><span>位置 {selected.x + 1}, {selected.y + 1}</span></div><div className="gw-inspector-actions"><button className="gw-button" disabled={unavailable} onClick={() => chooseBuilding(selected.type, selected.id)}><ArrowsOut size={16} />移动建筑</button><button className="gw-button" disabled={unavailable} onClick={() => run({ type: 'store', id: selected.id }, '建筑已放进收纳盒，随时可以重新摆放。')}><Archive size={16} />收纳建筑</button></div></div>}
              {placed.length > 0 && <details className="gw-placed-list"><summary>地图上的建筑 <span>{placed.length}</span></summary>{placed.map(b => <button key={b.id} onClick={() => { cancel(); setSelectedId(b.id); map.current?.fit(); }}><House size={14} /><span>{BUILDINGS[b.type].name}</span><small>{b.x + 1}, {b.y + 1}</small></button>)}</details>}
            </>}
            <div className="gw-panel-note"><Sun size={19} /><p>自然变化只发生在空地上。<br />你的建筑与布局，由你决定。</p></div>
          </aside>
        </div>
        <footer className="gw-footer"><span><Leaf size={14} />一个世界，陪伴长久的你。</span><span>临时像素素材 · 用于 P1 交互验证<span className="gw-footer-divider">/</span>进度保存在本机浏览器</span></footer>
      </main>
    </div>
    {message && <div className="gw-toast" role="status"><Check size={18} /><span>{message}</span><button aria-label="关闭世界提示" onClick={() => setMessage('')}><X size={15} /></button></div>}
  </div>;
}

export default function WorldPrototype() {
  return new URLSearchParams(window.location.search).get('view') === 'art' ? <ArtSample /> : <SavedWorld />;
}

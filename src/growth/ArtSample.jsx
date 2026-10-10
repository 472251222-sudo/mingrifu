import React, { useEffect, useRef, useState } from 'react';
import { ArrowsOut, Minus, Plus } from '@phosphor-icons/react';
import { WorldMap } from './WorldMap.jsx';
import { loadAssets, paintMap } from './renderer.js';

// A deterministic read-only scene. This component never calls useWorld or any
// storage API, so comparing artwork cannot alter the user's prototype world.
const sample = {
  chunks: [{ x: 0, y: 0 }],
  buildings: [{ id: 'sample-cabin', type: 'cottage', x: 2, y: 3, stored: false }],
  nature: [{ id: 'sample-tree', kind: 'tree', stage: 4, x: 5, y: 3 }],
};
const noop = () => {};
function ComparisonCanvas({ assets, art, scale }) {
  const host = useRef(), canvas = useRef();
  const [width, setWidth] = useState(500);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, Math.floor(entry.contentRect.width))));
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    paintMap(canvas.current.getContext('2d'), sample, assets, { width, height: 340, centerX: 3, centerY: 34, scale }, { art });
  }, [assets, art, scale, width]);
  return <div className="gw-comparison-canvas" ref={host}><canvas ref={canvas} width={width} height={340} aria-label={art === 'legacy' ? '原 P1 同镜头画面' : '候选样板同镜头画面'} /></div>;
}
function ArtComparison({ assets }) {
  const [scale, setScale] = useState(2);
  return <section className="gw-art-comparison" aria-label="同镜头美术对比">
    <div className="gw-comparison-heading"><div><h2>同镜头，并排看</h2><p>相同布局、倍率和中心点；只替换候选木屋、树与草地。</p></div><button className="gw-button" aria-label="切换对比视距" onClick={() => setScale(s => s === 2 ? 4 : 2)}>{scale === 2 ? '查看近景对比' : '查看普通视距'} · {scale * 100}%</button></div>
    <div className="gw-comparison-grid"><div><b>原 P1 · {scale * 100}%</b><ComparisonCanvas {...{ assets, scale }} art="legacy" /></div><div><b>候选样板 · {scale * 100}%</b><ComparisonCanvas {...{ assets, scale }} art="candidate" /></div></div>
  </section>;
}
export function ArtSample() {
  const map = useRef();
  const [assets, setAssets] = useState(null), [problem, setProblem] = useState(''), [attempt, setAttempt] = useState(0);
  const [art, setArt] = useState('candidate'), [view, setView] = useState({ scale: 2, min: 1 / 16, max: 4 });
  useEffect(() => {
    document.body.classList.add('gw-page'); let cancelled = false;
    loadAssets(attempt > 0).then(result => { if (!cancelled) { setAssets(result); setProblem(''); } }).catch(error => { if (!cancelled) setProblem(error.message); });
    return () => { cancelled = true; document.body.classList.remove('gw-page'); };
  }, [attempt]);
  return <div className="gw-root gw-art-sample">
    <header className="gw-sample-header"><a href="/growth-p1">← 回到我的世界</a><span>候选美术 · 尚待确认</span></header>
    <main className="gw-sample-main">
      <div className="gw-sample-intro"><div><span className="gw-eyebrow">ONE CABIN, ONE TREE, ONE LANGUAGE</span><h1>林间小样</h1><p>同一布局与镜头，比较一栋木屋、一棵树和连续草地。此场景不读写你的存档。</p></div>
        <div className="gw-sample-switch" role="group" aria-label="美术对比"><button aria-pressed={art === 'legacy'} onClick={() => setArt('legacy')}>原 P1 素材</button><button aria-pressed={art === 'candidate'} onClick={() => setArt('candidate')}>候选样板</button></div>
      </div>
      <section className="gw-map-card gw-sample-map">
        <WorldMap ref={map} world={sample} assets={assets} art={art} onCell={noop} onHover={noop} onConfirm={noop} onCancel={noop} onViewChange={setView} />
        <div className="gw-camera"><button aria-label="缩小地图" disabled={view.scale <= view.min} onClick={() => map.current?.zoom(-1)}><Minus size={16} /></button><span className="gw-zoom-level">{view.scale * 100}%</span><button aria-label="放大地图" disabled={view.scale >= view.max} onClick={() => map.current?.zoom(1)}><Plus size={16} /></button><button aria-label="查看完整地图" onClick={() => map.current?.fit()}><ArrowsOut size={16} /><span className="gw-fit-label">总览</span></button></div>
        {!assets && <div className="gw-asset-notice">{problem || '正在准备对比素材…'}{problem && <button className="gw-button" onClick={() => setAttempt(n => n + 1)}>重试素材</button>}</div>}
      </section>
      <div className="gw-sample-notes"><p><b>空间</b>24 × 12 像素地块，2:1 斜俯视；木屋占地 2 × 2 格，树根锚点在格中心。</p><p><b>光与尺度</b>1 个逻辑像素为基础笔触，左上受光，右下落影；近景使用整数放大与最近邻采样。</p><p><b>范围</b>补齐木屋山墙与屋檐，统一树冠、草地、接地阴影。样板仅供评审，尚未推广到其他建筑或已保存世界。</p></div>
      {assets && <ArtComparison assets={assets} />}
    </main>
  </div>;
}

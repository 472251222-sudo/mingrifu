import React, {useEffect, useState} from 'react';
import {loadHomesteadAssets} from '../homestead/renderer.js';
import {ASSETS, stageForXP} from './balance.js';
import {applyGameCommand, createGameWorld} from './world.js';
import {placementCheck} from './spatial.js';
import {createSpriteMasks} from './renderer.js';
import WorldCanvas from './WorldCanvas.jsx';

export default function GameApp() {
  const [world, setWorld] = useState(createGameWorld);
  const [load, setLoad] = useState({status: 'loading'}), [retry, setRetry] = useState(0);
  const [drawer, setDrawer] = useState(null), [preview, setPreview] = useState(null), [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('先摆一簇花，慢慢布置自己的世界。');
  useEffect(() => {
    let active = true; setLoad({status: 'loading'});
    loadHomesteadAssets().then(resources => {resources.masks = createSpriteMasks(resources); if (active) setLoad({status: 'ready', resources});}).catch(error => {if (active) setLoad({status: 'error', message: error.message});});
    return () => {active = false;};
  }, [retry]);
  useEffect(() => {
    if (!drawer) return;
    const close = event => {if (event.key === 'Escape') {event.preventDefault(); setDrawer(null);}};
    document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close);
  }, [drawer]);
  const stage = stageForXP(world.xp);
  const selected = world.objects.find(object => object.id === selectedId && !object.stored) || world.nature.find(object => object.id === selectedId);
  const artificial = selected && world.objects.includes(selected), stored = world.objects.filter(object => object.stored);
  let placement = null;
  if (preview) {
    const asset = ASSETS[preview.assetId];
    if (preview.type === 'build' && world.xp < asset.unlockXP) placement = {ok: false, message: `达到 ${asset.unlockXP} XP 后开放，当前 ${world.xp} XP。`};
    else if (preview.type === 'build' && world.bp < asset.cost) placement = {ok: false, message: `BP 不足：需要 ${asset.cost} BP，当前 ${world.bp} BP。`};
    else if (!Number.isInteger(preview.x) || !Number.isInteger(preview.y)) placement = {ok: false, message: '点地图选择位置，也可以用方向键调整。'};
    else placement = placementCheck(world, preview.assetId, preview.x, preview.y, preview.type === 'build' ? null : preview.id);
  }
  const choose = (assetId, object = null) => {setPreview({type: object ? 'place' : 'build', assetId, ...(object ? {id: object.id} : {}), x: null, y: null}); setSelectedId(null); setDrawer(null); setMessage('');};
  const confirm = () => {
    if (!preview || !placement?.ok) return;
    const command = {...preview}; delete command.assetId; if (preview.type === 'build') command.assetId = preview.assetId;
    try {
      const next = applyGameCommand(world, command), id = preview.type === 'build' ? next.objects.find(object => !world.objects.some(previous => previous.id === object.id)).id : preview.id;
      setWorld(next); setSelectedId(id); setPreview(null); setMessage(preview.type === 'build' ? `已放置，消费 ${ASSETS[preview.assetId].cost} BP。` : '位置已调整，未消费 BP。');
    } catch (error) {setMessage(error.message);}
  };
  const store = () => {try {setWorld(applyGameCommand(world, {type: 'store', id: selected.id})); setSelectedId(null); setMessage('已收纳，可以免费重新摆放。');} catch (error) {setMessage(error.message);}};
  const cancel = () => {setPreview(null); setDrawer(null); setSelectedId(null); setMessage('已取消，世界与 BP 保持原样。');};
  return <main className="game-page" data-world-revision={world.revision}>
    <header className="game-header"><div><p className="game-eyebrow">明日复 · 我的世界</p><h1>林缘小家</h1></div><div className="game-resources"><output aria-label="永久XP">{world.xp} XP</output><output aria-label="可用BP">{world.bp} BP</output></div></header>
    <div className="game-stage"><span>{stage.name}</span><progress max={stage.nextXP || 1} value={stage.nextXP ? world.xp : 1} aria-label="成长阶段进度" /><span>{stage.nextXP ? `${world.xp} / ${stage.nextXP} XP` : '全部开放'}</span></div>
    <p className="game-temporary">临时体验 · 尚未保存，刷新会重置 · 美术候选</p>
    {load.status === 'loading' && <section className="game-message" role="status">正在打开小屋的窗…</section>}
    {load.status === 'error' && <section className="game-message" role="alert"><h2>世界素材没有完整加载</h2><p>{load.message}</p><button onClick={() => setRetry(value => value + 1)}>重新加载素材</button></section>}
    {load.status === 'ready' && <WorldCanvas world={world} resources={load.resources} preview={preview} placement={placement} selectedId={selectedId} onCell={position => {setPreview(current => current ? {...current, ...position} : null); setMessage('');}} onSelect={object => {setSelectedId(object?.id || null); setMessage(object?.kind === 'natural' ? '自然植被会随成长变化，建造确认后可让出空间。' : '');}} onConfirm={confirm} onCancel={cancel} />}
    <section className="game-actions" aria-label="世界操作" data-object-id={selected?.id || ''}>
      {preview ? <><div className="game-operation-title"><strong>{ASSETS[preview.assetId].name}</strong><span>{preview.type === 'build' ? `${ASSETS[preview.assetId].cost} BP` : '0 BP · 免费'}{Number.isInteger(preview.x) ? ` · (${preview.x}, ${preview.y})` : ''}</span></div><p className={placement.ok ? 'game-operation-message' : 'game-operation-message game-operation-error'} role="status">{message || placement.message}</p><div className="game-action-buttons"><button className="game-primary" disabled={!placement.ok || load.status !== 'ready'} onClick={confirm}>{preview.type === 'build' ? '确认建造' : '确认位置'}</button><button onClick={cancel}>取消</button></div></>
      : selected ? <><div className="game-operation-title"><strong>{ASSETS[selected.asset].name}</strong><span>{artificial ? '移动、收纳、重摆免费' : '自然植被'}</span></div><p className="game-operation-message" role="status">{message || '已选中，可随时调整自己的布置。'}</p><div className="game-action-buttons">{artificial && <><button className="game-primary" onClick={() => {setPreview({type: 'move', id: selected.id, assetId: selected.asset, x: selected.x, y: selected.y}); setMessage('');}}>移动</button><button onClick={store}>收纳</button></>}<button onClick={cancel}>取消选择</button></div></>
      : <><div className="game-operation-title"><strong>布置自己的世界</strong><span>{stored.length > 0 ? `收纳 ${stored.length} 件` : '可随时调整'}</span></div><p className="game-operation-message" role="status">{message}</p><div className="game-action-buttons"><button className="game-primary" disabled={load.status !== 'ready'} onClick={() => setDrawer('build')}>建造</button><button disabled={load.status !== 'ready'} onClick={() => setDrawer('stored')}>收纳盒{stored.length ? ` (${stored.length})` : ''}</button></div></>}
    </section>
    {drawer && <><button className="game-drawer-backdrop" aria-label="关闭目录" onClick={() => setDrawer(null)} /><section className="game-drawer" role="dialog" aria-modal="true" aria-label={drawer === 'build' ? '建造目录' : '收纳盒'}><header><h2>{drawer === 'build' ? '选择一件，放进世界' : '免费重新摆放'}</h2><button aria-label="关闭抽屉" onClick={() => setDrawer(null)}>×</button></header><div className="game-catalog">
      {drawer === 'build' ? Object.values(ASSETS).map(asset => <button key={asset.id} className="game-catalog-item" aria-label={`选择${asset.name}`} onClick={() => choose(asset.id)}><img src={load.resources.manifest.assets.find(item => item.id === asset.id).png} alt="" /><span><strong>{asset.name}</strong><small>{asset.cost} BP · {asset.footprint.join('×')} 格</small><small>{world.xp < asset.unlockXP ? `${asset.unlockXP} XP 开放` : '已开放'}</small></span></button>) : stored.length ? stored.map(object => <button key={object.id} className="game-catalog-item" data-object-id={object.id} aria-label={`重新摆放${ASSETS[object.asset].name}`} onClick={() => choose(object.asset, object)}><img src={load.resources.manifest.assets.find(asset => asset.id === object.asset).png} alt="" /><span><strong>{ASSETS[object.asset].name}</strong><small>0 BP · 免费重摆</small></span></button>) : <p className="game-empty">收纳盒是空的。选中世界里的物件后，可以免费收纳。</p>}
    </div></section></>}
  </main>;
}

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {loadHomesteadAssets} from '../homestead/renderer.js';
import {ASSETS, BALANCE, stageForXP} from './balance.js';
import {frontierChunks, placementCheck} from './spatial.js';
import {createSpriteMasks} from './renderer.js';
import {gameChangeSummary} from './scene.js';
import useGameWorld from './useGameWorld.js';
import WorldCanvas from './WorldCanvas.jsx';

const directionName = (chunk, chunks) => {
  const adjacent = chunks.find(item => Math.abs(item.x - chunk.x) + Math.abs(item.y - chunk.y) === 1);
  return !adjacent ? '相邻' : chunk.y < adjacent.y ? '北方' : chunk.y > adjacent.y ? '南方' : chunk.x < adjacent.x ? '西方' : '东方';
};

export default function GameApp() {
  const game = useGameWorld(), world = game.world;
  const [load, setLoad] = useState({status: 'loading'}), [assetRetry, setAssetRetry] = useState(0);
  const [drawer, setDrawer] = useState(null), [preview, setPreview] = useState(null), [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('先摆一簇花，或记录一次模拟努力。');
  const [minutes, setMinutes] = useState('25'), [label, setLabel] = useState(''), [formError, setFormError] = useState('');
  const [completion, setCompletion] = useState(null), [overviewToken, setOverviewToken] = useState(0);
  const attempt = useRef(null), submitting = useRef(false);
  const candidates = useMemo(() => frontierChunks(world), [world]);
  const canWrite = game.status === 'ready' && game.saved && !game.readonly && !game.busy && !game.pending && load.status === 'ready';
  const stage = stageForXP(world.xp), selected = world.objects.find(object => object.id === selectedId && !object.stored) || world.nature.find(object => object.id === selectedId);
  const artificial = selected && world.objects.includes(selected), stored = world.objects.filter(object => object.stored);

  useEffect(() => {
    let active = true; setLoad({status: 'loading'});
    loadHomesteadAssets().then(resources => {resources.masks = createSpriteMasks(resources); if (active) setLoad({status: 'ready', resources});}).catch(error => {if (active) setLoad({status: 'error', message: error.message});});
    return () => {active = false;};
  }, [assetRetry]);
  useEffect(() => {
    if (!drawer) return;
    const close = event => {if (event.key === 'Escape' && !game.busy) {event.preventDefault(); setDrawer(null);}};
    document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close);
  }, [drawer, game.busy]);
  useEffect(() => {
    if (drawer === 'effort' && game.pending && game.error && !game.busy) {
      // Preserve the controller's original event/UUID and candidate. Only the
      // modal closes so fixed recovery controls remain directly reachable.
      setDrawer(null); setMessage('本次模拟努力尚未保存，重试会沿用同一事件。');
    }
  }, [drawer, game.pending, game.error, game.busy]);

  // Completion follows the published transaction snapshot, never the stale
  // game object captured before await. Retry uses the original attempt.
  useEffect(() => {
    if (!completion || game.busy || game.pending || game.error || !game.saved) return;
    const {command, before} = completion, after = game.world;
    if (after.revision < before.revision) return;
    const change = gameChangeSummary(before, after);
    setPreview(null); setDrawer(null); setFormError(''); attempt.current = null; setCompletion(null);
    if (['build', 'move', 'place'].includes(command.type)) {
      const id = command.type === 'build' ? after.objects.find(object => !before.objects.some(previous => previous.id === object.id))?.id : command.id;
      setSelectedId(id || null);
      setMessage(command.type === 'build' ? `已建造，消费 ${Math.abs(change.bp)} BP。` : change.changed ? '位置已调整，未消费 BP。' : '位置未变化，未消费 BP。');
    } else {
      setSelectedId(null);
      if (command.type === 'effort') {
        if (!change.changed) {setMessage('这项模拟努力已记录，没有重复奖励。'); return;}
        let text = `模拟努力 +${change.xp} XP · +${change.bp} BP。`;
        if (change.ecologySteps) text += change.natureChanged ? `自然成长 ${change.ecologySteps} 步，${change.natureChanged} 株变化。` : `自然成长 ${change.ecologySteps} 步；空间不足，植物未变化。`;
        if (stageForXP(before.xp).id !== stageForXP(after.xp).id) text += `进入${stageForXP(after.xp).name}，新布置已开放。`;
        setMessage(text); setLabel('');
      } else if (command.type === 'expand') {setMessage(`新土地已开放，消费 ${Math.abs(change.bp)} BP。`); setOverviewToken(value => value + 1);}
      else setMessage('已收纳，可以免费重新摆放。');
    }
  }, [completion, game.world, game.busy, game.pending, game.error, game.saved]);

  const send = async command => {
    if (!canWrite || submitting.current) return false;
    submitting.current = true; attempt.current = {command, before: game.world};
    try {const ok = await game.run(command); if (ok) setCompletion(attempt.current); return ok;}
    finally {submitting.current = false;}
  };
  const retrySave = async () => {
    if (submitting.current || game.busy) return;
    submitting.current = true;
    try {if (await game.retry()) {if (attempt.current) setCompletion(attempt.current); else setMessage('初始世界已可靠保存，可以开始布置。');}}
    finally {submitting.current = false;}
  };
  const clearOperation = () => {
    if (game.busy || submitting.current) return;
    if (game.pending && !game.cancel()) {
      setMessage('保存校验尚未恢复，本次操作已保留。请重试保存，或下载原始记录。');
      return;
    }
    attempt.current = null; setCompletion(null); setPreview(null); setDrawer(null); setSelectedId(null); setFormError(''); setMessage('已取消，世界与资源保持原样。');
  };
  const reload = async () => {
    if (game.busy || submitting.current) return;
    if (await game.reload()) {
      attempt.current = null; setCompletion(null); setPreview(null); setDrawer(null); setSelectedId(null); setFormError('');
      setMessage('已重新读取当前世界。'); setOverviewToken(value => value + 1);
    }
  };
  const downloadRaw = () => {
    if (typeof game.raw !== 'string') return;
    const url = URL.createObjectURL(new Blob([game.raw], {type: 'text/plain;charset=utf-8'})), link = document.createElement('a');
    link.href = url; link.download = 'mingrifu-world-original.txt'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const choose = (assetId, object = null) => {
    if (!canWrite) return;
    setPreview({type: object ? 'place' : 'build', assetId, ...(object ? {id: object.id} : {}), x: null, y: null}); setSelectedId(null); setDrawer(null); setMessage('');
  };
  const expansion = preview?.type === 'expand';
  let placement = null;
  if (preview) {
    if (expansion) {
      if (world.xp < BALANCE.expansion.unlockXP) placement = {ok: false, message: `扩张需要 ${BALANCE.expansion.unlockXP} XP，当前 ${world.xp} XP。`};
      else if (world.bp < BALANCE.expansion.cost) placement = {ok: false, message: `BP 不足，扩张需要 ${BALANCE.expansion.cost} BP。`};
      else if (!candidates.some(chunk => chunk.x === preview.x && chunk.y === preview.y)) placement = {ok: false, message: '选择相邻未开放区域，不能重复购买或跳过土地。'};
      else placement = {ok: true, message: `新增 ${BALANCE.chunkSize}×${BALANCE.chunkSize} 格，原有布置保持原坐标。`};
    } else {
      const asset = ASSETS[preview.assetId];
      if (preview.type === 'build' && world.xp < asset.unlockXP) placement = {ok: false, message: `达到 ${asset.unlockXP} XP 后开放，当前 ${world.xp} XP。`};
      else if (preview.type === 'build' && world.bp < asset.cost) placement = {ok: false, message: `BP 不足：需要 ${asset.cost} BP，当前 ${world.bp} BP。`};
      else if (!Number.isInteger(preview.x) || !Number.isInteger(preview.y)) placement = {ok: false, message: '点地图选择位置，也可以用方向键调整。'};
      else placement = placementCheck(world, preview.assetId, preview.x, preview.y, preview.type === 'build' ? null : preview.id);
    }
  }
  const confirm = () => {
    if (!preview || !placement?.ok || !canWrite) return;
    const command = {...preview}; delete command.assetId; if (preview.type === 'build') command.assetId = preview.assetId;
    send(command);
  };
  const submitEffort = amount => {
    if (!canWrite || submitting.current) return;
    const value = Number(amount), shortLabel = label.trim();
    if (!Number.isSafeInteger(value) || value < BALANCE.effort.minMinutes || value > BALANCE.effort.maxMinutes) {setFormError(`请输入 ${BALANCE.effort.minMinutes}..${BALANCE.effort.maxMinutes} 的整数分钟。`); return;}
    if (shortLabel.length > BALANCE.effort.maxLabelLength) {setFormError(`标签最多 ${BALANCE.effort.maxLabelLength} 个字符。`); return;}
    setFormError('');
    const event = {id: crypto.randomUUID(), source: 'simulation', minutes: value, occurredAt: new Date().toISOString()};
    if (shortLabel) event.label = shortLabel;
    send({type: 'effort', event});
  };
  const saveNotice = game.status === 'loading' ? '正在读取世界…' : game.busy ? game.saved ? '正在保存，旧世界保持不变…' : '正在保存初始世界…' : !game.saved ? '只读预览 · 尚未读取或保存，原始记录保持原样' : game.readonly ? '只读 · 需要重新读取或恢复安全保存能力' : game.pending ? '本次操作尚未保存 · 旧世界保持原样' : '已保存在此浏览器 · 美术候选';
  const nextNames = stage.nextXP === null ? '全部内容已开放' : `${stage.nextXP} XP：${Object.values(ASSETS).filter(asset => asset.unlockXP === stage.nextXP).map(asset => asset.name).join('、')}${BALANCE.expansion.unlockXP === stage.nextXP ? '、土地扩张' : ''}`;
  const retryAllowed = Boolean(game.pending && game.error && !['conflict', 'readonly', 'invalid_json', 'invalid_world', 'unsupported_version', 'save_too_large'].includes(game.error.code));
  return <main className="game-page" data-world-revision={world.revision} data-save-status={game.status} data-saved={game.saved} data-readonly={game.readonly}>
    <header className="game-header"><div><p className="game-eyebrow">明日复 · 我的世界</p><h1>林缘小家</h1></div><div className="game-resources"><output aria-label="永久XP">{world.xp} XP</output><output aria-label="可用BP">{world.bp} BP</output></div></header>
    <div className="game-stage" data-stage={stage.id}><span>{stage.name}</span><progress max={stage.nextXP ? stage.nextXP - stage.unlockXP : 1} value={stage.nextXP ? world.xp - stage.unlockXP : 1} aria-label="成长阶段进度" /><span>{stage.nextXP ? `${world.xp} / ${stage.nextXP} XP` : '全部开放'}</span></div>
    <p className="game-next-unlock">{nextNames}</p><p className="game-save-notice" role="status">{saveNotice}</p>
    {load.status === 'loading' && <section className="game-message" role="status">正在打开小屋的窗…</section>}
    {load.status === 'error' && <section className="game-message" role="alert"><h2>世界素材没有完整加载</h2><p>{load.message}</p><button onClick={() => setAssetRetry(value => value + 1)}>重新加载素材</button></section>}
    {load.status === 'ready' && <WorldCanvas world={world} resources={load.resources} preview={preview} placement={placement} selectedId={selectedId} overviewToken={overviewToken} expansionCandidates={expansion ? candidates : []} onCell={position => {
      if (!canWrite) return;
      const target = expansion ? {x: Math.floor(position.x / BALANCE.chunkSize), y: Math.floor(position.y / BALANCE.chunkSize)} : position;
      setPreview(current => current ? {...current, ...target} : null); setMessage('');
    }} onSelect={object => {if (game.busy || game.pending) return; setSelectedId(object?.id || null); setMessage(object?.kind === 'natural' ? '自然植被会随成长变化，确认建造后可让出空间。' : '');}} onConfirm={confirm} onCancel={clearOperation} />}
    <section className="game-actions" aria-label="世界操作" data-object-id={selected?.id || ''}>
      {game.error && <div className="game-save-error" role="alert"><p>{game.error.message}</p><div className="game-recovery-buttons">{retryAllowed && <button disabled={game.busy} onClick={retrySave}>重试保存</button>}{game.pending && <button disabled={game.busy} onClick={clearOperation}>取消未保存操作</button>}<button disabled={game.busy} onClick={reload}>重新读取</button>{typeof game.raw === 'string' && <button onClick={downloadRaw}>下载原始记录</button>}</div></div>}
      {preview ? <><div className="game-operation-title"><strong>{expansion ? '扩张土地' : ASSETS[preview.assetId].name}</strong><span>{expansion ? `${BALANCE.expansion.cost} BP` : preview.type === 'build' ? `${ASSETS[preview.assetId].cost} BP` : '0 BP · 免费'}{Number.isInteger(preview.x) ? ` · (${preview.x}, ${preview.y})` : ''}</span></div>
        {expansion && <div className="game-frontier-list" aria-label="相邻扩张区域">{candidates.map(chunk => <button key={`${chunk.x},${chunk.y}`} disabled={!canWrite} aria-label={`选择${directionName(chunk, world.chunks)}区域 (${chunk.x},${chunk.y})`} aria-pressed={chunk.x === preview.x && chunk.y === preview.y} onClick={() => {setPreview({...preview, x: chunk.x, y: chunk.y}); setMessage('');}}>{directionName(chunk, world.chunks)}<small>({chunk.x},{chunk.y})</small></button>)}</div>}
        <p className={placement.ok ? 'game-operation-message' : 'game-operation-message game-operation-error'} role="status">{message || placement.message}</p><div className="game-action-buttons"><button className="game-primary" disabled={!placement.ok || !canWrite} onClick={confirm}>{expansion ? '确认扩张' : preview.type === 'build' ? '确认建造' : '确认位置'}</button><button disabled={game.busy} onClick={clearOperation}>取消</button></div></>
      : selected ? <><div className="game-operation-title"><strong>{ASSETS[selected.asset].name}</strong><span>{artificial ? '移动、收纳、重摆免费' : '自然植被'}</span></div><p className="game-operation-message" role="status">{message || '已选中，可随时调整自己的布置。'}</p><div className="game-action-buttons">{artificial && <><button className="game-primary" disabled={!canWrite} onClick={() => {setPreview({type: 'move', id: selected.id, assetId: selected.asset, x: selected.x, y: selected.y}); setMessage('');}}>移动</button><button disabled={!canWrite} onClick={() => send({type: 'store', id: selected.id})}>收纳</button></>}<button disabled={game.busy} onClick={clearOperation}>取消选择</button></div></>
      : <><div className="game-operation-title"><strong>布置自己的世界</strong><span>{stored.length ? `收纳 ${stored.length} 件` : '可随时调整'}</span></div><p className="game-operation-message" role="status">{message}</p><div className="game-action-buttons game-main-buttons"><button className="game-primary" aria-label="记录模拟努力" disabled={!canWrite} onClick={() => {setDrawer('effort'); setFormError('');}}>模拟努力</button><button disabled={!canWrite} onClick={() => setDrawer('build')}>建造</button><button disabled={!canWrite} onClick={() => {setPreview({type: 'expand', x: null, y: null}); setMessage('');}}>扩张</button><button aria-label={`收纳盒${stored.length ? ` (${stored.length})` : ''}`} disabled={!canWrite} onClick={() => setDrawer('stored')}>收纳</button></div></>}
    </section>
    {drawer && <><button className="game-drawer-backdrop" disabled={game.busy} aria-label="关闭目录" onClick={() => setDrawer(null)} /><section className="game-drawer" role="dialog" aria-modal="true" aria-label={drawer === 'effort' ? '记录模拟努力' : drawer === 'build' ? '建造目录' : '收纳盒'}><header><h2>{drawer === 'effort' ? '让努力成为积累' : drawer === 'build' ? '选择一件，放进世界' : '免费重新摆放'}</h2><button disabled={game.busy} aria-label="关闭抽屉" onClick={() => setDrawer(null)}>×</button></header><div className="game-catalog">
      {drawer === 'effort' ? <><p className="game-effort-note">模拟努力 · 不连接明日复正式任务。永久 XP 不消费，BP 用于首次建造和扩张。</p><label className="game-field">标签（可选）<input aria-label="模拟努力标签" value={label} maxLength={BALANCE.effort.maxLabelLength} disabled={!canWrite} onChange={event => setLabel(event.target.value)} placeholder="例如：阅读、运动" /></label><div className="game-effort-presets">{BALANCE.effort.presets.map(value => <button key={value} disabled={!canWrite} onClick={() => submitEffort(value)}>{value} 分钟</button>)}</div><form className="game-effort-form" onSubmit={event => {event.preventDefault(); submitEffort(minutes);}}><label className="game-field">自定义分钟<input aria-label="自定义努力分钟" type="number" inputMode="numeric" min={BALANCE.effort.minMinutes} max={BALANCE.effort.maxMinutes} step="1" required value={minutes} disabled={!canWrite} onChange={event => setMinutes(event.target.value)} /></label><button className="game-primary" disabled={!canWrite} type="submit">记录自定义努力</button></form>{formError && <p className="game-form-error" role="alert">{formError}</p>}{game.pending && <p className="game-effort-note">当前努力尚未保存，原事件已保留。请使用下方重试或取消。</p>}<section className="game-effort-history" aria-label="最近模拟努力"><h3>最近模拟努力</h3>{world.efforts.length ? <ol>{world.efforts.slice(-5).reverse().map(event => <li key={event.id}><strong>{event.label || '模拟努力'}</strong><span>{event.minutes} 分钟 · {new Date(event.occurredAt).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span></li>)}</ol> : <p>还没有记录。每一点积累都会保留。</p>}</section></>
      : drawer === 'build' ? Object.values(ASSETS).map(asset => <button key={asset.id} className="game-catalog-item" aria-label={`选择${asset.name}`} onClick={() => choose(asset.id)}><img src={load.resources.manifest.assets.find(item => item.id === asset.id).png} alt="" /><span><strong>{asset.name}</strong><small>{asset.cost} BP · {asset.footprint.join('×')} 格</small><small>{world.xp < asset.unlockXP ? `${asset.unlockXP} XP 开放` : '已开放'}</small></span></button>) : stored.length ? stored.map(object => <button key={object.id} className="game-catalog-item" data-object-id={object.id} aria-label={`重新摆放${ASSETS[object.asset].name}`} onClick={() => choose(object.asset, object)}><img src={load.resources.manifest.assets.find(asset => asset.id === object.asset).png} alt="" /><span><strong>{ASSETS[object.asset].name}</strong><small>0 BP · 免费重摆</small></span></button>) : <p className="game-empty">收纳盒是空的。选中世界里的物件后，可以免费收纳。</p>}
    </div></section></>}
  </main>;
}

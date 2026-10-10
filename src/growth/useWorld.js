import { useEffect, useRef, useState } from 'react';
import { applyWorldCommand, createWorld } from './world.js';
import { loadWorld, saveWorld, STORAGE_KEY } from './persistence.js';

export function useWorld() {
  const [initial] = useState(() => {
    try { return { ...loadWorld(window.localStorage), blocked: false, error: '' }; }
    catch (error) { return { world: createWorld(), token: null, blocked: true, error: error.message }; }
  });
  const [world, setWorld] = useState(initial.world), [error, setError] = useState(initial.error), [blocked, setBlocked] = useState(initial.blocked), [pending, setPending] = useState(null);
  const current = useRef(initial.world), token = useRef(initial.token);
  const commit = next => {
    try {
      token.current = saveWorld(window.localStorage, next, token.current);
      current.current = next; setWorld(next); setError(''); setPending(null);
      return next;
    } catch (problem) {
      setError(`保存失败，本次变化未生效。${problem.message}`); setPending(next); return null;
    }
  };
  const execute = command => {
    if (blocked || pending) return null;
    try { return commit(applyWorldCommand(current.current, command)); }
    catch (problem) { setError(problem.message); return null; }
  };
  const reload = () => {
    try {
      const saved = loadWorld(window.localStorage);
      current.current = saved.world; token.current = saved.token; setWorld(saved.world); setBlocked(false); setError(''); setPending(null); return true;
    } catch (problem) { setBlocked(true); setError(problem.message); return false; }
  };
  useEffect(() => {
    const changed = event => {
      if (event.storageArea === window.localStorage && (event.key === STORAGE_KEY || event.key === null)) {
        setBlocked(true); setError('另一页面已更新存档，请重新读取后继续。');
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return { world, error, blocked, pending, execute, reload, retry: () => pending && !blocked ? commit(pending) : null, dismissPending: () => { setPending(null); setError(''); } };
}

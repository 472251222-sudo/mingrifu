import {useEffect, useRef, useSyncExternalStore} from 'react';
import {createGameWorldController} from './persistence.js';

// The controller owns the synchronous busy guard and saved token, independent
// of React render timing. StrictMode effect replay reuses one initialization.
export function useGameWorld() {
  const controller = useRef(null);
  if (!controller.current) controller.current = createGameWorldController();
  const game = controller.current;
  const snapshot = useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
  useEffect(() => { game.initialize(); }, [game]);
  return {...snapshot, run: game.run, retry: game.retry, cancel: game.cancel, reload: game.reload};
}

export default useGameWorld;

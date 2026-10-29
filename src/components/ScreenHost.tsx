import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { initializeLegacy } from '../legacy/app';
import type { LegacyMount, ScreenId, ScreenContext } from '../types/legacy';
import { Screen } from './Screens';

/** Owns the native React screen lifecycle; controller actions request redraws. */
export function ScreenHost() {
  const [current, setCurrent] = useState<{ id: ScreenId; context: ScreenContext; version: number } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const mount: LegacyMount = (id, context, afterCommit) => {
      // Old page handlers expect a completed DOM immediately after render().
      flushSync(() => setCurrent(previous => ({ id, context, version: (previous?.version ?? 0) + 1 })));
      afterCommit?.();
    };

    // Initialization triggers its first render; queue outside the React effect
    // to keep the synchronous legacy commit free of React lifecycle warnings.
    queueMicrotask(() => {
      if (!disposed) cleanup = initializeLegacy(mount);
    });
    return () => {
      disposed = true;
      cleanup?.();
      started.current = false;
    };
  }, []);

  return <div id="legacy-screen">{current && <Screen key={current.version} id={current.id} context={current.context} />}</div>;
}

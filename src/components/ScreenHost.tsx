import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { initializeStudioController } from '../state/studioController';
import type { StudioMount, ScreenId, ScreenContext } from '../types/screen';
import { Screen } from './Screens';
import { StudioModal, type DialogModel } from './StudioModals';

/** Owns the native React screen lifecycle; controller actions request redraws. */
export function ScreenHost() {
  const [current, setCurrent] = useState<{ id: ScreenId; context: ScreenContext; version: number } | null>(null);
  const [dialog, setDialog] = useState<DialogModel | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const mount: StudioMount = (id, context, afterCommit) => {
      // Controller actions expose the updated React UI synchronously.
      flushSync(() => setCurrent(previous => ({ id, context, version: (previous?.version ?? 0) + 1 })));
      afterCommit?.();
    };

    // Initialization triggers its first render; queue outside the React effect
    // to keep the synchronous commit free of React lifecycle warnings.
    queueMicrotask(() => {
      if (!disposed) cleanup = initializeStudioController(mount);
    });
    return () => {
      disposed = true;
      cleanup?.();
      started.current = false;
    };
  }, []);

  useEffect(() => {
    const listener = (event: Event) => flushSync(() => setDialog((event as CustomEvent<DialogModel | null>).detail));
    window.addEventListener('studio-dialog', listener);
    return () => window.removeEventListener('studio-dialog', listener);
  }, []);

  return <div id="studio-screen">{current && <Screen key={`${current.id}:${current.context.taskId || ''}`} id={current.id} context={current.context} />}{dialog && <StudioModal key={dialog.type} model={dialog} />}</div>;
}

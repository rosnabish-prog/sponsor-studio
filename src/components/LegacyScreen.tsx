import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { initializeLegacy } from '../legacy/app';
import type { LegacyMount } from '../types/legacy';

/**
 * React owns the screen's lifecycle while the original HTML generators remain
 * temporarily intact. This preserves the exact DOM/CSS of the existing studio.
 * Future screens can be replaced one at a time with native JSX components.
 */
export function LegacyScreen() {
  const [markup, setMarkup] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const mount: LegacyMount = (nextMarkup, afterCommit) => {
      // Old page handlers expect a completed DOM immediately after render().
      flushSync(() => setMarkup(nextMarkup));
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

  return <div id="legacy-screen" dangerouslySetInnerHTML={{ __html: markup }} />;
}

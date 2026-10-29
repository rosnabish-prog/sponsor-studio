import { ScreenHost } from './components/ScreenHost';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** Persistent overlays and video input are mounted once across every screen. */
export default function App() {
  const [toast, setToast] = useState('');
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onToast = (event: Event) => {
      flushSync(() => setToast((event as CustomEvent<string>).detail));
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setToast(''), 3200);
    };
    window.addEventListener('studio-toast', onToast);
    return () => { window.removeEventListener('studio-toast', onToast); if (timeout) clearTimeout(timeout); };
  }, []);
  return (
    <>
      <ScreenHost />
      <div id="toast" className={`toast ${toast ? '' : 'hidden'}`} role="status" aria-live="polite" aria-atomic="true">{toast}</div>
      <input
        id="videofile"
        type="file"
        accept="video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi"
        aria-label="Choose a local video for the current match"
        hidden
      />
    </>
  );
}

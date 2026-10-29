import { LegacyScreen } from './components/LegacyScreen';

/** Persistent overlays and video input are mounted once across every screen. */
export default function App() {
  return (
    <>
      <LegacyScreen />
      <div id="toast" className="toast hidden" role="status" aria-live="polite" aria-atomic="true" />
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

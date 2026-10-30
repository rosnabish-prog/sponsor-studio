/**
 * Space controls video playback even when a tagging button has keyboard focus.
 * Browsers activate focused buttons on Space keyup, so both phases must cancel
 * their native defaults or a pause may also toggle/delete an annotation.
 */
export function captureStudioSpacebar(event: KeyboardEvent, enabled: boolean, togglePlayback: () => void): boolean {
  if (!enabled || (event.code !== 'Space' && event.key !== ' ')) return false;
  const target = event.target;
  if (target instanceof Element && target.closest('input,textarea,select,[contenteditable],[role="dialog"]')) return false;

  event.preventDefault();
  event.stopPropagation();
  if (event.type === 'keydown' && !event.repeat) {
    togglePlayback();
  }
  return true;
}

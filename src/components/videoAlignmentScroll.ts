/**
 * Give the video and sponsor rail a shared visual starting line. The match
 * heading belongs to the left column, so the first downward scroll reaches
 * the video before the rest of the tagging tools. Pause briefly at that
 * alignment point, then let subsequent wheel travel continue normally.
 *
 * The listener belongs only to the left column: the sponsor rail keeps its
 * own independent scroll position and all other screens are unaffected.
 */
export function attachVideoAlignmentPause(
  column: HTMLElement,
  video: HTMLElement,
  isDesktop = () => window.matchMedia?.('(min-width: 900px)').matches ?? window.innerWidth >= 900,
): () => void {
  const pauseDistance = 140;
  let remainingPause = 0;
  let alignmentTarget: number | null = null;

  const onWheel = (event: WheelEvent) => {
    if (!isDesktop() || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      remainingPause = 0;
      alignmentTarget = null;
      return;
    }

    // Negative movement should immediately allow returning to the match title.
    if (event.deltaY <= 0) {
      remainingPause = 0;
      alignmentTarget = null;
      return;
    }

    // Respect native scrolling on form controls inside the studio.
    if ((event.target as Element | null)?.closest?.('select, textarea, input')) return;

    const amount = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? column.clientHeight : 1);
    const maxScroll = column.scrollHeight - column.clientHeight;
    const target = Math.max(0, column.scrollTop + video.getBoundingClientRect().top - column.getBoundingClientRect().top);
    if (target <= 1 || target >= maxScroll) return;

    if (alignmentTarget !== null) {
      // Re-layout or another navigation method may have changed the position.
      if (Math.abs(target - alignmentTarget) > 3 || Math.abs(column.scrollTop - target) > 3) {
        remainingPause = 0;
        alignmentTarget = null;
      } else {
        event.preventDefault();
        remainingPause -= amount;
        if (remainingPause <= 0) {
          column.scrollTop = Math.min(maxScroll, target - remainingPause);
          alignmentTarget = null;
          remainingPause = 0;
        }
        return;
      }
    }

    if (column.scrollTop < target && column.scrollTop + amount >= target) {
      event.preventDefault();
      column.scrollTop = target;
      alignmentTarget = target;
      remainingPause = pauseDistance;
    }
  };

  column.addEventListener('wheel', onWheel, { passive: false });
  return () => column.removeEventListener('wheel', onWheel);
}

import type { AnnotationBase, TaskSummary } from '../types/models';

export const MAX_REVIEW_GAP_SECONDS = 150;

/** A coverage estimate from manually recorded intervals, never playback position.
 * Short unmarked stretches (at most 2.5 minutes) between tagged intervals are
 * counted; longer stretches remain unreviewed. Sparse events are excluded.
 */
export function measuredCoverage(rows: AnnotationBase[], duration: number, gapSeconds = MAX_REVIEW_GAP_SECONDS) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const intervals = rows.filter(row => row.end != null && row.end > row.start)
    .map(row => [Math.max(0, Math.min(duration, row.start)), Math.max(0, Math.min(duration, row.end!))] as const)
    .filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  if (!intervals.length) return 0;
  let [start, end] = [...intervals[0]];
  let total = 0;
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart - end <= gapSeconds) end = Math.max(end, nextEnd);
    else { total += end - start; start = nextStart; end = nextEnd; }
  }
  total += end - start;
  // Do not extrapolate before the first tag or after the last tag; there is
  // no second annotation proving those edge windows were reviewed.
  return Math.max(0, Math.min(duration, total));
}

export function labelingProgress(task: TaskSummary) {
  const duration = task.duration || 0;
  const sponsorSeconds = measuredCoverage(task.sponsors, duration);
  const cameraSeconds = measuredCoverage(task.cameras, duration);
  const hasSponsors = task.sponsorGroupIds.length > 0;
  const hasCameras = task.cameraGroupIds.length > 0;
  const percent = (n: number) => duration > 0 ? Math.round(1000 * n / duration) / 10 : 0;
  const measurable = [hasSponsors ? sponsorSeconds : null, hasCameras ? cameraSeconds : null].filter((n): n is number => n !== null);
  return {
    percent: measurable.length ? Math.round(measurable.reduce((sum, n) => sum + n, 0) / measurable.length / duration * 1000) / 10 || 0 : 0,
    sponsorPercent: percent(sponsorSeconds), cameraPercent: percent(cameraSeconds),
    sponsorSeconds, cameraSeconds, eventCount: task.events.length,
    hasSponsors, hasCameras, hasMoments: task.eventGroupIds.length > 0,
    submitted: !!task.submitted.sponsors && !!task.submitted.context,
  };
}

export function annotatedEndpoint(task: TaskSummary, tick = 0) {
  const entries = [...task.sponsors, ...task.events, ...task.cameras];
  return Math.max(0, ...entries.map(row => row.end == null ? Math.max(row.start, tick) : row.end));
}

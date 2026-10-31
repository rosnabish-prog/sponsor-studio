import type { CameraAnnotation } from '../types/models';

const SAME_TIME_TOLERANCE = 0.2;

/**
 * Exactly one camera interval may be live. Selecting another camera closes the
 * previous interval at the playhead and starts the next at that same time.
 * A switch at the same timestamp discards the previous zero-length interval.
 */
export function selectCameraAngle(
  rows: CameraAnnotation[], cameraId: string, at: number,
  author: string, createdAt: string, makeId: () => string,
): { rows: CameraAnnotation[]; action: 'started' | 'switched' | 'stopped' | 'cancelled' } {
  const active = rows.filter(row => row.end === null);
  const selectedIsLive = active.some(row => row.cameraId === cameraId);
  const next = rows.flatMap(row => {
    if (row.end !== null) return [row];
    // Never create a zero- or negative-duration saved camera interval.
    if (at - row.start <= SAME_TIME_TOLERANCE) return [];
    return [{ ...row, end: at }];
  });
  if (selectedIsLive) {
    return { rows: next, action: active.some(row => row.cameraId === cameraId && at - row.start <= SAME_TIME_TOLERANCE) ? 'cancelled' : 'stopped' };
  }
  next.push({ id: makeId(), cameraId, start: at, end: null, createdBy: author, createdAt });
  return { rows: next, action: active.length ? 'switched' : 'started' };
}

/** True when restarting a camera at this time would overwrite recorded footage. */
export function hasRecordedCameraAfter(rows: CameraAnnotation[], at: number): boolean {
  return rows.some(row => row.end !== null && row.end > at);
}

export function nextSavedCameraStart(rows: CameraAnnotation[], after: number): number | null {
  const starts = rows.filter(row => row.end !== null && row.start > after).map(row => row.start);
  return starts.length ? Math.min(...starts) : null;
}

/**
 * Re-tag camera footage from a historical playhead, after explicit confirmation.
 * Re-tag only the saved interval intersecting the playhead. All other saved
 * intervals — including later footage — remain untouched. Existing saved
 * rows are never reopened (the API correctly forbids that).
 */
export function resumeCameraFromTimestamp(
  rows: CameraAnnotation[], cameraId: string, at: number,
  author: string, createdAt: string, makeId: () => string,
): { rows: CameraAnnotation[]; removed: number; trimmed: number } {
  // Never discard another worker's currently LIVE camera interval.
  if (rows.some(row => row.end === null)) return { rows, removed: 0, trimmed: 0 };
  const crossing = rows.find(row => row.end !== null && row.start <= at && at < row.end);
  const next = rows.filter(row => row !== crossing);
  const removed = crossing && at <= crossing.start ? 1 : 0;
  const trimmed = crossing && at > crossing.start ? 1 : 0;
  if (crossing && at > crossing.start) next.push({ ...crossing, end: at });
  next.push({ id: makeId(), cameraId, start: at, end: null, createdBy: author, createdAt });
  return { rows: next, removed, trimmed };
}

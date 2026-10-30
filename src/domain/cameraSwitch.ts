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

/**
 * Re-tag camera footage from a historical playhead, after explicit confirmation.
 * Retain complete history before the playhead, truncate the interval crossing it,
 * and remove future camera intervals so the new live tag never overlaps old ones.
 * Existing saved rows are never reopened (the API correctly forbids that).
 */
export function resumeCameraFromTimestamp(
  rows: CameraAnnotation[], cameraId: string, at: number,
  author: string, createdAt: string, makeId: () => string,
): { rows: CameraAnnotation[]; removed: number; trimmed: number } {
  let removed = 0;
  let trimmed = 0;
  const next: CameraAnnotation[] = [];
  for (const row of rows) {
    if (row.end !== null && row.end <= at) {
      next.push(row);
    } else if (row.start < at - SAME_TIME_TOLERANCE) {
      next.push({ ...row, end: at });
      trimmed++;
    } else {
      removed++;
    }
  }
  next.push({ id: makeId(), cameraId, start: at, end: null, createdBy: author, createdAt });
  return { rows: next, removed, trimmed };
}

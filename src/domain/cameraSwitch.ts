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

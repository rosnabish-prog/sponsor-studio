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
): { rows: CameraAnnotation[]; action: 'started' | 'switched' | 'stopped' | 'cancelled' | 'conflict' } {
  const active = rows.filter(row => row.end === null);
  // Never silently erase multiple LIVE rows or a future LIVE annotation. Such
  // data needs a reviewed repair, not another optimistic local toggle.
  if (active.length > 1 || active.some(row => row.start > at) || cameraOverlaps(rows).length) {
    return { rows, action: 'conflict' };
  }
  if (rows.some(row => row.end !== null && row.start <= at && at < row.end)) {
    return { rows, action: 'conflict' };
  }
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

/** One camera at any video timestamp, whether saved or LIVE. */
export function cameraOverlaps(rows: CameraAnnotation[]) {
  const ordered = [...rows].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const conflicts: { firstId: string; secondId: string; start: number; end: number | null }[] = [];
  for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
    const a = ordered[i], b = ordered[j];
    if (b.start >= (a.end ?? Infinity)) break;
    const end = Math.min(a.end ?? Infinity, b.end ?? Infinity);
    if (end > b.start) conflicts.push({ firstId: a.id, secondId: b.id, start: b.start, end: Number.isFinite(end) ? end : null });
  }
  return conflicts;
}

/**
 * Re-tag saved footage as a NEW camera segment. The old angle stops exactly
 * where the new one starts; its unconfirmed tail does not silently resume.
 * Later independent annotations remain untouched. The new end is bounded by
 * the next saved camera start so the edit cannot overwrite later work.
 */
export function retagSavedCamera(
  rows: CameraAnnotation[], savedId: string, cameraId: string, at: number, requestedEnd: number,
  author: string, createdAt: string, makeId: () => string,
): { rows: CameraAnnotation[]; end: number } | null {
  const selected = rows.find(row => row.id === savedId && row.end !== null && row.start <= at && at < row.end);
  if (!selected || requestedEnd - at <= SAME_TIME_TOLERANCE || cameraOverlaps(rows).length) return null;
  const following = rows.filter(row => row.id !== savedId && row.start > at).map(row => row.start);
  const end = Math.min(requestedEnd, ...following);
  if (end - at <= SAME_TIME_TOLERANCE) return null;
  if (rows.some(row => row.id !== savedId && row.start < end && (row.end === null || row.end > at))) return null;
  const remaining = rows.flatMap(row => row.id !== savedId ? [row] :
    at - row.start > SAME_TIME_TOLERANCE ? [{ ...row, end: at }] : []);
  return { rows: [...remaining, { id: makeId(), cameraId, start: at, end, createdBy: author, createdAt }], end };
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
  // Legacy path: no open-ended camera may be created before later saved
  // footage. Use the bounded retagSavedCamera() flow instead.
  if (rows.some(row => row.end === null) || cameraOverlaps(rows).length || rows.some(row=>row.start>at))
    return { rows, removed: 0, trimmed: 0 };
  const crossing = rows.find(row => row.end !== null && row.start <= at && at < row.end);
  const next = rows.filter(row => row !== crossing);
  const removed = crossing && at <= crossing.start ? 1 : 0;
  const trimmed = crossing && at > crossing.start ? 1 : 0;
  if (crossing && at > crossing.start) next.push({ ...crossing, end: at });
  next.push({ id: makeId(), cameraId, start: at, end: null, createdBy: author, createdAt });
  return { rows: next, removed, trimmed };
}

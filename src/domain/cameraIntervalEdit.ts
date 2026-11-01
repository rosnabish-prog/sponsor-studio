import type { CameraAnnotation } from '../types/models';

const EPSILON = 0.001;

/**
 * A camera correction operates on one saved ID. A directly touching or
 * overlapping interval of the SAME angle may be coalesced into that ID.
 * Other camera angles and annotations on other tracks are never changed.
 *
 * Merging at most one neighbour per edit respects the sync layer's single-ID
 * deletion guard. Longer chains must be reviewed as separate edits.
 */
export function editRecordedCamera(
  rows: CameraAnnotation[], id: string, start: number, end: number, cameraId?: string,
): { status: 'unchanged' | 'updated' | 'conflict' | 'missing' | 'too-many-merges'; rows: CameraAnnotation[] } {
  const selected = rows.find(row => row.id === id && row.end !== null);
  if (!selected) return { status: 'missing', rows };
  const nextId = cameraId || selected.cameraId;
  if (start === selected.start && end === selected.end && nextId === selected.cameraId) {
    return { status: 'unchanged', rows };
  }
  const overlaps = rows.filter(row => row.id !== id && row.end !== null &&
    row.start < end - EPSILON && row.end > start + EPSILON);
  if (overlaps.some(row => row.cameraId !== nextId)) return { status: 'conflict', rows };
  // Adjacent segments with the same angle are also continuous and mergeable.
  const mergeable = rows.filter(row => row.id !== id && row.end !== null && row.cameraId === nextId &&
    row.start <= end + EPSILON && row.end >= start - EPSILON);
  if (mergeable.length > 1) return { status: 'too-many-merges', rows };
  const partner = mergeable[0];
  const edited = { ...selected, cameraId: nextId,
    start: partner ? Math.min(start, partner.start) : start,
    end: partner ? Math.max(end, partner.end!) : end };
  // Check the fully merged bounds against different angles as well.
  if (rows.some(row => row.id !== id && row.id !== partner?.id && row.end !== null &&
    row.cameraId !== nextId && row.start < edited.end - EPSILON && row.end > edited.start + EPSILON)) {
    return { status: 'conflict', rows };
  }
  return { status: 'updated', rows: rows.filter(row => row.id !== partner?.id).map(row => row.id === id ? edited : row) };
}

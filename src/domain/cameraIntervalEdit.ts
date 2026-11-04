import type { CameraAnnotation } from '../types/models';

const EPSILON = 0.001;

/**
 * Camera edits are isolated to one saved ID. Adjacent records are retained
 * separately to protect annotation history and to avoid intermediate database
 * overlap violations while syncing the edited interval.
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
  if (overlaps.length || rows.some(row=>row.id!==id&&row.end===null&&row.start<end-EPSILON))
    return { status: 'conflict', rows };
  const edited = { ...selected, cameraId: nextId, start, end };
  return { status: 'updated', rows: rows.map(row => row.id === id ? edited : row) };
}

import type { AnnotationBase, CameraAnnotation, EventAnnotation, SponsorAnnotation, TaskSummary } from '../types/models';

export type AnnotationTrack = 'sponsors' | 'events' | 'cameras';
export type UndoRow = SponsorAnnotation | EventAnnotation | CameraAnnotation;
export type UndoChange = { track: AnnotationTrack; id: string; before: UndoRow | null; after: UndoRow | null };
export type AnnotationSnapshot = Record<AnnotationTrack, UndoRow[]>;

const tracks: AnnotationTrack[] = ['sponsors', 'events', 'cameras'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function snapshotAnnotations(task: TaskSummary): AnnotationSnapshot {
  return {
    sponsors: clone(task.sponsors) as UndoRow[],
    events: clone(task.events) as UndoRow[],
    cameras: clone(task.cameras) as UndoRow[],
  };
}

/** Diff by immutable annotation ID, never by timestamps or a whole timeline. */
export function annotationChanges(before: AnnotationSnapshot, after: AnnotationSnapshot): UndoChange[] {
  const result: UndoChange[] = [];
  for (const track of tracks) {
    const left = new Map(before[track].map(row => [row.id, row]));
    const right = new Map(after[track].map(row => [row.id, row]));
    for (const id of new Set([...left.keys(), ...right.keys()])) {
      const prior = left.get(id) || null;
      const next = right.get(id) || null;
      if (JSON.stringify(prior) !== JSON.stringify(next)) result.push({ track, id, before: prior, after: next });
    }
  }
  return result;
}

/** Server revision counters may advance without changing the visible interval. */
export function sameAnnotationContent(a: UndoRow | null, b: UndoRow | null) {
  if (!a || !b) return a === b;
 const content = (row: UndoRow) => ({
  id:row.id,start:row.start,end:row.end,
  labelId:'sponsorId' in row?row.sponsorId:'eventId' in row?row.eventId:row.cameraId,
  placement:'placement' in row?row.placement??null:null,
  quality:'quality' in row?row.quality??null:null,
  properties:'properties' in row?row.properties??{}:{},
 });
 return JSON.stringify(content(a)) === JSON.stringify(content(b));
}

export function serverSnapshotMatchesRow(snapshot: {
  labelId:string;start:number;end:number|null;placement:string|null;quality:string|null;properties?:Record<string,string>;
},row:UndoRow) {
 const labelId='sponsorId' in row?row.sponsorId:'eventId' in row?row.eventId:row.cameraId;
 return snapshot.labelId===labelId&&snapshot.start===row.start&&snapshot.end===row.end&&
  snapshot.placement===('placement' in row?row.placement??null:null)&&
  snapshot.quality===('quality' in row?row.quality??null:null)&&
  JSON.stringify(snapshot.properties??{})===JSON.stringify('properties' in row?row.properties??{}:{});
}

export function lastAnnotatedTimestamp(task: TaskSummary): number | null {
  const rows = [...task.sponsors, ...task.events, ...task.cameras];
  if (!rows.length) return null;
  return Math.max(...rows.map(row => row.end ?? row.start));
}

/** A new gap interval stops at the next independently saved or LIVE appearance. */
export function nextBoundary(rows: AnnotationBase[], start: number): number | null {
  const starts = rows.filter(row => row.start > start).map(row => row.start);
  return starts.length ? Math.min(...starts) : null;
}

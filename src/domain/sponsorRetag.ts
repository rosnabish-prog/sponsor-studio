import type { SponsorAnnotation } from '../types/models';

/** Split the selected saved exposure at the playhead and start a fresh live tag. */
export function retagSponsorFromTimestamp(
  rows: SponsorAnnotation[], savedId: string, at: number,
  author: string, createdAt: string, makeId: () => string,
): SponsorAnnotation[] | null {
  const saved = rows.find(row => row.id === savedId);
  if (!saved || saved.end === null || !Number.isFinite(at) || at < saved.start || at >= saved.end) return null;
  if (rows.some(row => row.sponsorId === saved.sponsorId && row.end === null)) return null;
  const next = rows.filter(row => row.id !== savedId);
  if (at > saved.start) next.push({ ...saved, end: at });
  next.push({
    id: makeId(), sponsorId: saved.sponsorId, start: at, end: null,
    createdBy: author, createdAt, placement: saved.placement, quality: saved.quality,
  });
  return next;
}

/** A new live retag cannot cover a later, already-saved exposure of that sponsor. */
export function nextSavedSponsorStart(rows: SponsorAnnotation[], sponsorId: string, after: number): number | null {
  const future = rows.filter(row => row.sponsorId === sponsorId && row.end !== null && row.start > after)
    .map(row => row.start);
  return future.length ? Math.min(...future) : null;
}

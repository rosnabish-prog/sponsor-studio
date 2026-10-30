import type { Sponsor, TaskSummary, TagAttribute } from '../types/models';
import { mergeIntervals, intervalOverlap } from './intervals';
import { PLACEMENT_TYPES, VISIBILITY_QUALITIES } from './classifications';

export type Span = { start: number; end: number };
type Label = Sponsor & { groupName?: string };
type WithName = TagAttribute;
export interface InsightSources {
  sponsors: Label[];
  events: WithName[];
  cameras: WithName[];
}

export function computeInsights(task: TaskSummary, source: InsightSources) {
  const videoSeconds = Math.max(1, Number(task.duration) || 3600);
  const annotations = [...task.sponsors, ...task.events, ...task.cameras];
  const endpoint = Math.min(videoSeconds, Math.max(0, Number(task.observedTime) || 0, ...annotations.map(a => Number(a.end == null ? a.start : a.end) || 0)));
  const clampTime = (value: number) => Math.max(0, Math.min(videoSeconds, Number(value) || 0));
  const span = (annotation: { start: number; end: number | null }): Span => ({ start: clampTime(annotation.start), end: clampTime(annotation.end == null ? endpoint : annotation.end) });
  const spans = (rows: { start: number; end: number | null }[]) => rows.map(span).filter(row => row.end > row.start);
  const length = (rows: Span[]) => rows.reduce((sum, row) => sum + row.end - row.start, 0);
  const pct = (value: number, total: number) => total > 0 ? 100 * value / total : 0;
  const union = (rows: Span[]) => mergeIntervals(rows);
  const brands = source.sponsors.map(sponsor => {
    const rows = task.sponsors.filter(a => a.sponsorId === sponsor.id);
    const own = union(spans(rows));
    const seconds = length(own);
    const eventHits = task.events.filter(event => {
      if (event.kind === 'point' && event.end === event.start) return own.some(w => event.start >= w.start && event.start < w.end);
      return spans([event]).some(e => own.some(w => intervalOverlap(e, w) > 0));
    }).length;
    return { ...sponsor, own, seconds, entries: rows.length, segments: own.length,
      longest: Math.max(0, ...own.map(w => w.end - w.start)), first: own.length ? own[0].start : null, eventHits };
  }).sort((a, b) => b.seconds - a.seconds);
  const active = brands.filter(b => b.seconds > 0);
  const sumSeconds = brands.reduce((n, b) => n + b.seconds, 0);
  const anySponsor = union(brands.flatMap(b => b.own));
  const coveredSeconds = length(anySponsor);
  const cameras = source.cameras.map(camera => {
    const windows = union(spans(task.cameras.filter(a => a.cameraId === camera.id)));
    const seconds = length(windows);
    const sponsors = brands.map(brand => ({ id: brand.id, name: brand.name,
      seconds: length(union(brand.own.flatMap(a => windows.map(w => ({ start: Math.max(a.start, w.start), end: Math.min(a.end, w.end) })).filter(w => w.end > w.start)))) }));
    return { id: camera.id, name: camera.name, seconds, sponsorSeconds: sponsors.reduce((n, b) => n + b.seconds, 0),
      sponsorCount: sponsors.filter(b => b.seconds > 0).length, leader: sponsors.sort((a, b) => b.seconds - a.seconds)[0] };
  }).sort((a, b) => b.seconds - a.seconds);
  const cameraCovered = length(union(spans(task.cameras)));
  const eventRows = task.events.map(event => {
    const legacyPoint = event.kind === 'point' && event.start === event.end;
    const window = span(event);
    const valid = window.end > window.start;
    const brandMatches = brands.map(brand => {
      const seconds = legacyPoint ? 0 : valid ? length(brand.own.map(own => ({ start: Math.max(window.start, own.start), end: Math.min(window.end, own.end) })).filter(w => w.end > w.start)) : 0;
      const hit = legacyPoint ? brand.own.some(own => event.start >= own.start && event.start < own.end) : seconds > 0;
      return { id: brand.id, name: brand.name, seconds, hit };
    }).filter(brand => brand.hit);
    const covered = valid ? length(union(anySponsor.map(own => ({ start: Math.max(window.start, own.start), end: Math.min(window.end, own.end) })).filter(w => w.end > w.start))) : 0;
    return { id: event.id, eventId: event.eventId, name: source.events.find(item => item.id === event.eventId)?.name || event.eventId,
      start: window.start, end: window.end, duration: Math.max(0, window.end - window.start), open: event.end == null,
      legacyPoint, brands: brandMatches, coverageSeconds: covered, coveragePct: valid ? pct(covered, window.end - window.start) : 0 };
  }).sort((a, b) => a.start - b.start);
  const eventGroups = new Map<string, { name: string; count: number; withBrands: number; seconds: number; brandNames: Set<string> }>();
  for (const event of eventRows) {
    const item = eventGroups.get(event.name) || { name: event.name, count: 0, withBrands: 0, seconds: 0, brandNames: new Set<string>() };
    item.count++;
    item.withBrands += event.brands.length ? 1 : 0;
    item.seconds += event.duration;
    event.brands.forEach(brand => item.brandNames.add(brand.name));
    eventGroups.set(event.name, item);
  }
  const pairs: { a: string; b: string; seconds: number }[] = [];
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const seconds = length(active[i].own.flatMap(a => active[j].own.map(b => ({ start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) })).filter(w => w.end > w.start)));
    if (seconds > 0) pairs.push({ a: active[i].name, b: active[j].name, seconds });
  }
  pairs.sort((a, b) => b.seconds - a.seconds);
  const buckets: { start: number; end: number; brandSeconds: number; covered: number; pct: number; eventCount: number }[] = [];
  for (let start = 0; start < videoSeconds; start += 300) {
    const window = { start, end: Math.min(videoSeconds, start + 300) };
    const brandSeconds = brands.reduce((n, b) => n + length(b.own.map(w => ({ start: Math.max(w.start, window.start), end: Math.min(w.end, window.end) })).filter(w => w.end > w.start)), 0);
    const covered = length(anySponsor.map(w => ({ start: Math.max(w.start, window.start), end: Math.min(w.end, window.end) })).filter(w => w.end > w.start));
    buckets.push({ start, end: window.end, brandSeconds, covered, pct: pct(covered, window.end - start), eventCount: eventRows.filter(e => e.start >= start && e.start < window.end).length });
  }
  const classifiedRows = task.sponsors.map(a => ({ ...a, endSeconds: a.end == null ? endpoint : a.end,
    seconds: Math.max(0, (a.end == null ? endpoint : a.end) - a.start) })).filter(a => a.seconds > 0);
  const classifiedSeconds = classifiedRows.reduce((n, row) => n + row.seconds, 0);
  const placementTotals = PLACEMENT_TYPES.map(([key, label]) => ({ key, label,
    seconds: classifiedRows.filter(a => a.placement === key).reduce((n, a) => n + a.seconds, 0),
    intervals: classifiedRows.filter(a => a.placement === key).length })).filter(item => item.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  const qualityTotals = VISIBILITY_QUALITIES.map(([key, label]) => ({ key, label,
    seconds: classifiedRows.filter(a => a.quality === key).reduce((n, a) => n + a.seconds, 0),
    intervals: classifiedRows.filter(a => a.quality === key).length })).filter(item => item.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  const placementUnclassified = classifiedRows.filter(a => !PLACEMENT_TYPES.some(([key]) => key === a.placement)).reduce((n, a) => n + a.seconds, 0);
  const qualityUnclassified = classifiedRows.filter(a => !VISIBILITY_QUALITIES.some(([key]) => key === a.quality)).reduce((n, a) => n + a.seconds, 0);
  const frequency = brands.reduce((n, b) => n + b.own.length, 0);
  const avgExposure = frequency ? sumSeconds / frequency : 0;
  const placementCoverage = classifiedSeconds ? pct(classifiedSeconds - placementUnclassified, classifiedSeconds) : 0;
  const qualityCoverage = classifiedSeconds ? pct(classifiedSeconds - qualityUnclassified, classifiedSeconds) : 0;
  const periods = task.periods;
  const mapped = !!periods && Number.isFinite(periods.firstEnd) && Number.isFinite(periods.secondStart) && periods.firstEnd > 0 && periods.secondStart >= periods.firstEnd && periods.secondStart * 60 < videoSeconds;
  const windows = mapped && periods ? [
    { key: 'first', label: 'FIRST HALF', start: 0, end: periods.firstEnd * 60 },
    { key: 'break', label: 'HALFTIME / UNMAPPED BREAK', start: periods.firstEnd * 60, end: periods.secondStart * 60 },
    { key: 'second', label: 'SECOND HALF', start: periods.secondStart * 60, end: videoSeconds },
  ] : [];
  const periodBreakdown = windows.map(window => {
    const brandRows = brands.map(brand => ({ name: brand.name, id: brand.id,
      seconds: brand.own.reduce((n, own) => n + intervalOverlap(own, window), 0) })).sort((a, b) => b.seconds - a.seconds);
    return { ...window, anySeconds: anySponsor.reduce((n, own) => n + intervalOverlap(own, window), 0),
      combinedBrandSeconds: brandRows.reduce((n, b) => n + b.seconds, 0), brandRows: brandRows.filter(b => b.seconds > 0) };
  });
  const highValueEvents = eventRows.filter(event => {
    const config = source.events.find(item => item.id === event.eventId);
    return typeof config?.highValue === 'boolean' ? config.highValue : /goal|celebrat|penalty|trophy|award/i.test(event.name);
  });
  const highValueIntervals = highValueEvents.filter(event => event.duration > 0 && !event.legacyPoint);
  const highValueMomentSeconds = length(union(highValueIntervals.map(event => ({ start: event.start, end: event.end }))));
  const highValueCoverageSeconds = length(union(anySponsor.flatMap(own => highValueIntervals.map(event => ({ start: Math.max(event.start, own.start), end: Math.min(event.end, own.end) })).filter(w => w.end > w.start))));
  const brandHighValue = brands.map(brand => ({ id: brand.id, name: brand.name,
    seconds: length(union(brand.own.flatMap(own => highValueIntervals.map(event => ({ start: Math.max(own.start, event.start), end: Math.min(own.end, event.end) })).filter(w => w.end > w.start)))),
    momentCount: highValueEvents.filter(event => event.brands.some(b => b.id === brand.id)).length })).filter(brand => brand.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  return { brands, active, videoSeconds, endpoint, sumSeconds, coveredSeconds, cameras, cameraCovered,
    eventRows, eventGroups: [...eventGroups.values()].sort((a, b) => b.count - a.count), pairs, buckets,
    frequency, avgExposure, positiveIntervals: classifiedRows.length, placementTotals, qualityTotals,
    placementUnclassified, qualityUnclassified, placementCoverage, qualityCoverage, periodBreakdown,
    periodMapped: mapped, highValueEvents, highValueMomentSeconds, highValueCoverageSeconds,
    brandHighValue, classifiedSeconds, sponsorOpen: task.sponsors.filter(a => a.end == null).length,
    eventOpen: task.events.filter(a => a.end == null).length, cameraOpen: task.cameras.filter(a => a.end == null).length,
    pct, number: (n: number) => n.toFixed(1) };
}

export type InsightData = ReturnType<typeof computeInsights>;

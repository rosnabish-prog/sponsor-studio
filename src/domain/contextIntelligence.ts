import type { TaskSummary } from '../types/models';
import { mergeIntervals, type TimeInterval } from './intervals';
import { computeInsights, type InsightData, type InsightSources } from './analytics';
import { sponsorProperties } from './sponsorProperties';

type Window = TimeInterval;

const sum = (windows: ReadonlyArray<Window>) => windows.reduce((total, window) => total + window.end - window.start, 0);
const union = (windows: ReadonlyArray<Window>) => mergeIntervals(windows.filter(window => window.end > window.start));
const overlapWindows = (first: ReadonlyArray<Window>, second: ReadonlyArray<Window>) => union(first.flatMap(a => second.map(b => ({
  start: Math.max(a.start, b.start), end: Math.min(a.end, b.end),
})).filter(window => window.end > window.start)));
const overlapSeconds = (first: ReadonlyArray<Window>, second: ReadonlyArray<Window>) => sum(overlapWindows(first, second));
const percentage = (value: number, total: number) => total > 0 ? 100 * value / total : 0;
const quantile = (values: number[], fraction: number) => {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
};

/** Broadcast time is the only available timebase. Open tags stop at the observed endpoint. */
export function computeContextIntelligence(task: TaskSummary, source: InsightSources, insights: InsightData = computeInsights(task, source)) {
  const { videoSeconds, endpoint } = insights;
  const clip = (value: number) => Math.min(videoSeconds, Math.max(0, Number(value) || 0));
  const span = (annotation: { start: number; end: number | null }): Window | null => {
    const start = clip(annotation.start), end = clip(annotation.end === null ? endpoint : annotation.end);
    return end > start ? { start, end } : null;
  };
  const spans = (rows: { start: number; end: number | null }[]) => union(rows.flatMap(row => {
    const window = span(row); return window ? [window] : [];
  }));
  const sponsorWindows = union(insights.active.flatMap(brand => brand.own));
  const cameraRows = source.cameras.map(camera => {
    const own = spans(task.cameras.filter(annotation => annotation.cameraId === camera.id));
    const seconds = sum(own);
    const brandRows = insights.active.map(brand => ({
      id: brand.id, name: brand.name, seconds: overlapSeconds(brand.own, own),
    })).filter(brand => brand.seconds > 0).sort((a, b) => b.seconds - a.seconds);
    return {
      id: camera.id, name: camera.name, own, seconds,
      shots: task.cameras.filter(row => row.cameraId === camera.id && span(row) !== null).length,
      sponsorVisibleSeconds: overlapSeconds(sponsorWindows, own),
      combinedBrandSeconds: brandRows.reduce((total, brand) => total + brand.seconds, 0),
      brandRows, visibilityRate: percentage(overlapSeconds(sponsorWindows, own), seconds),
    };
  }).sort((a, b) => b.seconds - a.seconds);
  const cameraTaggedSeconds = sum(union(cameraRows.flatMap(camera => camera.own)));
  // These are camera labels supplied by analysts, not estimates of logo size.
  const closeupCameras = cameraRows.filter(camera => /close[\s-]?up|zoom/i.test(camera.name));
  const replayCameras = cameraRows.filter(camera => /replay/i.test(camera.name));
  const closeupWindows = union(closeupCameras.flatMap(camera => camera.own));
  const replayWindows = union(replayCameras.flatMap(camera => camera.own));
  const context = (name: string, cameraNames: string[], windows: Window[]) => {
    const seconds = sum(windows);
    const visibleSeconds = overlapSeconds(sponsorWindows, windows);
    const brands = insights.active.map(brand => ({ id: brand.id, name: brand.name,
      seconds: overlapSeconds(brand.own, windows),
      shareOfBrand: percentage(overlapSeconds(brand.own, windows), brand.seconds),
    })).filter(brand => brand.seconds > 0).sort((a, b) => b.seconds - a.seconds);
    return { name, cameraNames, seconds, visibleSeconds, rate: percentage(visibleSeconds, seconds),
      combinedBrandSeconds: brands.reduce((total, brand) => total + brand.seconds, 0), brands };
  };
  const closeup = context('Close-up / zoomed', closeupCameras.map(camera => camera.name), closeupWindows);
  const replay = context('Replay', replayCameras.map(camera => camera.name), replayWindows);

  // Each key moment uses the annotated event interval. Multiple events can overlap,
  // so aggregate intervals are unioned rather than counting the same frame twice.
  const momentWindows = union(insights.highValueEvents.filter(event => event.duration > 0 && !event.legacyPoint)
    .map(event => ({ start: event.start, end: event.end })));
  const momentRows = insights.highValueEvents.map(event => ({
    ...event,
    cameraNames: cameraRows.filter(camera => overlapSeconds(camera.own, [{ start: event.start, end: event.end }]) > 0).map(camera => camera.name),
    closeupSponsorSeconds: overlapSeconds(overlapWindows(sponsorWindows, closeupWindows), [{ start: event.start, end: event.end }]),
  }));
  const momentPhaseWindows = [
    { key: 'before', label: '10 SEC BEFORE', windows: union(insights.highValueEvents.map(event => ({ start: Math.max(0, event.start - 10), end: event.start }))) },
    { key: 'during', label: 'DURING EVENT', windows: momentWindows },
    { key: 'after', label: '10 SEC AFTER', windows: union(insights.highValueEvents.filter(event => !event.open).map(event => ({ start: event.end, end: Math.min(videoSeconds, event.end + 10) }))) },
  ];
  const momentPhases = momentPhaseWindows.map(phase => ({
    key: phase.key, label: phase.label,
    seconds: sum(phase.windows),
    visibleSeconds: overlapSeconds(sponsorWindows, phase.windows),
    coverage: percentage(overlapSeconds(sponsorWindows, phase.windows), sum(phase.windows)),
    brands: insights.active.map(brand => ({ id: brand.id, name: brand.name,
      seconds: overlapSeconds(brand.own, phase.windows),
    })).filter(brand => brand.seconds > 0).sort((a, b) => b.seconds - a.seconds),
  }));

  const brandContexts = insights.active.map(brand => {
    const sponsor = source.sponsors.find(item => item.id === brand.id);
    const flagged = sponsor ? task.sponsors.filter(annotation => annotation.sponsorId === brand.id &&
      sponsorProperties(sponsor).some(property => /clarity|visibility|readab/i.test(property.name) &&
        annotation.properties?.[property.id] && annotation.properties[property.id] !== property.defaultOptionId)) : [];
    const ownDurations = brand.own.map(window => window.end - window.start);
    return {
      id: brand.id, name: brand.name, seconds: brand.seconds, first: brand.first,
      appearances: brand.own.length,
      median: quantile(ownDurations, 0.5), p90: quantile(ownDurations, 0.9),
      shortAppearances: ownDurations.filter(duration => duration <= 2).length,
      closeupSeconds: overlapSeconds(brand.own, closeupWindows),
      replaySeconds: overlapSeconds(brand.own, replayWindows),
      momentSeconds: overlapSeconds(brand.own, momentWindows),
      momentCount: insights.highValueEvents.filter(event => event.brands.some(item => item.id === brand.id)).length,
      flaggedClaritySeconds: overlapSeconds(brand.own, spans(flagged)),
    };
  }).sort((a, b) => b.momentSeconds - a.momentSeconds || b.seconds - a.seconds);

  // A sweep over brand-unique windows measures simultaneous *distinct* brands.
  const edges = insights.active.flatMap(brand => brand.own.flatMap(window => [
    { at: window.start, delta: 1 }, { at: window.end, delta: -1 },
  ])).sort((a, b) => a.at - b.at);
  const parallelSeconds = [0, 0, 0, 0];
  let concurrent = 0, maximumConcurrent = 0, cursor = 0, index = 0;
  while (index < edges.length) {
    const at = edges[index].at;
    parallelSeconds[Math.min(3, concurrent)] += Math.max(0, at - cursor);
    while (index < edges.length && edges[index].at === at) concurrent += edges[index++].delta;
    maximumConcurrent = Math.max(maximumConcurrent, concurrent);
    cursor = at;
  }
  parallelSeconds[Math.min(3, concurrent)] += Math.max(0, videoSeconds - cursor);

  const orderedCameraShots = task.cameras.flatMap(annotation => {
    const window = span(annotation);
    return window ? [{ ...window, cameraId: annotation.cameraId }] : [];
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const cuts: number[] = [];
  for (let i = 1; i < orderedCameraShots.length; i++) {
    const prev = orderedCameraShots[i - 1], next = orderedCameraShots[i];
    if (prev.cameraId !== next.cameraId && next.start >= prev.end - 0.01 && next.start - prev.end <= 0.75) cuts.push(next.start);
  }
  const cutRetention = insights.active.map(brand => {
    const before = cuts.filter(at => overlapSeconds(brand.own, [{ start: Math.max(0, at - 2), end: at }]) > 0);
    const retained = before.filter(at => overlapSeconds(brand.own, [{ start: at, end: Math.min(videoSeconds, at + 2) }]) > 0);
    return { id: brand.id, name: brand.name, opportunities: before.length, retained: retained.length };
  }).filter(brand => brand.opportunities > 0).sort((a, b) => b.retained - a.retained);

  const timelineLayers = [
    { key: 'sponsor', label: 'Any sponsor', color: '#ff9b36', windows: sponsorWindows },
    { key: 'moment', label: 'Key moments', color: '#e7c19b', windows: momentWindows },
    { key: 'closeup', label: 'Close-up / zoomed', color: '#5ec8b8', windows: closeupWindows },
    { key: 'replay', label: 'Replay angles', color: '#9ba7ed', windows: replayWindows },
    { key: 'camera', label: 'Camera coverage', color: '#8d9ca3', windows: union(cameraRows.flatMap(camera => camera.own)) },
  ];

  return {
    cameraRows, cameraTaggedSeconds, cameraCoverage: percentage(cameraTaggedSeconds, videoSeconds),
    closeup, replay, momentRows, momentWindows, momentPhases, brandContexts, timelineLayers,
    parallelSeconds, maximumConcurrent,
    multiBrandSeconds: parallelSeconds[2] + parallelSeconds[3],
    cuts: cuts.length, cutsPerMinute: cameraTaggedSeconds ? cuts.length * 60 / cameraTaggedSeconds : 0,
    cutRetention, cutRetentionOpportunities: cutRetention.reduce((n, brand) => n + brand.opportunities, 0),
    cutRetained: cutRetention.reduce((n, brand) => n + brand.retained, 0),
    flaggedClaritySeconds: brandContexts.reduce((n, brand) => n + brand.flaggedClaritySeconds, 0),
    momentCoverage: percentage(overlapSeconds(sponsorWindows, momentWindows), sum(momentWindows)),
    pct: percentage,
  };
}

export type ContextIntelligence = ReturnType<typeof computeContextIntelligence>;

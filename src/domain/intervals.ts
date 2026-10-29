/** Pure, type-checked video-time operations shared by annotation and insights. */
export interface TimeInterval {
  start: number;
  end: number;
}

export function formatTimestamp(input: unknown): string {
  const seconds = Math.max(0, Number(input) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return (
    (hours ? String(hours).padStart(2, '0') + ':' : '') +
    String(minutes).padStart(2, '0') + ':' +
    String(remainder).padStart(2, '0')
  );
}

export function clampNumber(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Merge overlapping or touching intervals, without mutating input arrays. */
export function mergeIntervals(intervals: ReadonlyArray<TimeInterval>): TimeInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const result: TimeInterval[] = [];
  for (const interval of sorted) {
    const previous = result.at(-1);
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      result.push({ ...interval });
    }
  }
  return result;
}

export function intervalOverlap(a: TimeInterval, b: TimeInterval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

import { useState } from 'react';
import type { InsightData } from '../domain/analytics';
import { formatTimestamp as fmt, mergeIntervals } from '../domain/intervals';

type Series = { name: string; color: string; values: number[]; prominent?: boolean };
const palette = ['#ff7f65', '#60d9ac', '#74a8ff'];
type TimeWindow = 60 | 300 | 600 | 900 | 1800;
const windows: { seconds: TimeWindow; label: string }[] = [
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 600, label: '10 minutes' },
  { seconds: 900, label: '15 minutes' },
  { seconds: 1800, label: '30 minutes' },
];

function curve(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  return `M ${points[0].x} ${points[0].y}` + points.slice(1).map((next, index) => {
    const previous = points[index];
    const mid = (previous.x + next.x) / 2;
    // Flat tangents at samples prevent Bézier overshoot beyond measured coverage.
    return ` C ${mid} ${previous.y}, ${mid} ${next.y}, ${next.x} ${next.y}`;
  }).join('');
}

/** Recompute each window directly from recorded intervals, rather than averaging prior buckets. */
export function ExposureTrend({ data, focusId }: { data: InsightData; focusId: string }) {
  const [windowSeconds, setWindowSeconds] = useState<TimeWindow>(300);
  const focus = data.active.find(brand => brand.id === focusId);
  const overlap = (start: number, end: number, ranges: {start:number;end:number}[]) =>
    ranges.reduce((sum, range) => sum + Math.max(0, Math.min(range.end, end) - Math.max(range.start, start)), 0);
  const individual = focus ? [focus] : data.active.slice(0, 3);
  const buckets = Array.from({length:Math.ceil(data.videoSeconds/windowSeconds)}, (_, index) => ({
    start:index*windowSeconds,
    end:Math.min(data.videoSeconds,(index+1)*windowSeconds),
  }));
  const totalRanges = mergeIntervals(data.brands.flatMap(brand => brand.own));
  const series: Series[] = [
    ...(!focus ? [{ name: 'Any sponsor visible', color: '#ffc38e', prominent: true, values: buckets.map(bucket => 100 * overlap(bucket.start,bucket.end,totalRanges)/Math.max(1,bucket.end-bucket.start)) }] : []),
    ...individual.map((brand, index) => ({
      name: brand.name, color: palette[index],
      values: buckets.map(bucket => 100 * overlap(bucket.start, bucket.end, brand.own) / Math.max(1, bucket.end - bucket.start)),
    })),
  ];
  const maxObserved = Math.max(0,...series.flatMap(item => item.values));
  const chartMax = Math.min(100,Math.max(10,Math.ceil((maxObserved+10)/10)*10));
  const leadSeries = focus ? series[0] : series.find(item => item.prominent);
  const highest = Math.max(0,...(leadSeries?.values || []));
  const peakIndex = leadSeries?.values.findIndex(value => value === highest) ?? -1;
  const peakBucket = buckets[peakIndex];
  const width = 920, height = 260, left = 48, right = 16, top = 18, bottom = 37;
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = (time: number) => left + plotW * time / data.videoSeconds;
  const y = (share: number) => top + plotH * (1 - Math.max(0, Math.min(chartMax, share)) / chartMax);
  const points = (values: number[]) => {
    if (!values.length) return [];
    return [{x:left,y:y(values[0])}, ...values.map((value,i) => ({x:x((buckets[i].start + buckets[i].end)/2),y:y(value)})), {x:left+plotW,y:y(values[values.length-1])}];
  };

  return <div className="exposure-curve-wrap">
    <div className="exposure-curve-tools"><label htmlFor="exposureInterval">TIME INTERVAL</label><select id="exposureInterval" value={windowSeconds} onChange={event => setWindowSeconds(Number(event.target.value) as TimeWindow)}>
      {windows.map(window => <option key={window.seconds} value={window.seconds}>{window.label}</option>)}
    </select></div>
    <div className="exposure-curve-legend">
      {series.map(item => <span key={item.name}><i style={{background:item.color}} />{item.name}</span>)}
      {!focus && data.active.length > 3 && <small>Showing top 3 brands + total coverage</small>}
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Sponsor exposure over ${fmt(data.videoSeconds)} in ${windowSeconds/60}-minute intervals, with a ${chartMax}% vertical scale`} className="exposure-curve-chart">
      <defs><linearGradient id="exposure-rgb-fill" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ff7f65" stopOpacity=".24"/><stop offset="52%" stopColor="#60d9ac" stopOpacity=".14"/><stop offset="100%" stopColor="#74a8ff" stopOpacity=".24"/></linearGradient></defs>
      {[0,.25,.5,.75,1].map(shareFraction => {const share=shareFraction*chartMax;return <g key={shareFraction}>
        <line x1={left} y1={y(share)} x2={left+plotW} y2={y(share)} stroke="#444549" strokeDasharray="3 7" />
        <text x={left-12} y={y(share)+4} textAnchor="end" fill="#a1a3aa" fontSize="11">{Number(share.toFixed(1))}%</text>
      </g>;})}
      {[0,.25,.5,.75,1].map(fraction => <text key={fraction} x={x(fraction*data.videoSeconds)} y={height-12} textAnchor={fraction===0?'start':fraction===1?'end':'middle'} fill="#a1a3aa" fontSize="11">{fmt(fraction*data.videoSeconds)}</text>)}
      {series.map(item => {
        const p = points(item.values);
        const line = curve(p);
        const fill = p.length ? `${line} L ${p[p.length-1].x} ${y(0)} L ${p[0].x} ${y(0)} Z` : '';
        return <g key={item.name}>
          {item.prominent && <path d={fill} fill="url(#exposure-rgb-fill)" />}
          <path d={line} fill="none" stroke={item.color} strokeWidth={item.prominent ? 3.5 : 2.7} strokeLinecap="round" strokeLinejoin="round" opacity={item.prominent ? 1 : .9} />
          {item.values.map((value,index) => <circle key={index} cx={x((buckets[index].start+buckets[index].end)/2)} cy={y(value)} r="3.5" fill={item.color} stroke="#19191b" strokeWidth="1.5">
            <title>{`${item.name}: ${value.toFixed(1)}% visibility from ${fmt(buckets[index].start)} to ${fmt(buckets[index].end)}`}</title>
          </circle>)}
        </g>;
      })}
    </svg>
    {!data.active.length && <p className="exposure-curve-empty">No sponsor visibility has been recorded yet. Exposure will appear here once timed annotations exist.</p>}
    {peakBucket && data.active.length > 0 && <p className="exposure-curve-caption">{focus ? focus.name : 'Combined sponsor'} visibility peaked at {highest.toFixed(1)}% during {fmt(peakBucket.start)}–{fmt(peakBucket.end)}. {focus ? `${focus.name} appeared for ${fmt(focus.seconds)} overall.` : `${data.active[0].name} leads the match with ${fmt(data.active[0].seconds)} of recorded exposure.`}</p>}
  </div>;
}

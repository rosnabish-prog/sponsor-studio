import { useState, type MouseEvent } from 'react';
import type { InsightData } from '../domain/analytics';
import { formatTimestamp as fmt, mergeIntervals } from '../domain/intervals';

type Series = { name: string; color: string; values: number[]; prominent?: boolean };
const palette = ['#ff7f65', '#60d9ac', '#74a8ff'];
export type TimeWindow = 60 | 300 | 600 | 900 | 1800;
export const exposureWindows: { seconds: TimeWindow; label: string }[] = [
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
export function ExposureTrend({ data, focusId, windowSeconds = 300 }: { data: InsightData; focusId: string; windowSeconds?: TimeWindow }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
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
  const hoverBucket = hoveredIndex === null ? null : buckets[hoveredIndex];
  const visibleInBucket = hoverBucket ? data.active.map(brand => {
    const seconds = overlap(hoverBucket.start, hoverBucket.end, brand.own);
    return {brand,seconds,percent:100*seconds/Math.max(1,hoverBucket.end-hoverBucket.start)};
  }).filter(entry => entry.seconds>0 || entry.brand.id===focusId).sort((a,b)=>b.seconds-a.seconds) : [];
  const totalAtHover = hoverBucket ? 100*overlap(hoverBucket.start,hoverBucket.end,totalRanges)/Math.max(1,hoverBucket.end-hoverBucket.start) : 0;
  const momentsAtHover = hoverBucket ? data.highValueEvents.filter(event => event.start < hoverBucket.end && event.end >= hoverBucket.start).slice(0,8) : [];
  function selectHoverWindow(event: MouseEvent<SVGSVGElement>) {
    const rect=event.currentTarget.getBoundingClientRect();
    const scale=Math.min(rect.width/width,rect.height/height);
    if(!Number.isFinite(scale)||scale<=0)return;
    const offset=(rect.width-width*scale)/2;
    const svgX=(event.clientX-rect.left-offset)/scale;
    const time=(Math.max(0,Math.min(plotW,svgX-left))/plotW)*data.videoSeconds;
    const index=Math.max(0,Math.min(buckets.length-1,Math.floor(time/windowSeconds)));
    setHoveredIndex(old=>old===index?old:index);
  }

  return <div className="exposure-curve-wrap">
    <div className="exposure-curve-legend">
      {series.map(item => <span key={item.name}><i style={{background:item.color}} />{item.name}</span>)}
      {data.highValueEvents.length>0&&<span><i style={{background:'#e6b36a'}} />High-value event markers</span>}
      {!focus && data.active.length > 3 && <small>Showing top 3 brands + total coverage</small>}
    </div>
    <div className="exposure-chart-stage">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} onMouseMove={selectHoverWindow} onMouseLeave={()=>setHoveredIndex(null)} onFocus={()=>setHoveredIndex(0)} onBlur={()=>setHoveredIndex(null)} aria-label={`Sponsor exposure over ${fmt(data.videoSeconds)} in ${windowSeconds/60}-minute intervals. Hover to inspect sponsor details for each time window.`} className="exposure-curve-chart" data-max-percent={chartMax}>
      <defs><linearGradient id="exposure-rgb-fill" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ff7f65" stopOpacity=".24"/><stop offset="52%" stopColor="#60d9ac" stopOpacity=".14"/><stop offset="100%" stopColor="#74a8ff" stopOpacity=".24"/></linearGradient></defs>
      {[0,.25,.5,.75,1].map(shareFraction => {const share=shareFraction*chartMax;return <g key={shareFraction}>
        <line x1={left} y1={y(share)} x2={left+plotW} y2={y(share)} stroke="#444549" strokeDasharray="3 7" />
        <text x={left-12} y={y(share)+4} textAnchor="end" fill="#a1a3aa" fontSize="11">{Number(share.toFixed(1))}%</text>
      </g>;})}
      {[0,.25,.5,.75,1].map(fraction => <text key={fraction} x={x(fraction*data.videoSeconds)} y={height-12} textAnchor={fraction===0?'start':fraction===1?'end':'middle'} fill="#a1a3aa" fontSize="11">{fmt(fraction*data.videoSeconds)}</text>)}
      {data.highValueEvents.slice(0,60).map(event=><g key={event.id}>
        <line x1={x(event.start)} x2={x(event.start)} y1={top} y2={height-bottom} stroke="#e6b36a" strokeOpacity=".56" strokeWidth="1.5" strokeDasharray="2 7" />
        <circle cx={x(event.start)} cy={top+1} r="3.2" fill="#f5bd72"><title>{`${event.name} · ${fmt(event.start)} · ${event.brands.length} brands tagged during event`}</title></circle>
      </g>)}
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
      {hoverBucket && <line x1={x((hoverBucket.start+hoverBucket.end)/2)} x2={x((hoverBucket.start+hoverBucket.end)/2)} y1={top} y2={height-bottom} stroke="#f0f0f5" strokeOpacity=".7" strokeDasharray="4 5" strokeWidth="1.5" pointerEvents="none" />}
    </svg>
    {hoverBucket && <div className="exposure-hover-card" role="tooltip" data-chart-tooltip="sponsors">
      <strong>{fmt(hoverBucket.start)} – {fmt(hoverBucket.end)}</strong>
      <span className="exposure-hover-total">At least one sponsor visible: {totalAtHover.toFixed(1)}% of this interval</span>
      {momentsAtHover.length>0&&<span className="exposure-hover-total">Key moments: {momentsAtHover.map(event=>`${event.name} ${fmt(event.start)}`).join(' · ')}</span>}
      {visibleInBucket.length ? <div className="exposure-hover-brands">{visibleInBucket.map(entry => <div className="exposure-hover-brand" key={entry.brand.id}>
        <span className="exposure-hover-brand-name">{entry.brand.logo ? <img src={entry.brand.logo} alt="" /> : <i style={{background:entry.brand.color||'#ff9b36'}} />}<b>{entry.brand.name}</b></span>
        <span>{entry.percent.toFixed(1)}% <small>· {fmt(entry.seconds)}</small></span>
      </div>)}</div> : <span className="exposure-hover-empty">No sponsor recorded in this interval.</span>}
    </div>}
    </div>
    {!data.active.length && <p className="exposure-curve-empty">No sponsor visibility has been recorded yet. Exposure will appear here once timed annotations exist.</p>}
    {peakBucket && data.active.length > 0 && <p className="exposure-curve-caption">{focus ? focus.name : 'Combined sponsor'} visibility peaked at {highest.toFixed(1)}% during {fmt(peakBucket.start)}–{fmt(peakBucket.end)}. {focus ? `${focus.name} appeared for ${fmt(focus.seconds)} overall.` : `${data.active[0].name} leads the match with ${fmt(data.active[0].seconds)} of recorded exposure.`}</p>}
  </div>;
}

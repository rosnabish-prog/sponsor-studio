import type { InsightData } from '../domain/analytics';
import { formatTimestamp as fmt } from '../domain/intervals';

type Series = { name: string; color: string; values: number[]; prominent?: boolean };
const palette = ['#ff7f65', '#60d9ac', '#74a8ff'];

function curve(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  return `M ${points[0].x} ${points[0].y}` + points.slice(1).map((next, index) => {
    const previous = points[index];
    const mid = (previous.x + next.x) / 2;
    // Flat tangents at samples prevent Bézier overshoot beyond measured coverage.
    return ` C ${mid} ${previous.y}, ${mid} ${next.y}, ${next.x} ${next.y}`;
  }).join('');
}

/** Measured coverage by five-minute bucket; curves are a display interpolation, not inferred tags. */
export function ExposureTrend({ data, focusId }: { data: InsightData; focusId: string }) {
  const focus = data.active.find(brand => brand.id === focusId);
  const overlap = (start: number, end: number, ranges: {start:number;end:number}[]) =>
    ranges.reduce((sum, range) => sum + Math.max(0, Math.min(range.end, end) - Math.max(range.start, start)), 0);
  const individual = focus ? [focus] : data.active.slice(0, 3);
  const series: Series[] = [
    ...(!focus ? [{ name: 'Any sponsor visible', color: '#ffc38e', prominent: true, values: data.buckets.map(bucket => bucket.pct) }] : []),
    ...individual.map((brand, index) => ({
      name: brand.name, color: palette[index],
      values: data.buckets.map(bucket => 100 * overlap(bucket.start, bucket.end, brand.own) / Math.max(1, bucket.end - bucket.start)),
    })),
  ];
  const width = 920, height = 260, left = 48, right = 16, top = 18, bottom = 37;
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = (time: number) => left + plotW * time / data.videoSeconds;
  const y = (share: number) => top + plotH * (1 - Math.max(0, Math.min(100, share)) / 100);
  const points = (values: number[]) => {
    if (!values.length) return [];
    return [{x:left,y:y(values[0])}, ...values.map((value,i) => ({x:x((data.buckets[i].start + data.buckets[i].end)/2),y:y(value)})), {x:left+plotW,y:y(values[values.length-1])}];
  };

  return <div className="exposure-curve-wrap">
    <div className="exposure-curve-legend">
      {series.map(item => <span key={item.name}><i style={{background:item.color}} />{item.name}</span>)}
      {!focus && data.active.length > 3 && <small>Showing top 3 brands + total coverage</small>}
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Sponsor exposure over ${fmt(data.videoSeconds)}, as smooth lines based on measured five-minute intervals`} className="exposure-curve-chart">
      <defs><linearGradient id="exposure-rgb-fill" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ff7f65" stopOpacity=".24"/><stop offset="52%" stopColor="#60d9ac" stopOpacity=".14"/><stop offset="100%" stopColor="#74a8ff" stopOpacity=".24"/></linearGradient></defs>
      {[0,25,50,75,100].map(share => <g key={share}>
        <line x1={left} y1={y(share)} x2={left+plotW} y2={y(share)} stroke="#444549" strokeDasharray="3 7" />
        <text x={left-12} y={y(share)+4} textAnchor="end" fill="#a1a3aa" fontSize="11">{share}%</text>
      </g>)}
      {[0,.25,.5,.75,1].map(fraction => <text key={fraction} x={x(fraction*data.videoSeconds)} y={height-12} textAnchor={fraction===0?'start':fraction===1?'end':'middle'} fill="#a1a3aa" fontSize="11">{fmt(fraction*data.videoSeconds)}</text>)}
      {series.map(item => {
        const p = points(item.values);
        const line = curve(p);
        const fill = p.length ? `${line} L ${p[p.length-1].x} ${y(0)} L ${p[0].x} ${y(0)} Z` : '';
        return <g key={item.name}>
          {item.prominent && <path d={fill} fill="url(#exposure-rgb-fill)" />}
          <path d={line} fill="none" stroke={item.color} strokeWidth={item.prominent ? 3.5 : 2.7} strokeLinecap="round" strokeLinejoin="round" opacity={item.prominent ? 1 : .9} />
          {item.values.map((value,index) => <circle key={index} cx={x((data.buckets[index].start+data.buckets[index].end)/2)} cy={y(value)} r="3.5" fill={item.color} stroke="#19191b" strokeWidth="1.5">
            <title>{`${item.name}: ${value.toFixed(1)}% visibility from ${fmt(data.buckets[index].start)} to ${fmt(data.buckets[index].end)}`}</title>
          </circle>)}
        </g>;
      })}
    </svg>
    {!data.active.length && <p className="exposure-curve-empty">No sponsor visibility has been recorded yet. Exposure will appear here once timed annotations exist.</p>}
    <p className="exposure-curve-caption">Measured percentage of footage with each brand visible per five-minute interval. Curves connect samples smoothly; they do not imply frame-level measurements between buckets.</p>
  </div>;
}

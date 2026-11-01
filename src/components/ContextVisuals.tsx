import type { InsightData } from '../domain/analytics';
import type { ContextIntelligence } from '../domain/contextIntelligence';
import { formatTimestamp as fmt } from '../domain/intervals';

const pct = (value: number, total: number) => total > 0 ? Math.max(0, Math.min(100, 100 * value / total)) : 0;
const heat = (value: number) => `rgba(255, 155, 54, ${(0.06 + .74 * Math.max(0, Math.min(1, value))).toFixed(3)})`;

/** Time-aligned tracks: a 'map' of known annotations, never a spatial logo map. */
export function ExposureContextMap({ data, context, focusId, taskId, viewer = false }: {
  data: InsightData; context: ContextIntelligence; focusId: string; taskId: string; viewer?: boolean;
}) {
  const focused = data.active.find(brand => brand.id === focusId);
  const rows = [
    ...(focused ? [{ key: 'focused', label: focused.name, color: '#ffd180', windows: focused.own }] : []),
    ...context.timelineLayers,
  ];
  return <div className="intel-exposure-map" role="group" aria-label="Time-aligned sponsor, event and camera exposure intervals">
    {rows.map(row => <div key={row.key} className="intel-map-row">
      <span className="intel-map-label"><i style={{ background: row.color }} />{row.label}</span>
      <div className="intel-map-track">{row.windows.map((span, index) => {
        const style = { left: `${pct(span.start, data.videoSeconds)}%`, width: `${pct(span.end - span.start, data.videoSeconds)}%`, backgroundColor: row.color };
        const title = `${row.label}: ${fmt(span.start)} – ${fmt(span.end)}`;
        return viewer ? <span key={`${index}:${span.start}`} className="intel-map-span" style={style} title={title} />
          : <button key={`${index}:${span.start}`} type="button" className="intel-map-span" style={style}
            aria-label={`${title}; open footage`} title={`${title} · Open footage at ${fmt(span.start)}`}
            onClick={() => window.goToAnnotatedTime?.(taskId, span.start)} />;
      })}</div>
    </div>)}
    <div className="intel-map-axis"><span /><div className="intel-map-axis-ticks">{[0, .25, .5, .75, 1].map(fraction => <b key={fraction}>{fmt(data.videoSeconds * fraction)}</b>)}</div></div>
    <p>Each lane uses the same video timeline. {!viewer && 'Select a segment to inspect the original footage. '}Overlapping lanes mean the tags share time, not that a logo occupied a measured screen position.</p>
  </div>;
}

/** Camera-relative visibility, with both durations and true denominators in each cell. */
export function CameraBrandHeatmap({ context }: { context: ContextIntelligence }) {
  const cameras = context.cameraRows.filter(camera => camera.seconds > 0);
  if (!cameras.length || !context.brandContexts.length) return <p className="insight-muted">Tag camera angles and sponsors to populate the camera exposure heatmap.</p>;
  return <div className="tablewrap intel-heatmap-scroll"><table className="intel-heatmap"><thead><tr><th>BRAND</th>{cameras.map(camera => <th key={camera.id}>{camera.name}<small>{fmt(camera.seconds)} camera-tagged</small></th>)}</tr></thead>
    <tbody>{context.brandContexts.map(brand => <tr key={brand.id}><th scope="row">{brand.name}</th>{cameras.map(camera => {
      const seconds = camera.brandRows.find(item => item.id === brand.id)?.seconds ?? 0;
      const intensity = seconds / camera.seconds;
      return <td key={camera.id} style={{ backgroundColor: heat(intensity) }} title={`${brand.name} · ${camera.name}: ${fmt(seconds)} visible, ${pct(seconds, camera.seconds).toFixed(1)}% of this camera's tagged time`}>
        <strong>{seconds ? `${pct(seconds, camera.seconds).toFixed(1)}%` : '—'}</strong><small>{seconds ? fmt(seconds) : ''}</small>
      </td>;
    })}</tr>)}</tbody>
  </table><div className="intel-heatmap-legend"><span>LOWER EXPOSURE</span><div className="intel-heatmap-scale"><i style={{background:heat(0)}}/><i style={{background:heat(.25)}}/><i style={{background:heat(.5)}}/><i style={{background:heat(.75)}}/><i style={{background:heat(1)}}/></div><span>HIGHER EXPOSURE</span></div></div>;
}

export function MomentBrandHeatmap({ context }: { context: ContextIntelligence }) {
  if (!context.brandContexts.length || !context.momentRows.length) return <p className="insight-muted">The moment heatmap appears when sponsor and high-value event intervals have been recorded.</p>;
  return <div className="tablewrap intel-heatmap-scroll"><table className="intel-heatmap intel-moment-heatmap"><thead><tr><th>BRAND</th>{context.momentPhases.map(phase => <th key={phase.key}>{phase.label}<small>{fmt(phase.seconds)} measured</small></th>)}</tr></thead>
    <tbody>{context.brandContexts.map(brand => <tr key={brand.id}><th scope="row">{brand.name}</th>{context.momentPhases.map(phase => {
      const seconds = phase.brands.find(item => item.id === brand.id)?.seconds ?? 0;
      const intensity = phase.seconds ? seconds / phase.seconds : 0;
      return <td key={phase.key} style={{ backgroundColor: heat(intensity) }} title={`${brand.name} · ${phase.label}: ${fmt(seconds)} of ${fmt(phase.seconds)} available phase time`}>
        <strong>{phase.seconds ? `${pct(seconds, phase.seconds).toFixed(1)}%` : '—'}</strong><small>{seconds ? fmt(seconds) : ''}</small>
      </td>;
    })}</tr>)}</tbody>
  </table></div>;
}

export function CameraVisibilityBars({ context }: { context: ContextIntelligence }) {
  const cameras = context.cameraRows.filter(camera => camera.seconds > 0);
  if (!cameras.length) return <p className="insight-muted">No measured camera intervals yet.</p>;
  return <div className="intel-camera-coverage-bars">{cameras.map(camera => <div key={camera.id}>
    <div className="intel-camera-bar-label"><b>{camera.name}</b><span>{pct(camera.sponsorVisibleSeconds,camera.seconds).toFixed(1)}% visible · {fmt(camera.sponsorVisibleSeconds)} / {fmt(camera.seconds)}</span></div>
    <div className="intel-camera-bar-track" aria-label={`${camera.name}: ${pct(camera.sponsorVisibleSeconds,camera.seconds).toFixed(1)} percent camera time has a sponsor tag`}>
      <i style={{ width: `${pct(camera.sponsorVisibleSeconds,camera.seconds)}%` }} />
    </div>
  </div>)}</div>;
}

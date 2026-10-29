import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { StudioScreenModel } from '../types/screen';
import type { AnnotationBase, CameraAnnotation, EventAnnotation, Sponsor, SponsorAnnotation, TagAttribute } from '../types/models';
import { formatTimestamp as fmt } from '../domain/intervals';
import { PLACEMENT_TYPES, VISIBILITY_QUALITIES } from '../domain/classifications';

type StudioProps = { model: StudioScreenModel };
type TrackKind = 'sponsor' | 'event' | 'camera';

function Icon({ name }: { name: string }) { return <svg className="ic"><use href={`#i-${name}`} /></svg>; }

export function BrandLogo({ sponsor, className = 'tinylogo' }: { sponsor: Sponsor; className?: string }) {
  const initials = sponsor.name.split(' ').map(part => part[0]).join('').slice(0, 3).toUpperCase();
  const style: CSSProperties | undefined = sponsor.logo ? undefined : { background: `${sponsor.color || '#f2eff8'}25`, color: sponsor.color || '#665b87' };
  return <div className={className} style={style}>{sponsor.logo ? <img src={sponsor.logo} alt="" /> : initials}</div>;
}

function EventChip({ item, active, disabled, camera }: { item: TagAttribute; active: boolean; disabled: boolean; camera: boolean }) {
  return <button type="button" className={`event-chip tagged-state-chip ${camera ? 'camera-chip' : ''} ${active ? 'active' : ''}`}
    onClick={() => camera ? window.tagCamera?.(item.id) : window.tagEvent?.(item.id)} disabled={disabled}
    aria-pressed={active} aria-label={`${item.name} · ${active ? 'LIVE, tap to end' : camera ? 'OFF, tap to start or switch' : 'OFF, tap to start'}`}
    title={`${item.name} · ${active ? 'LIVE' : 'OFF'}`}>
    <span className="chip-symbol">{camera ? '◎' : '↔'}</span><span className="chip-label">{item.name}</span>
    <span className={`tag-live-pill ${active ? 'on' : 'off'}`} aria-hidden="true">● {active ? 'LIVE' : 'OFF'}</span>
  </button>;
}

function EventButtons({ model, camera }: StudioProps & { camera: boolean }) {
  const items = camera ? model.cameras : model.events;
  const active = camera ? model.task.cameras : model.task.events;
  return <>{items.map(item => <EventChip key={item.id} item={item} camera={camera} disabled={!model.canContext}
    active={active.some(annotation => (camera ? (annotation as CameraAnnotation).cameraId : (annotation as EventAnnotation).eventId) === item.id && annotation.end == null)} />)}</>;
}

export function StudioControls({ model }: StudioProps) {
  if (model.selectedTab === 'events') return <div className="studio-layer-hint">Key match event buttons are in the right panel. Select an event there to start or end its interval; the timeline below displays event annotations.</div>;
  if (model.selectedTab === 'cameras') return <div className="studio-layer-hint">Camera-angle buttons are in the right panel. Select an angle there to begin or end its interval; switching cameras closes the previous view.</div>;
  if (model.selectedTab === 'sponsors') return <div className="studio-layer-hint">Select sponsor logos from the right-hand SPONSORS panel. The timeline below shows sponsor visibility only.</div>;
  return <>
    <section className="studio-chip-group"><div className="chip-group-title"><span>KEY MATCH EVENTS</span><small>TAP TO START · TAP AGAIN TO END</small></div><div className="event-chip-row"><EventButtons model={model} camera={false} /></div></section>
    <section className="studio-chip-group"><div className="chip-group-title"><span>CAMERA ANGLES</span><small>TAP AGAIN TO END · SWITCH TO CLOSE PREVIOUS</small></div><div className="event-chip-row"><EventButtons model={model} camera /></div></section>
  </>;
}

export function StudioRail({ model }: StudioProps) {
  if (model.selectedTab === 'events' || model.selectedTab === 'cameras') {
    const camera = model.selectedTab === 'cameras';
    const items = camera ? model.cameras : model.events;
    return <div className="side-tag-list">{items.length ? <EventButtons model={model} camera={camera} /> : <span className="rail-empty">No {camera ? 'camera angles' : 'key event tags'} assigned to this match.</span>}</div>;
  }
  if (!model.sponsors.length) return <div className="rail-empty">No sponsors assigned to this match.</div>;
  return <div className="rail-cards">{model.sponsors.map(sponsor => {
    const active = model.task.sponsors.some(row => row.sponsorId === sponsor.id && row.end == null);
    return <button key={sponsor.id} className={`rail-brand ${active ? 'isactive' : ''}`} type="button"
      onClick={() => window.tagSponsor?.(sponsor.id)} disabled={!model.canSponsor}
      aria-label={`${sponsor.name} · ${active ? 'LIVE, click to stop' : 'OFF, click to start'}`} aria-pressed={active}
      title={`${sponsor.name} · ${active ? 'LIVE' : 'OFF'}`}>
      <span className="rail-logo"><BrandLogo sponsor={sponsor} /></span>
      <span className={`rail-live-pill ${active ? 'on' : 'off'}`} aria-hidden="true">● {active ? 'LIVE' : 'OFF'}</span>
    </button>;
  })}</div>;
}

type TimelineDelete = { key: 'sponsors'|'events'|'cameras'; id: string; name: string; x: number; y: number };
function TimelineTrack({ name, items, kind, model, onContextMenu }: { name: string; items: AnnotationBase[]; kind: TrackKind; model: StudioScreenModel; onContextMenu: (next: TimelineDelete) => void }) {
  const duration = model.duration || 3600;
  const canDelete = kind === 'sponsor' ? model.canSponsor : model.canContext;
  return <div className="trackrow" data-timeline-kind={kind}><span className="trackname" title={name}>{name}</span>
    <div className="track" onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width > 0) window.seekVideo?.(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration);
    }}>
      {items.map(item => {
        const start = Math.max(0, Math.min(item.start, duration));
        const end = Math.max(0, Math.min(item.end == null ? Math.max(item.start, model.task.observedTime || 0, model.tick) : item.end, duration));
        const point = kind === 'event' && (item as EventAnnotation).kind === 'point';
        return <span key={item.id} title={`${name}: ${fmt(item.start)}${point ? '' : ` – ${fmt(item.end == null ? model.tick : item.end)}`}${canDelete ? ' · Right-click to delete' : ''}`}
          onContextMenu={(event: MouseEvent<HTMLSpanElement>) => {
            if(!canDelete)return;
            event.preventDefault();event.stopPropagation();
            onContextMenu({key:kind==='sponsor'?'sponsors':kind==='event'?'events':'cameras',id:item.id,name,x:event.clientX,y:event.clientY});
          }}
          className={`block ${kind} ${item.end == null ? 'open' : ''} ${point ? 'dotpoint' : ''}`}
          style={{ left: `${100 * start / duration}%`, width: `${point ? .15 : Math.max(.15, 100 * (end - start) / duration)}%` }} />;
      })}
      <span className="playhead" style={{ left: `${100 * model.tick / duration}%` }} />
    </div>
  </div>;
}

export function StudioTimeline({ model }: StudioProps) {
  const [filter, setFilter] = useState<'all'|'sponsors'|'events'|'cameras'>('all');
  const [menu, setMenu] = useState<TimelineDelete | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const closeEscape = (event: KeyboardEvent) => { if(event.key==='Escape')setMenu(null); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside);document.removeEventListener('keydown', closeEscape); };
  }, [menu]);
  const show = (kind: TrackKind) => filter === 'all' || filter === `${kind}s`;
  const lines: { name: string; items: AnnotationBase[]; kind: TrackKind }[] = [];
  const measurable = (row:AnnotationBase) => row.end == null || row.end > row.start;
  if (show('sponsor')) model.sponsors.forEach(item => {const items=model.task.sponsors.filter(row => row.sponsorId === item.id && measurable(row));if(items.length)lines.push({name:item.name,items,kind:'sponsor'});});
  if (show('event')) model.events.forEach(item => {const items=model.task.events.filter(row => row.eventId === item.id && measurable(row));if(items.length)lines.push({name:item.name,items,kind:'event'});});
  if (show('camera')) model.cameras.forEach(item => {const items=model.task.cameras.filter(row => row.cameraId === item.id && measurable(row));if(items.length)lines.push({name:item.name,items,kind:'camera'});});
  return <div className="timeline-content">
    <div className="timeline-filter"><label htmlFor="timelineLayerFilter">SHOW TRACKS</label><select id="timelineLayerFilter" value={filter} onChange={event => {setFilter(event.target.value as typeof filter);setMenu(null);}}>
      <option value="all">All annotations</option><option value="sponsors">Sponsors</option><option value="events">Events</option><option value="cameras">Cameras</option>
    </select><span>{lines.length} recorded tracks · right-click a segment to remove it</span></div>
    {lines.length ? <><div className="track-top">{[0, .25, .5, .75, 1].map(share => <span key={share}>{fmt(model.duration * share)}</span>)}</div>
      {lines.map((line, index) => <TimelineTrack key={`${line.kind}:${index}`} {...line} model={model} onContextMenu={setMenu} />)}</>
      : <div className="timeline-empty">No {filter === 'all' ? '' : `${filter} `}intervals recorded yet. Use the tagging controls to begin an annotation.</div>}
    {menu && <div ref={menuRef} className="timeline-context-menu" role="menu" style={{left:Math.max(8,Math.min(menu.x,window.innerWidth-215)),top:Math.max(8,Math.min(menu.y,window.innerHeight-65))}}>
      <span>{menu.name}</span><button type="button" role="menuitem" onClick={() => {const target=menu;setMenu(null);window.deleteLog?.(target.key,target.id);}}>Delete annotation</button>
    </div>}
  </div>;
}

type LogEntry = (SponsorAnnotation & { key: 'sponsors'; type: string; itemId: string; color: string }) |
  (EventAnnotation & { key: 'events'; type: string; itemId: string; color: string }) |
  (CameraAnnotation & { key: 'cameras'; type: string; itemId: string; color: string });

export function StudioLogs({ model }: StudioProps) {
  const logs: LogEntry[] = [
    ...model.task.sponsors.map(row => ({ ...row, key: 'sponsors' as const, type: 'Sponsor', itemId: row.sponsorId, color: '#ff9b36' })),
    ...model.task.events.map(row => ({ ...row, key: 'events' as const, type: 'Event', itemId: row.eventId, color: '#d7c7b5' })),
    ...model.task.cameras.map(row => ({ ...row, key: 'cameras' as const, type: 'Camera', itemId: row.cameraId, color: '#9cabb0' })),
  ].sort((a, b) => b.start - a.start);
  function label(row: LogEntry) {
    const items = row.key === 'sponsors' ? model.sponsors : row.key === 'events' ? model.events : model.cameras;
    return items.find(item => item.id === row.itemId)?.name || row.itemId;
  }
  return <div className="logtable"><table className="table"><thead><tr>
    <th>START</th><th>TYPE</th><th>ATTRIBUTE</th><th>END</th><th>PLACEMENT TYPE / VISIBILITY QUALITY</th><th>ACTIONS</th>
  </tr></thead><tbody>{logs.map(row => <tr key={row.id}>
    <td className="nowrap" style={{ fontWeight: 900 }}>{fmt(row.start)}</td>
    <td><span style={{ color: row.color, fontWeight: 800 }}>{row.type}</span></td>
    <td>{label(row)}</td>
    <td>{row.end == null ? <span style={{ color: '#15ac76', fontWeight: 900 }}>Recording…</span> : row.key === 'events' && row.kind === 'point' ? 'Moment' : fmt(row.end)}</td>
    <td>{row.key === 'sponsors' ? <div className="exposure-attribute-inputs">
      <label>PRIMARY PLACEMENT<select aria-label={`Placement type for ${label(row)}`} value={row.placement || ''} disabled={!model.canSponsor} onChange={event => window.setExposureAttribute?.(row.id, 'placement', event.target.value)}>
        <option value="">NOT CLASSIFIED</option>{PLACEMENT_TYPES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      <label>VISIBILITY QUALITY<select aria-label={`Visibility quality for ${label(row)}`} value={row.quality || ''} disabled={!model.canSponsor} onChange={event => window.setExposureAttribute?.(row.id, 'quality', event.target.value)}>
        <option value="">NOT CLASSIFIED</option>{VISIBILITY_QUALITIES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label></div> : <span className="muted small">—</span>}</td>
    <td><button type="button" className="button ghost tiny" onClick={() => window.seekVideo?.(row.start)} title="Jump to time"><Icon name="play" /></button>
      {(row.key === 'sponsors' ? model.canSponsor : model.canContext) && <button type="button" className="button ghost tiny" onClick={() => window.deleteLog?.(row.key, row.id)} title="Remove log"><Icon name="close" /></button>}</td>
  </tr>)}{!logs.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No actions recorded yet</td></tr>}</tbody></table>
    <p className="exposure-meta-note">For each sponsor appearance, select the primary placement and readability. Unknown stays unclassified. If placement or clarity changes materially during an appearance, end the interval and start a new one.</p>
  </div>;
}

declare global {
  interface Window {
    tagSponsor?: (id: string) => void;
    tagEvent?: (id: string) => void;
    tagCamera?: (id: string) => void;
    setExposureAttribute?: (id: string, field: 'placement' | 'quality', value: string) => void;
    deleteLog?: (key: 'sponsors' | 'events' | 'cameras', id: string) => void;
  }
}

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { StudioScreenModel } from '../types/screen';
import type { AnnotationBase, CameraAnnotation, EventAnnotation, Sponsor, SponsorAnnotation, TagAttribute } from '../types/models';
import { formatTimestamp as fmt } from '../domain/intervals';
import { annotatedEndpoint } from '../domain/labelingProgress';
import { PLACEMENT_TYPES, VISIBILITY_QUALITIES } from '../domain/classifications';
import { displayHotkey } from '../domain/hotkeys';
import { sponsorProperties, sponsorPropertyIntervals } from '../domain/sponsorProperties';

type StudioProps = { model: StudioScreenModel };
type TrackKind = 'sponsor' | 'event' | 'camera' | 'property';

function Icon({ name }: { name: string }) { return <svg className="ic"><use href={`#i-${name}`} /></svg>; }

export function BrandLogo({ sponsor, className = 'tinylogo' }: { sponsor: Sponsor; className?: string }) {
  const initials = sponsor.name.split(' ').map(part => part[0]).join('').slice(0, 3).toUpperCase();
  const style: CSSProperties | undefined = sponsor.logo ? undefined : { background: `${sponsor.color || '#f2eff8'}25`, color: sponsor.color || '#665b87' };
  return <div className={className} style={style}>{sponsor.logo ? <img src={sponsor.logo} alt="" /> : initials}</div>;
}

function EventChip({ item, active, recorded, editing, disabled, camera }: { item: TagAttribute; active: boolean; recorded: boolean; editing: boolean; disabled: boolean; camera: boolean }) {
  const recordedAction = 'SAVED at this time, tap to edit this interval';
  return <button type="button" className={`event-chip tagged-state-chip ${camera ? 'camera-chip' : ''} ${active ? 'active' : ''} ${recorded ? 'recorded' : ''}`}
    onClick={() => camera ? window.tagCamera?.(item.id) : window.tagEvent?.(item.id)} disabled={disabled}
    aria-pressed={active || recorded || editing} aria-label={`${item.name}${item.hotkey ? `, ${displayHotkey(item.hotkey)}` : ''} · ${editing ? 'EDITING, seek to new end and tap to save' : active ? 'LIVE, tap to end' : recorded ? recordedAction : 'OFF, tap to start'}`}
    title={`${item.name}${item.hotkey ? ` · ${displayHotkey(item.hotkey)}` : ''} · ${editing ? 'EDITING — tap to save at playhead' : active ? 'LIVE' : recorded ? 'SAVED — click to edit this interval' : 'OFF'}`}>
    <span className="chip-symbol">{camera ? '◎' : '↔'}</span><span className="chip-label">{item.name}</span>
    {item.hotkey && <kbd className="hotkey-hint">{displayHotkey(item.hotkey)}</kbd>}
    <span className={`tag-live-pill ${active ? 'on' : recorded ? 'recorded' : 'off'}`} aria-hidden="true">● {editing ? 'EDITING' : active ? 'LIVE' : recorded ? 'SAVED' : 'OFF'}</span>
  </button>;
}

function EventButtons({ model, camera }: StudioProps & { camera: boolean }) {
  const items = camera ? model.cameras : model.events;
  const active = camera ? model.task.cameras : model.task.events;
  return <>{items.map(item => {
    const matching=active.filter(annotation=>(camera?(annotation as CameraAnnotation).cameraId:(annotation as EventAnnotation).eventId)===item.id);
    const live=matching.some(row=>row.end==null&&row.start<=model.tick);
    const editing=camera&&model.editingInterval?.key==='cameras'&&model.editingInterval.cameraId===item.id;
    return <EventChip key={item.id} item={item} camera={camera} disabled={!model.canContext} editing={editing}
      active={live}
      recorded={!live&&matching.some(row=>row.end!==null&&(row.start<=model.tick&&model.tick<row.end||('kind' in row&&row.kind==='point'&&Math.abs(row.start-model.tick)<.5)))} />;
  })}</>;
}

export function StudioControls({ model }: StudioProps) {
  if (model.selectedTab === 'events') return <section className="studio-chip-group studio-secondary-controls"><div className="chip-group-title"><span>CAMERA ANGLES</span><small>ONE LIVE ANGLE · SELECT ANOTHER TO SWITCH</small></div><div className="event-chip-row">{model.cameras.length ? <EventButtons model={model} camera /> : <span className="studio-layer-hint">No camera angles assigned to this match.</span>}</div></section>;
  if (model.selectedTab === 'cameras') return <section className="studio-chip-group studio-secondary-controls"><div className="chip-group-title"><span>KEY MATCH EVENTS</span><small>TAP TO START · TAP AGAIN TO END</small></div><div className="event-chip-row">{model.events.length ? <EventButtons model={model} camera={false} /> : <span className="studio-layer-hint">No key match events assigned to this match.</span>}</div></section>;
  if (model.selectedTab === 'sponsors') return <div className="studio-layer-hint">Select sponsor logos from the right-hand SPONSORS panel. The timeline below shows sponsor visibility only.</div>;
  return <>
    <section className="studio-chip-group"><div className="chip-group-title"><span>KEY MATCH EVENTS</span><small>TAP TO START · TAP AGAIN TO END</small></div><div className="event-chip-row"><EventButtons model={model} camera={false} /></div></section>
    <section className="studio-chip-group"><div className="chip-group-title"><span>CAMERA ANGLES</span><small>ONE LIVE ANGLE · SELECT ANOTHER TO SWITCH</small></div><div className="event-chip-row"><EventButtons model={model} camera /></div></section>
  </>;
}

export function StudioRail({ model }: StudioProps) {
  const [expanded,setExpanded]=useState<string|null>(null);
  if (model.selectedTab === 'events' || model.selectedTab === 'cameras') {
    const camera = model.selectedTab === 'cameras';
    const items = camera ? model.cameras : model.events;
    return <div className="side-tag-list">{items.length ? <EventButtons model={model} camera={camera} /> : <span className="rail-empty">No {camera ? 'camera angles' : 'key event tags'} assigned to this match.</span>}</div>;
  }
  if (!model.sponsors.length) return <div className="rail-empty">No sponsors assigned to this match.</div>;
  return <div className="rail-cards">{model.sponsors.map(sponsor => {
    const active = model.task.sponsors.some(row => row.sponsorId === sponsor.id && row.end == null && row.start <= model.tick);
    const recorded = !active&&model.task.sponsors.some(row=>row.sponsorId===sponsor.id&&row.end!==null&&row.start<=model.tick&&model.tick<row.end);
    const appearance=model.task.sponsors.find(row=>row.sponsorId===sponsor.id&&row.end===null&&row.start<=model.tick) || model.task.sponsors.find(row=>row.sponsorId===sponsor.id&&row.end!==null&&row.start<=model.tick&&model.tick<row.end);
    const properties=sponsorProperties(sponsor);
    const choices=properties.map(property=>({...property,options:property.options.filter(option=>option.id!==property.defaultOptionId)})).filter(property=>property.options.length>0);
    const subOpen=expanded===sponsor.id&&!!appearance;
    const hasSelectedSub=!!appearance&&choices.some(property=>appearance.properties?.[property.id]&&appearance.properties[property.id]!==property.defaultOptionId);
    return <div className={`rail-brand-wrap ${choices.length?'has-sub-attributes':''} ${subOpen?'sub-open':''}`} key={sponsor.id}><button className={`rail-brand ${active ? 'isactive' : ''} ${recorded?'isrecorded':''}`} type="button"
      onClick={() => window.tagSponsor?.(sponsor.id)} disabled={!model.canSponsor}
      aria-label={`${sponsor.name}${sponsor.hotkey ? `, ${displayHotkey(sponsor.hotkey)}` : ''} · ${active ? 'LIVE, click to stop' : recorded ? 'SAVED at this time, click to re-tag from here' : 'OFF, click to start'}`} aria-pressed={active||recorded}
      title={`${sponsor.name}${sponsor.hotkey ? ` · ${displayHotkey(sponsor.hotkey)}` : ''} · ${active ? 'LIVE' : recorded ? 'SAVED — click to re-tag from here' : 'OFF'}`}>
      <span className="rail-logo"><BrandLogo sponsor={sponsor} /></span>
      {sponsor.hotkey && <kbd className="hotkey-hint rail-hotkey">{displayHotkey(sponsor.hotkey)}</kbd>}
      <span className={`rail-live-pill ${active ? 'on' : recorded ? 'recorded' : 'off'}`} aria-hidden="true">● {active ? 'LIVE' : recorded ? 'SAVED' : 'OFF'}</span>
    </button>
    {choices.length>0&&<>
      <button type="button" className={`rail-sub-trigger ${hasSelectedSub?'selected':''}`} disabled={!model.canSponsor||!appearance}
        title={appearance?'Edit sub-attributes for this sponsor appearance':'Start or select a sponsor appearance before changing sub-attributes'}
        aria-label={`SUB attributes for ${sponsor.name}`} aria-expanded={subOpen}
        onClick={()=>setExpanded(subOpen?null:sponsor.id)}>SUB</button>
      {subOpen&&<div className="rail-sub-menu" role="group" aria-label={`Sub-attributes for ${sponsor.name}`}>
        {choices.map(property=><div key={property.id} className="sub-property-group"><span className="sub-property-heading">{property.name}</span>
          {property.options.map(option=>{
            const selected=appearance.properties?.[property.id]===option.id;
            return <button key={option.id} type="button" className={`sub-property-choice ${selected?'selected':''}`}
              aria-pressed={selected} disabled={!model.canSponsor} title={selected?'Tap again to return to the default':'Apply to this sponsor appearance'}
              onClick={()=>window.setSponsorProperty?.(appearance.id,property.id,selected?property.defaultOptionId:option.id)}>{option.label}</button>;
          })}</div>)}
      </div>}
    </>}
    </div>;
  })}</div>;
}

type TimelineDelete = { key: 'sponsors'|'events'|'cameras'; id: string; name: string; x: number; y: number };
type IntervalEdit = {key:'sponsors'|'events'|'cameras';id:string;start:number;end:number};
function TimelineTrack({ name, items, kind, color, model, duration, onContextMenu, draft, setDraft }: { name: string; items: AnnotationBase[]; kind: TrackKind; color?: string; model: StudioScreenModel; duration: number; onContextMenu: (next: TimelineDelete) => void; draft:IntervalEdit|null;setDraft:(edit:IntervalEdit)=>void }) {
  const canDelete = kind === 'property' ? false : kind === 'sponsor' ? model.canSponsor : model.canContext;
  const nudge=(event:React.KeyboardEvent<HTMLSpanElement>,side:'start'|'end',base:IntervalEdit)=>{
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
    event.preventDefault();event.stopPropagation();
    const delta=event.key==='ArrowLeft'?-0.1:0.1;
    const raw=Math.round((base[side]+delta)*100)/100;
    setDraft({...base,[side]:side==='start'?Math.max(0,Math.min(raw,base.end-.01)):Math.min(duration,Math.max(raw,base.start+.01))});
  };
  const startHandle=(event:ReactPointerEvent<HTMLSpanElement>,side:'start'|'end',base:IntervalEdit)=>{
    event.preventDefault();event.stopPropagation();
    const track=event.currentTarget.closest('.track') as HTMLElement|null;
    if(!track)return;
    const rect=track.getBoundingClientRect();
    const move=(next:globalThis.PointerEvent)=>{
      const value=Math.max(0,Math.min(duration,(next.clientX-rect.left)/rect.width*duration));
      const rounded=Math.round(value*100)/100;
      setDraft({...base,[side]:side==='start'?Math.min(rounded,base.end-.01):Math.max(rounded,base.start+.01)});
    };
    const stop=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',stop);};
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop);document.addEventListener('pointercancel',stop);
  };
  return <div className="trackrow" data-timeline-kind={kind}><span className="trackname" title={name}>{name}</span>
    <div className="track" onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width > 0) window.seekVideo?.(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration);
    }}>
      {items.map(item => {
        const key=kind==='sponsor'||kind==='property'?'sponsors':kind==='event'?'events':'cameras';
        const editing=!!draft&&draft.key===key&&draft.id===item.id;
        const start = Math.max(0, Math.min(editing?draft.start:item.start, duration));
        const end = Math.max(0, Math.min(editing?draft.end:item.end == null ? Math.max(item.start, model.task.observedTime || 0, model.tick) : item.end, duration));
        const point = kind === 'event' && (item as EventAnnotation).kind === 'point';
        return <span key={item.id} title={`${name}: ${fmt(start)}${point ? '' : ` – ${fmt(end)}`}${canDelete ? kind==='sponsor'&&item.end!==null?' · Click to re-tag · Right-click to edit or delete':' · Right-click to edit or delete' : ''}`}
          onContextMenu={(event: MouseEvent<HTMLSpanElement>) => {
            if(!canDelete)return;
            event.preventDefault();event.stopPropagation();
            onContextMenu({key:kind==='sponsor'?'sponsors':kind==='event'?'events':'cameras',id:item.id,name,x:event.clientX,y:event.clientY});
          }}
          onClick={event=>{
            event.stopPropagation();
            if((event.target as Element).closest('.timeline-resize-handle'))return;
            const rect=event.currentTarget.getBoundingClientRect();
            const at=rect.width>0&&!point?start+Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*(end-start):item.start;
            window.seekVideo?.(at);
            if(!draft&&kind==='sponsor'&&item.end!==null&&canDelete&&at<item.end)window.retagRecordedSponsor?.(item.id,at);
          }}
          className={`block ${kind} ${item.end == null ? 'open' : ''} ${point ? 'dotpoint' : ''} ${editing ? 'timeline-block-editing':''}`}
          style={{ left: `${100 * start / duration}%`, width: `${point ? .15 : Math.max(.15, 100 * (end - start) / duration)}%`, ...(color ? {'--segment-color':color} as CSSProperties : {}) }}>
          {editing && !point && <>
            <span className="timeline-resize-handle start" role="slider" aria-label={`Adjust ${name} start`} aria-valuenow={start} aria-valuemin={0} aria-valuemax={end} tabIndex={0} onPointerDown={event=>startHandle(event,'start',draft)} onKeyDown={event=>nudge(event,'start',draft)} />
            <span className="timeline-resize-handle end" role="slider" aria-label={`Adjust ${name} end`} aria-valuenow={end} aria-valuemin={start} aria-valuemax={duration} tabIndex={0} onPointerDown={event=>startHandle(event,'end',draft)} onKeyDown={event=>nudge(event,'end',draft)} />
          </>}
        </span>;
      })}
    </div>
  </div>;
}

export function StudioTimeline({ model }: StudioProps) {
  const [filter, setFilter] = useState<'all'|'sponsors'|'events'|'cameras'>('all');
  const [menu, setMenu] = useState<TimelineDelete | null>(null);
  const [zoom, setZoom] = useState(1);
  const [draft,setDraft] = useState<IntervalEdit|null>(model.editingInterval ? {...model.editingInterval} : null);
  const [editExtra,setEditExtra]=useState(0);
  const scrubbing = useRef<number|null>(null);
  const scrubFrame=useRef<number|null>(null);
  const pendingSeek=useRef<number|null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    setDraft(model.editingInterval ? {...model.editingInterval} : null);
    setEditExtra(0);
  },[model.editingInterval?.key,model.editingInterval?.id]);
  useEffect(()=>()=>{if(scrubFrame.current!==null)cancelAnimationFrame(scrubFrame.current);},[]);
  useEffect(()=>{
    const el=timelineRef.current;if(!el)return;
    const wheel=(event:WheelEvent)=>{
      if(!event.ctrlKey)return;
      event.preventDefault();
      setZoom(value=>Math.max(1,Math.min(8,Math.round((value+(event.deltaY<0?0.5:-0.5))*2)/2)));
    };
    el.addEventListener('wheel',wheel,{passive:false});
    return ()=>el.removeEventListener('wheel',wheel);
  },[]);
  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const closeEscape = (event: KeyboardEvent) => { if(event.key==='Escape')setMenu(null); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside);document.removeEventListener('keydown', closeEscape); };
  }, [menu]);
  const show = (kind: TrackKind) => filter === 'all' || filter === (kind==='property'?'sponsors':`${kind}s`);
  const lines: { name: string; items: AnnotationBase[]; kind: TrackKind; color?:string }[] = [];
  const measurable = (row:AnnotationBase) => row.end == null || row.end > row.start;
  if (show('sponsor')) model.sponsors.forEach(item => {
    const items=model.task.sponsors.filter(row => row.sponsorId === item.id && measurable(row));
    if(items.length)lines.push({name:item.name,items,kind:'sponsor',color:item.color});
    // Child lanes inherit exact parent boundaries, including LIVE end:null.
    const nested=items.flatMap(row=>sponsorPropertyIntervals(row,item).map(property=>({row,property})));
    for(const propertyName of [...new Set(nested.map(entry=>`${entry.property.propertyName}: ${entry.property.optionLabel}`))]){
      const intervals=nested.filter(entry=>`${entry.property.propertyName}: ${entry.property.optionLabel}`===propertyName).map(entry=>entry.row);
      if(intervals.length)lines.push({name:`↳ ${propertyName}`,items:intervals,kind:'property',color:'#dca25f'});
    }
  });
  if (show('event')) model.events.forEach(item => {const items=model.task.events.filter(row => row.eventId === item.id && (measurable(row)||row.kind==='point'));if(items.length)lines.push({name:item.name,items,kind:'event'});});
  if (show('camera')) model.cameras.forEach(item => {const items=model.task.cameras.filter(row => row.cameraId === item.id && measurable(row));if(items.length)lines.push({name:item.name,items,kind:'camera'});});
  const endpoint=annotatedEndpoint(model.task,model.tick);
  const duration=Math.min(model.duration||3600,Math.max(60,Math.ceil((Math.max(endpoint,draft?.end||0)+(draft?60+editExtra:0))/60)*60));
  const scrub=(event:ReactPointerEvent<HTMLElement>)=>{
    const lane=event.currentTarget.closest('.timeline-scaled')?.querySelector('.timeline-global-playhead-area');
    const rect=lane?.getBoundingClientRect();
    if(!rect||rect.width<=0)return;
    pendingSeek.current=Math.min(duration,Math.max(0,(event.clientX-rect.left)/rect.width*duration));
    if(scrubFrame.current===null)scrubFrame.current=requestAnimationFrame(()=>{scrubFrame.current=null;if(pendingSeek.current!==null)window.seekVideo?.(pendingSeek.current);});
  };
  const beginScrub=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if((event.target as Element).closest('.block,.timeline-resize-handle'))return;
    if(event.button!==0)return;
    scrubbing.current=event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    scrub(event);
  };
  const moveScrub=(event:ReactPointerEvent<HTMLDivElement>)=>{if(scrubbing.current===event.pointerId)scrub(event);};
  const endScrub=(event:ReactPointerEvent<HTMLDivElement>)=>{if(scrubbing.current===event.pointerId){scrubbing.current=null;if(scrubFrame.current!==null){cancelAnimationFrame(scrubFrame.current);scrubFrame.current=null;}if(pendingSeek.current!==null)window.seekVideo?.(pendingSeek.current);event.currentTarget.releasePointerCapture?.(event.pointerId);}};
  return <div className="timeline-content">
    <div className="timeline-filter"><label htmlFor="timelineLayerFilter">SHOW TRACKS</label><select id="timelineLayerFilter" value={filter} onChange={event => {setFilter(event.target.value as typeof filter);setMenu(null);}}>
      <option value="all">All annotations</option><option value="sponsors">Sponsors</option><option value="events">Events</option><option value="cameras">Cameras</option>
    </select><span>{lines.length} recorded tracks · timeline through {fmt(endpoint)} · Ctrl + scroll to zoom{model.tick>duration?' · playhead is beyond recorded range':''}</span><span className="timeline-zoom-label">{zoom}×</span><button type="button" className="button ghost tiny studio-control-button" onClick={()=>setZoom(1)}>Reset zoom</button></div>
    {draft && <div className="timeline-edit-toolbar"><strong>{draft.key==='cameras'?'EDIT SAVED CAMERA · Seek, then tap its chip to end · Or drag an edge':'EDIT INTERVAL · Drag either edge · ←/→ moves 0.1 sec'}</strong><span>{fmt(draft.start)} – {fmt(draft.end)}</span><button type="button" className="button ghost tiny studio-control-button" onClick={()=>setEditExtra(x=>x+60)}>+ 1 min view</button><button type="button" className="button primary tiny studio-control-button" onClick={()=>window.saveTimelineEdit?.(draft.key,draft.id,draft.start,draft.end)} disabled={draft.end<=draft.start}>Save interval</button><button type="button" className="button ghost tiny studio-control-button" onClick={()=>window.cancelTimelineEdit?.()}>Cancel</button></div>}
    {lines.length ? <div className="timeline-viewport" ref={timelineRef} aria-label="Zoomable annotated timeline"><div className="timeline-scaled" style={{width:`${zoom*100}%`}}><div className="track-top" onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>{[0, .25, .5, .75, 1].map(share => <span key={share}>{fmt(duration * share)}</span>)}</div>
      <div className="timeline-track-stack" onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>
        {lines.map((line, index) => <TimelineTrack key={`${line.kind}:${index}`} {...line} duration={duration} model={model} onContextMenu={setMenu} draft={draft} setDraft={setDraft} />)}
        <div className="timeline-global-playhead-area" aria-hidden="true">{model.tick<=duration&&<span className="timeline-global-playhead" style={{left:`${100 * Math.max(0,Math.min(1,model.tick/duration))}%`}} />}</div>
      </div></div></div>
      : <div className="timeline-empty">No {filter === 'all' ? '' : `${filter} `}intervals recorded yet. Use the tagging controls to begin an annotation.</div>}
    {menu && <div ref={menuRef} className="timeline-context-menu" role="menu" style={{left:Math.max(8,Math.min(menu.x,window.innerWidth-215)),top:Math.max(8,Math.min(menu.y,window.innerHeight-128))}}>
      <span>{menu.name}</span><button type="button" role="menuitem" onClick={()=>{const target=menu;setMenu(null);window.editRecordedAnnotation?.(target.key,target.id);}}>Edit interval</button><button type="button" role="menuitem" onClick={() => {const target=menu;setMenu(null);window.deleteLog?.(target.key,target.id);}}>Delete annotation</button>
    </div>}
  </div>;
}

type LogEntry = (SponsorAnnotation & { key: 'sponsors'; type: string; itemId: string; color: string }) |
  (EventAnnotation & { key: 'events'; type: string; itemId: string; color: string }) |
  (CameraAnnotation & { key: 'cameras'; type: string; itemId: string; color: string });

export function StudioLogs({ model }: StudioProps) {
  const [expandedProperties,setExpandedProperties]=useState<string|null>(null);
  const logs: LogEntry[] = [
    ...model.task.sponsors.map(row => ({ ...row, key: 'sponsors' as const, type: 'Sponsor', itemId: row.sponsorId, color: '#ff9b36' })),
    ...model.task.events.map(row => ({ ...row, key: 'events' as const, type: 'Event', itemId: row.eventId, color: '#d7c7b5' })),
    ...model.task.cameras.map(row => ({ ...row, key: 'cameras' as const, type: 'Camera', itemId: row.cameraId, color: '#9cabb0' })),
  ].sort((a, b) => b.start - a.start);
  function label(row: LogEntry) {
    const items = row.key === 'sponsors' ? model.sponsors : row.key === 'events' ? model.events : model.cameras;
    return items.find(item => item.id === row.itemId)?.name || row.itemId;
  }
  return <div className="logtable studio-recorded-log"><table className="table"><colgroup>
    <col style={{width:'7%'}} /><col style={{width:'8%'}} /><col style={{width:'15%'}} /><col style={{width:'7%'}} /><col style={{width:'48%'}} /><col style={{width:'15%'}} />
  </colgroup><thead><tr>
    <th>START</th><th>TYPE</th><th>ATTRIBUTE</th><th>END</th><th>PLACEMENT / SUB-ATTRIBUTES</th><th>ACTIONS</th>
  </tr></thead><tbody>{logs.map(row => <tr key={row.id}>
    <td className="nowrap" style={{ fontWeight: 900 }}>{fmt(row.start)}</td>
    <td><span style={{ color: row.color, fontWeight: 800 }}>{row.type}</span></td>
    <td>{label(row)}</td>
    <td>{row.end == null ? <span style={{ color: '#15ac76', fontWeight: 900 }}>Recording…</span> : row.key === 'events' && row.kind === 'point' ? 'Moment' : fmt(row.end)}</td>
    <td>{row.key === 'sponsors' ? <div className="exposure-attribute-inputs">
      <label>PRIMARY PLACEMENT<select aria-label={`Placement type for ${label(row)}`} value={row.placement || ''} disabled={!model.canSponsor} onChange={event => window.setExposureAttribute?.(row.id, 'placement', event.target.value)}>
        <option value="">NOT CLASSIFIED</option>{PLACEMENT_TYPES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      {row.quality&&<label>LEGACY VISIBILITY QUALITY<select aria-label={`Visibility quality for ${label(row)}`} value={row.quality} disabled={!model.canSponsor} onChange={event => window.setExposureAttribute?.(row.id, 'quality', event.target.value)}>
        <option value="">NOT CLASSIFIED</option>{VISIBILITY_QUALITIES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>}
      {(()=>{const sponsor=model.sponsors.find(item=>item.id===row.sponsorId);if(!sponsor)return null;
        const properties=sponsorProperties(sponsor);
        const choices=properties.map(property=>({...property,options:property.options.filter(option=>option.id!==property.defaultOptionId)})).filter(property=>property.options.length>0);
        return choices.length>0&&<div className="recorded-properties">
          {sponsorPropertyIntervals(row,sponsor).map(property=><span key={property.propertyId} className="property-value-badge">{property.propertyName}: {property.optionLabel} · {fmt(property.start)}–{property.end===null?'LIVE':fmt(property.end)}</span>)}
          <button type="button" className="button ghost tiny studio-control-button" disabled={!model.canSponsor} aria-expanded={expandedProperties===row.id} aria-label={`SUB attributes for ${sponsor.name} interval`} onClick={()=>setExpandedProperties(expandedProperties===row.id?null:row.id)}>SUB</button>
          {expandedProperties===row.id&&choices.map(property=><div key={property.id} className="sub-property-group"><span className="sub-property-heading">{property.name}</span>{property.options.map(option=>{
            const selected=row.properties?.[property.id]===option.id;
            return <button key={option.id} type="button" className={`sub-property-choice ${selected?'selected':''}`} disabled={!model.canSponsor} aria-pressed={selected}
              onClick={()=>window.setSponsorProperty?.(row.id,property.id,selected?property.defaultOptionId:option.id)}>{option.label}</button>;
          })}</div>)}
        </div>;
      })()}</div> : <span className="muted small">—</span>}</td>
    <td><div className="studio-log-actions"><button type="button" className="button ghost tiny studio-control-button studio-log-icon" onClick={() => window.seekVideo?.(row.start)} title="Jump to time" aria-label={`Jump to ${fmt(row.start)}`}><Icon name="play" /></button>
      {model.pendingBackfillIds.includes(row.id)?<span className="tag" title="This early-gap interval will be saved when you end the tag">GAP DRAFT · END TAG TO SAVE</span>:<>
        <button type="button" className="button ghost tiny studio-control-button" onClick={()=>window.openAnnotationHistory?.(row.id)} title="View item history and restore a previous version">HISTORY</button>
        {(row.key === 'sponsors' ? model.canSponsor : model.canContext) && <button type="button" className="button ghost tiny studio-control-button studio-log-icon" onClick={() => window.deleteLog?.(row.key, row.id)} title="Remove log" aria-label={`Remove ${label(row)} annotation`}><Icon name="close" /></button>}
      </>}</div></td>
  </tr>)}{!logs.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No actions recorded yet</td></tr>}</tbody></table>
    <p className="exposure-meta-note">Each sponsor property inherits its parent exposure's complete start and end time, including when added after tagging. Default property values stay hidden; legacy quality ratings remain available on existing records.</p>
  </div>;
}

declare global {
  interface Window {
    tagSponsor?: (id: string) => void;
    tagEvent?: (id: string) => void;
    tagCamera?: (id: string) => void;
    setExposureAttribute?: (id: string, field: 'placement' | 'quality', value: string) => void;
    setSponsorProperty?: (annotationId:string,propertyId:string,value:string) => void;
    deleteLog?: (key: 'sponsors' | 'events' | 'cameras', id: string) => void;
    editRecordedAnnotation?: (key: 'sponsors'|'events'|'cameras', id:string)=>void;
    retagRecordedSponsor?: (id:string, at:number)=>void;
    saveTimelineEdit?: (key:'sponsors'|'events'|'cameras',id:string,start:number,end:number)=>void;
    cancelTimelineEdit?: ()=>void;
    openAnnotationHistory?: (id:string)=>void;
  }
}

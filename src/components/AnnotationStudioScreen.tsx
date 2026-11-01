import { useEffect, useRef } from 'react';
import type { StudioScreenModel } from '../types/screen';
import { formatTimestamp } from '../domain/intervals';
import { VIDEO_PLAYBACK_RATES } from '../domain/videoPlayback';
import { StudioControls, StudioLogs, StudioRail, StudioTimeline } from './StudioWidgets';
import { AnnotationHistoryPanel } from './AnnotationHistoryPanel';
import { attachVideoAlignmentPause } from './videoAlignmentScroll';

function Icon({ name }: { name: string }) {
  return <svg className="ic"><use href={`#i-${name}`} /></svg>;
}

function StudioAction({ children, onClick, className = '' }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return <button type="button" className={className} onClick={() => { window.closeTaskMenu?.(); onClick(); }}>{children}</button>;
}

function ActionMenu({ model, isAdmin }: { model: StudioScreenModel; isAdmin: boolean }) {
  return <div className="task-actions-dropdown">
    <details className="task-actions" id="taskActionMenu">
      <summary aria-label="Task actions"><span>ACTIONS</span><span className="menu-glyph" aria-hidden="true">⋯</span></summary>
      <div className="task-menu-content">
        <StudioAction onClick={() => window.chooseVideo?.()}><Icon name="video" /> {model.isLocalVideo ? 'REPLACE LOCAL VIDEO' : 'OPEN LOCAL VIDEO'}</StudioAction>
        <StudioAction onClick={() => window.exportTask?.(model.id)}><Icon name="download" /> EXPORT JSON</StudioAction>
        {model.canSponsor&&!model.submitted.sponsors&&<StudioAction className="task-menu-complete" onClick={() => window.submitTaskStream?.('sponsors')}><Icon name="check" /> COMPLETE SPONSOR TAGGING</StudioAction>}
        {model.canContext&&!model.submitted.context&&<StudioAction className="task-menu-complete" onClick={() => window.submitTaskStream?.('context')}><Icon name="check" /> COMPLETE EVENTS & CAMERAS</StudioAction>}
        {isAdmin&&model.submitted.sponsors&&<StudioAction className="task-menu-reopen" onClick={() => window.reopenTaskStream?.('sponsors')}><Icon name="check" /> REOPEN SPONSOR TAGGING</StudioAction>}
        {isAdmin&&model.submitted.context&&<StudioAction className="task-menu-reopen" onClick={() => window.reopenTaskStream?.('context')}><Icon name="check" /> REOPEN EVENTS & CAMERAS</StudioAction>}
        {isAdmin && <>
          <StudioAction onClick={() => window.assignTaskModal?.(model.id)}><Icon name="users" /> ASSIGN TASK</StudioAction>
          <StudioAction onClick={() => window.addSponsorToCurrentTask?.()}><Icon name="plus" /> ADD SPONSOR / LOGO</StudioAction>
          <StudioAction onClick={() => window.createTaskModal?.(model.id)}><Icon name="settings" /> EDIT TASK</StudioAction>
          <StudioAction className="task-menu-delete" onClick={()=>window.deleteTask?.(model.id)}><Icon name="close" /> DELETE TASK</StudioAction>
        </>}
        <div className="task-menu-separator" />
        <StudioAction onClick={() => window.navigate?.('tasks')}>← ALL TASKS</StudioAction>
      </div>
    </details>
  </div>;
}

function VideoMetadata({ model }: { model: StudioScreenModel }) {
  const { videoSrc, videoName, videoType, isLocalVideo } = model;
  const sourceState = isLocalVideo ? 'LOCAL VIDEO' : videoType === 's3' ? 'PRIVATE VIDEO · CLOUDFRONT' : videoType === 'buildup' ? 'BUILDUP VIDEO' : videoType === 'ftp' ? 'FTP LINK · INGEST REQUIRED' : videoSrc ? 'HTTPS VIDEO' : 'NO VIDEO ATTACHED';
  const sourceNote = model.videoError || (isLocalVideo ? `${videoName || 'Video'} · Available in this browser session only. Select it again after refreshing.` : videoSrc ? `${videoName || 'Video'}${model.videoDimensions ? ` · ${model.videoDimensions}` : ''}` : 'Open a local video or configure a direct HTTPS source.');
  return <>
    <div className="video-header"><span>LIVE TAGGING CONSOLE</span><div className="video-header-actions">
      <button type="button" className="button ghost tiny studio-control-button video-jump-last" onClick={()=>window.jumpToLastAnnotation?.()} disabled={model.lastAnnotatedAt===null} title="Jump to the end of the most recent saved annotation"><Icon name="clock" /> LAST ANNOTATED {model.lastAnnotatedAt!==null?formatTimestamp(model.lastAnnotatedAt):''}</button>
      <span id="videoSourceState">{sourceState}</span>
    </div></div>
    <div id="videoFileStatus" className="video-source-note" role="status" aria-live="polite">{sourceNote}</div>
  </>;
}

function VideoPanel({ model }: { model: StudioScreenModel }) {
  const { videoSrc, videoType } = model;
  return <div className="video-box">
    <div className={`vidframe ${videoSrc ? 'video-native-frame' : ''}`}>
      {videoSrc ? <video id="matchVideo" preload="metadata" playsInline crossOrigin={videoType === 'buildup' ? 'use-credentials' : undefined} aria-label="Match video · original proportions" src={videoSrc} /> :
        <div className="fakepitch">
          <div className="field" /><div className="video-stamp">MESSI CUP · {model.number}</div>
          <strong>Ready for kickoff.</strong>
          <p>Open a video on this device to begin frame-accurate tagging.</p>
          <button className="button primary tiny" onClick={() => window.chooseVideo?.()}><Icon name="video" /> OPEN LOCAL VIDEO</button>
        </div>}
    </div>
    <div className="video-controls">
      <button onClick={() => window.togglePlay?.()} title="Play / Pause" id="playbutton"><Icon name={model.playing ? 'pause' : 'play'} /></button>
      <button onClick={() => window.skipByStep?.(-1)} aria-label="Seek backward" title="Seek backward"><span className="skip-number" id="skipBack">−{model.seekStep}s</span></button>
      <input className="seek" id="seek" aria-label="Video timestamp" type="range" min="0" max={model.duration} value={model.tick} step="0.1" onChange={event => window.seekVideo?.(event.currentTarget.value)} />
      <button onClick={() => window.skipByStep?.(1)} aria-label="Seek forward" title="Seek forward"><span className="skip-number" id="skipForward">+{model.seekStep}s</span></button>
      <span className="vidtime" id="vidtime">{formatTimestamp(model.tick)} / {formatTimestamp(model.duration)}</span>
      <div className="skip-setting" role="group" aria-label="Seek step">
        <span>STEP</span><button className={model.seekStep === 5 ? 'active' : ''} id="seekstep-5" onClick={() => window.setSeekStep?.(5)} aria-pressed={model.seekStep === 5}>5 SEC</button>
        <button className={model.seekStep === 10 ? 'active' : ''} id="seekstep-10" onClick={() => window.setSeekStep?.(10)} aria-pressed={model.seekStep === 10}>10 SEC</button>
      </div>
      <select className="rate rate-select" id="rateButton" aria-label="Video playback speed" title="Video playback speed" value={model.playbackRate} onChange={event => window.setPlaybackRate?.(Number(event.currentTarget.value))}>
        {VIDEO_PLAYBACK_RATES.map(rate => <option value={rate} key={rate}>{rate}×</option>)}
      </select>
    </div>
  </div>;
}

const tabs = [['all', 'All'], ['sponsors', 'Sponsors'], ['events', 'Events'], ['cameras', 'Camera']] as const;

export function AnnotationStudioScreen({ model, isAdmin }: { model: StudioScreenModel; isAdmin: boolean }) {
  const mediaColumnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const column = mediaColumnRef.current;
    const video = column?.querySelector<HTMLElement>('.video-box');
    if (column && video) return attachVideoAlignmentPause(column, video);
  }, []);

  return <div className="studio-grid">
    <div className="studio-media-column" ref={mediaColumnRef} role="region" aria-label="Video, annotation tools, and recorded actions" tabIndex={0}>
      <div className="studio-head">
      <div className="row between studio-title-layout">
        <div>
          <div className="eyebrow">ANNOTATION STUDIO / {model.number}</div>
          <h1>{model.name}</h1>
          <div className="studio-meta">
            <span className={`status ${model.status}`}>{model.status === 'done' ? 'Completed' : model.status === 'progress' ? 'In progress' : 'Ready to tag'}</span>{' '}
            <span>{model.date || 'Date not specified'}</span><span>·</span>
            <span>{formatTimestamp(model.duration)} expected video length</span><span>·</span>
            <span>Sponsor tagging: {model.sponsorAnalyst === 'Unassigned' ? 'Unassigned' : `Assigned to ${model.sponsorAnalyst}`}</span><span>·</span>
            <span>Events & cameras: {model.contextAnalyst === 'Unassigned' ? 'Unassigned' : `Assigned to ${model.contextAnalyst}`}</span>
          </div>
          <div className="studio-stream-statuses" aria-label="Independent annotation stream completion status">
            <span className={`studio-stream-state ${model.submitted.sponsors?'complete':'pending'}`}>SPONSORS · {model.submitted.sponsors?'COMPLETE':'PENDING'}</span>
            <span className={`studio-stream-state ${model.submitted.context?'complete':'pending'}`}>EVENTS & CAMERAS · {model.submitted.context?'COMPLETE':'PENDING'}</span>
          </div>
        </div>
        <ActionMenu model={model} isAdmin={isAdmin} />
      </div>
      </div>
        <VideoPanel model={model} />
        <div id="controlsBody" className="studio-quick-tags"><StudioControls model={model} /></div>
        <div className="card cardpad studio-maincard">
          <div className="tag-toolbar">
            <div><h2>Fast-tag controls</h2><p className="sub">Events and camera angles are timed intervals. Tap once to start, again to stop; switching cameras closes the previous view.</p></div>
            <div className="segmented">{tabs.map(([key, label]) => <button
              key={key} type="button" data-studio-tab={key} aria-pressed={model.selectedTab === key}
              className={model.selectedTab === key ? 'on' : ''} onClick={() => window.setStudioTab?.(key)}>{label}</button>)}</div>
          </div>
          <VideoMetadata model={model} />
          <div className="studio-undo-toolbar"><button type="button" className="button ghost tiny studio-control-button studio-undo-button" onClick={()=>window.undoLastAnnotationChange?.()} disabled={!model.undoCount} title="Undo up to 10 recently saved annotation actions in this session (Ctrl+Z)">↶ UNDO LAST CHANGE <span>{model.undoCount}/10</span></button><small>Ctrl+Z · Changes restore only their original annotation IDs</small></div>
          <div className="contextline"><Icon name="clock" /> Current video timestamp <b id="currentT">{formatTimestamp(model.tick)}</b>
            <span style={{ marginLeft: 'auto' }}>{model.canSponsor ? 'Sponsor tagging enabled' : 'Sponsor tagging view only'} · {model.canContext ? 'Context tagging enabled' : 'Context view only'}</span>
          </div>
          <div className="tline-wrap">
            <div className="sectionhead"><div><h3>Unified match timeline</h3><p className="sub">Review recorded intervals by layer. Sponsor property lanes inherit the exact start and end of their parent exposure.</p></div>
              <div className="tline-legend"><span><i className="key" style={{ background: '#ff9b36' }} />Sponsors</span><span><i className="key" style={{ background: '#dca25f' }} />Properties</span><span><i className="key" style={{ background: '#d7c7b5' }} />Events</span><span><i className="key" style={{ background: '#9cabb0' }} />Cameras</span></div></div>
            <div id="timelineBody"><StudioTimeline model={model} /></div>
          </div>
        </div>
        <div className="card cardpad" style={{ marginTop: 17 }}><div className="sectionhead"><h2>Recorded actions</h2><span className="tag" id="logcount">{model.logCount} logs</span></div><div id="logBody"><StudioLogs model={model} /></div></div>
        <AnnotationHistoryPanel model={model} isAdmin={isAdmin} />
      </div>
      <aside className="sponsor-rail" aria-label={`${model.railTitle} tagging panel`} tabIndex={0}>
        <div className="rail-compact-heading"><div className="rail-heading-row"><h2 id="railTagTitle">{model.railTitle}</h2>{model.selectedTab!=='events'&&model.selectedTab!=='cameras'&&<button type="button" className={`studio-control-button sponsor-hide-all ${model.sponsorsHidden?'is-hidden':''}`} onClick={()=>window.toggleHideAllSponsors?.()} disabled={!model.canSponsor} aria-pressed={model.sponsorsHidden}>{model.sponsorsHidden?'UNHIDE ALL':'HIDE ALL'}</button>}</div><p id="railTagHint">{model.railHint}</p></div>
        <div id="sponsorRail" className="rail-scroll"><StudioRail model={model} /></div>
      </aside>
  </div>;
}

declare global {
  interface Window {
    closeTaskMenu?: () => void;
    chooseVideo?: () => void;
    exportTask?: (id: string) => void;
    submitMyTask?: () => void;
    submitTaskStream?: (stream:'sponsors'|'context') => void;
    reopenTaskStream?: (stream:'sponsors'|'context') => void;
    assignTaskModal?: (id: string) => void;
    addSponsorToCurrentTask?: () => void;
    reopenTask?: () => void;
    togglePlay?: () => void;
    skipByStep?: (direction: number) => void;
    seekVideo?: (seconds: string | number) => void;
    deleteTask?: (id:string)=>void;
    setSeekStep?: (step: number) => void;
    setPlaybackRate?: (rate: number) => void;
    setStudioTab?: (tab: StudioScreenModel['selectedTab']) => void;
    toggleHideAllSponsors?: () => void;
    undoLastAnnotationChange?: () => Promise<void>;
    jumpToLastAnnotation?: () => void;
  }
}

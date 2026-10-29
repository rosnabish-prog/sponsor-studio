import type { StudioScreenModel } from '../types/screen';
import { formatTimestamp } from '../domain/intervals';
import { StudioControls, StudioLogs, StudioRail, StudioTimeline } from './StudioWidgets';

function Icon({ name }: { name: string }) {
  return <svg className="ic"><use href={`#i-${name}`} /></svg>;
}

function StudioAction({ children, onClick, className = '' }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return <button type="button" className={className} onClick={() => { window.closeTaskMenu?.(); onClick(); }}>{children}</button>;
}

function ActionMenu({ model, isAdmin }: { model: StudioScreenModel; isAdmin: boolean }) {
  const completed=model.submitted.sponsors&&model.submitted.context;
  return <div className="task-actions-dropdown">
    <details className="task-actions" id="taskActionMenu">
      <summary aria-label="Task actions"><span>ACTIONS</span><span className="menu-glyph" aria-hidden="true">⋯</span></summary>
      <div className="task-menu-content">
        <StudioAction onClick={() => window.chooseVideo?.()}><Icon name="video" /> {model.isLocalVideo ? 'REPLACE LOCAL VIDEO' : 'OPEN LOCAL VIDEO'}</StudioAction>
        <StudioAction onClick={() => window.exportTask?.(model.id)}><Icon name="download" /> EXPORT JSON</StudioAction>
        {completed
          ? isAdmin && <StudioAction className="task-menu-reopen" onClick={() => window.reopenTask?.()}><Icon name="check" /> REOPEN TASK</StudioAction>
          : <StudioAction className="task-menu-complete" onClick={() => window.submitMyTask?.()}><Icon name="check" /> MARK COMPLETE</StudioAction>}
        {isAdmin && <>
          <StudioAction onClick={() => window.assignTaskModal?.(model.id)}><Icon name="users" /> ASSIGN TASK</StudioAction>
          <StudioAction onClick={() => window.addSponsorToCurrentTask?.()}><Icon name="plus" /> ADD SPONSOR / LOGO</StudioAction>
          <StudioAction onClick={() => window.createTaskModal?.(model.id)}><Icon name="settings" /> EDIT TASK</StudioAction>
        </>}
        <div className="task-menu-separator" />
        <StudioAction onClick={() => window.navigate?.('tasks')}>← ALL TASKS</StudioAction>
      </div>
    </details>
  </div>;
}

function VideoPanel({ model }: { model: StudioScreenModel }) {
  const { videoSrc, videoName, videoType, isLocalVideo } = model;
  const sourceState = isLocalVideo ? 'LOCAL VIDEO' : videoType === 's3' ? 'PRIVATE VIDEO · CLOUDFRONT' : videoType === 'ftp' ? 'FTP LINK · INGEST REQUIRED' : videoSrc ? 'HTTPS VIDEO' : 'NO VIDEO ATTACHED';
  const sourceNote = model.videoError || (isLocalVideo ? `${videoName || 'Video'} · Available in this browser session only. Select it again after refreshing.` : videoSrc ? `${videoName || 'Video'}${model.videoDimensions ? ` · ${model.videoDimensions}` : ''}` : 'Open a local video or configure a direct HTTPS source.');
  return <div className="video-box">
    <div className="video-header"><span>LIVE TAGGING CONSOLE</span><span id="videoSourceState">{sourceState}</span></div>
    <div id="videoFileStatus" className="video-source-note" role="status" aria-live="polite">{sourceNote}</div>
    <div className={`vidframe ${videoSrc ? 'video-native-frame' : ''}`}>
      {videoSrc ? <video id="matchVideo" preload="metadata" playsInline aria-label="Match video · original proportions" src={videoSrc} /> :
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
      <button className="rate" onClick={() => window.cycleRate?.()} id="rateButton">{model.playbackRate}×</button>
    </div>
  </div>;
}

const tabs = [['all', 'All'], ['sponsors', 'Sponsors'], ['events', 'Events'], ['cameras', 'Camera']] as const;

export function AnnotationStudioScreen({ model, isAdmin }: { model: StudioScreenModel; isAdmin: boolean }) {
  return <div className="studio-grid">
    <div className="studio-media-column" role="region" aria-label="Video, annotation tools, and recorded actions" tabIndex={0}>
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
        </div>
        <ActionMenu model={model} isAdmin={isAdmin} />
      </div>
      </div>
        <VideoPanel model={model} />
        <div className="card cardpad studio-maincard">
          <div className="tag-toolbar">
            <div><h2>Fast-tag controls</h2><p className="sub">Events and camera angles are timed intervals. Tap once to start, again to stop; switching cameras closes the previous view.</p></div>
            <div className="segmented">{tabs.map(([key, label]) => <button
              key={key} type="button" data-studio-tab={key} aria-pressed={model.selectedTab === key}
              className={model.selectedTab === key ? 'on' : ''} onClick={() => window.setStudioTab?.(key)}>{label}</button>)}</div>
          </div>
          <div className="contextline"><Icon name="clock" /> Current video timestamp <b id="currentT">{formatTimestamp(model.tick)}</b>
            <span style={{ marginLeft: 'auto' }}>{model.canSponsor ? 'Sponsor tagging enabled' : 'Sponsor tagging view only'} · {model.canContext ? 'Context tagging enabled' : 'Context view only'}</span>
          </div>
          <div id="controlsBody"><StudioControls model={model} /></div>
          <div className="tline-wrap">
            <div className="sectionhead"><div><h3>Unified match timeline</h3><p className="sub">Review recorded intervals by layer. Right-click a segment to delete it, if you have editing permission.</p></div>
              <div className="tline-legend"><span><i className="key" style={{ background: '#ff9b36' }} />Sponsors</span><span><i className="key" style={{ background: '#d7c7b5' }} />Events</span><span><i className="key" style={{ background: '#9cabb0' }} />Cameras</span></div></div>
            <div id="timelineBody"><StudioTimeline model={model} /></div>
          </div>
        </div>
        <div className="card cardpad" style={{ marginTop: 17 }}><div className="sectionhead"><h2>Recorded actions</h2><span className="tag" id="logcount">{model.logCount} logs</span></div><div id="logBody"><StudioLogs model={model} /></div></div>
      </div>
      <aside className="sponsor-rail" aria-label={`${model.railTitle} tagging panel`} tabIndex={0}>
        <div className="rail-compact-heading"><h2 id="railTagTitle">{model.railTitle}</h2><p id="railTagHint">{model.railHint}</p></div>
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
    assignTaskModal?: (id: string) => void;
    addSponsorToCurrentTask?: () => void;
    reopenTask?: () => void;
    togglePlay?: () => void;
    skipByStep?: (direction: number) => void;
    seekVideo?: (seconds: string | number) => void;
    setSeekStep?: (step: number) => void;
    cycleRate?: () => void;
    setStudioTab?: (tab: StudioScreenModel['selectedTab']) => void;
  }
}

import { useState } from 'react';
import type { StudioData, TaskSummary } from '../types/models';
import { labelingProgress, MAX_REVIEW_GAP_SECONDS } from '../domain/labelingProgress';

function Status({ task }: { task: TaskSummary }) {
  const submitted = task.submitted.sponsors && task.submitted.context;
  const ready = !task.sponsors.length && !task.cameras.length && !task.events.length;
  return <span className={`status ${submitted?'done':ready?'ready':'progress'}`}>{submitted?'Submitted':ready?'Not started':'In progress'}</span>;
}

export function LabelingStatusScreen({ data,viewerId,admin }: { data: StudioData;viewerId?:string;admin:boolean }) {
  const [filter,setFilter] = useState<'all'|'ready'|'progress'|'done'>('all');
  const [search,setSearch] = useState('');
  const rows = data.tasks.filter(task=>{
    if(!admin&&task.sponsorAnalystId!==viewerId&&task.contextAnalystId!==viewerId)return false;
    const status = task.submitted.sponsors&&task.submitted.context?'done':task.sponsors.length||task.cameras.length||task.events.length?'progress':'ready';
    return (filter==='all'||filter===status)&&`${task.name} ${task.number}`.toLowerCase().includes(search.toLowerCase());
  });
  const name = (id:string) => data.users.find(user=>user.id===id)?.name||'Unassigned';
  return <>
    <div className="pagehead"><div><div className="eyebrow">PRODUCTION / ANNOTATION COVERAGE</div><h1>Labeling status</h1>
      <p className="sub">Progress comes from saved intervals, never how much video was played. Gaps up to {MAX_REVIEW_GAP_SECONDS/60} minutes count as reviewed; longer gaps remain incomplete. Match events are reported separately because they happen intermittently.</p>
    </div><button className="button ghost" onClick={()=>window.navigate?.('tasks')}>← Match assignments</button></div>
    <div className="labeling-toolbar"><div className="filterbar">{([['all','All'],['ready','Not started'],['progress','In progress'],['done','Submitted']] as const).map(([key,label])=><button key={key} type="button" className={`chip ${filter===key?'active':''}`} onClick={()=>setFilter(key)}>{label}</button>)}</div>
      <input type="search" aria-label="Search matches" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search match or number" />
    </div>
    <div className="card cardpad labeling-status-list">
      <div className="sectionhead"><h2>Match labeling coverage</h2><span className="tag">{rows.length} matches</span></div>
      <div className="labeling-rows">{rows.map(task=>{
        const progress=labelingProgress(task);
        return <article key={task.id} className="labeling-row">
          <div className="labeling-match"><span className="eyebrow">{task.number}</span><h3>{task.name}</h3>
            <p>Sponsors: {name(task.sponsorAnalystId)} · Events & cameras: {name(task.contextAnalystId)}</p><Status task={task}/></div>
          <div className="labeling-results"><div className="labeling-percent"><strong>{progress.percent.toFixed(1)}%</strong><span>Measured labeling coverage</span></div>
            <div className="labeling-progress-bar" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Measured coverage for ${task.name}`}><span style={{width:`${progress.percent}%`}} /></div>
            <div className="labeling-splits">{progress.hasSponsors&&<span>Sponsors <b>{progress.sponsorPercent.toFixed(1)}%</b></span>}
              {progress.hasCameras&&<span>Cameras <b>{progress.cameraPercent.toFixed(1)}%</b></span>}
              {progress.hasMoments&&<span>Match moments <b>{progress.eventCount} recorded · event density is not coverage</b></span>}
              {!progress.hasSponsors&&!progress.hasCameras&&<span>No continuous tagging stream configured; coverage cannot be inferred from moments alone.</span>}
            </div>
          </div>
          <button className="button ghost tiny" onClick={()=>window.openTask?.(task.id)}>View task</button>
        </article>;
      })}{!rows.length&&<div className="empty">No matches match these filters.</div>}</div>
    </div>
  </>;
}

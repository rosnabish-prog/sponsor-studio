import { useEffect, useMemo, useState } from 'react';
import { api, type ApiAnnotationRevision } from '../api/client';
import { formatTimestamp } from '../domain/intervals';
import type { StudioScreenModel } from '../types/screen';

/** The server stores immutable item snapshots. This panel restores a single ID only. */
export function AnnotationHistoryPanel({model,isAdmin}:{model:StudioScreenModel;isAdmin:boolean}) {
  const [open,setOpen]=useState(false);
  const [itemId,setItemId]=useState('');
  const [revisions,setRevisions]=useState<ApiAnnotationRevision[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [pending,setPending]=useState('');
  const [busy,setBusy]=useState(false);
  const [kind,setKind]=useState<'ALL'|'SPONSOR'|'EVENT'|'CAMERA'>('ALL');

  useEffect(()=>{
    const show=(id:string)=>{
      setOpen(true);setItemId(id);setPending('');
      document.getElementById('annotationHistoryPanel')?.scrollIntoView({behavior:'smooth',block:'nearest'});
    };
    window.openAnnotationHistory=show;
    return ()=>{if(window.openAnnotationHistory===show)window.openAnnotationHistory=undefined;};
  },[]);
  useEffect(()=>{
    const onRefresh=()=>setReload(n=>n+1);
    window.addEventListener('annotation-history-updated',onRefresh);
    return ()=>window.removeEventListener('annotation-history-updated',onRefresh);
  },[]);
  useEffect(()=>{
    if(!open)return;
    let active=true;
    setLoading(true);setError('');
    api.annotationHistory(model.workspaceId,model.id,itemId||undefined).then(data=>{
      if(active){setRevisions(data);setLoading(false);}
    }).catch(cause=>{
      if(active){setError(cause instanceof Error?cause.message:'Could not load history');setLoading(false);}
    });
    return ()=>{active=false;};
  },[open,itemId,reload,model.workspaceId,model.id]);

  const latestById=useMemo(()=>{
    const map=new Map<string,number>();
    for(const row of revisions)map.set(row.annotationId,Math.max(map.get(row.annotationId)??0,row.version));
    return map;
  },[revisions]);
  const shown=revisions.filter(row=>kind==='ALL'||row.snapshot.kind===kind);
  const label=(row:ApiAnnotationRevision)=>{
    const list=row.snapshot.kind==='SPONSOR'?model.sponsors:row.snapshot.kind==='EVENT'?model.events:model.cameras;
    return list.find(item=>item.id===row.snapshot.labelId)?.name||row.snapshot.labelId;
  };

  async function restore(row:ApiAnnotationRevision) {
    const latest=latestById.get(row.annotationId);
    if(!latest||!window.restoreAnnotationRevision)return;
    setBusy(true);setError('');
    try {
      await window.restoreAnnotationRevision(row.annotationId,row.version,latest);
      setPending('');setReload(n=>n+1);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Restore failed. No other annotations were changed.');
      setReload(n=>n+1);
    } finally {setBusy(false);}
  }

  return <section className="card cardpad annotation-history-panel" id="annotationHistoryPanel" aria-label="Annotation revision history">
    <div className="sectionhead">
      <div><h2>Annotation history {isAdmin&&<span className="tag">ADMIN AUDIT</span>}</h2>
        <p className="sub">Every change is saved as a version. Restore affects only the selected annotation ID, not adjacent intervals or other timelines.</p></div>
      <button type="button" className="button ghost tiny" onClick={()=>setOpen(value=>!value)}>{open?'HIDE HISTORY':'VIEW HISTORY'}</button>
    </div>
    {open&&<>
      <div className="annotation-history-filters">
        {itemId&&<button type="button" className="button ghost tiny" onClick={()=>{setItemId('');setPending('');}}>← ALL ITEMS</button>}
        <span className="muted small">{itemId?`Selected annotation: ${itemId}`:'Latest 250 changes · select HISTORY beside any recorded action for its complete history'}</span>
        <select aria-label="Filter annotation history" value={kind} onChange={event=>setKind(event.target.value as typeof kind)}>
          <option value="ALL">ALL TIMELINES</option><option value="SPONSOR">SPONSORS</option><option value="EVENT">EVENTS</option><option value="CAMERA">CAMERAS</option>
        </select>
        <button type="button" className="button ghost tiny" onClick={()=>setReload(n=>n+1)} disabled={loading}>REFRESH</button>
      </div>
      {error&&<p role="alert" className="annotation-history-error">{error}</p>}
      {loading?<p className="muted">Loading saved versions…</p>:<div className="logtable"><table className="table"><thead><tr>
        <th>RECORDED</th><th>TIMELINE / ITEM</th><th>VERSION</th><th>INTERVAL</th><th>ACTION</th><th>RESTORE</th>
      </tr></thead><tbody>{shown.map(row=>{
        const deleted=!!row.snapshot.deletedAt;
        const latest=latestById.get(row.annotationId)??0;
        const canRestore=!deleted&&row.version<latest&&
          (row.snapshot.kind==='SPONSOR'?model.canSponsor:model.canContext);
        const token=`${row.annotationId}:${row.version}`;
        const isPending=pending===token;
        return <tr key={row.id}>
          <td className="nowrap small">{new Date(row.createdAt).toLocaleString()}</td>
          <td><strong>{row.snapshot.kind}</strong><span className="annotation-history-item">{label(row)}</span>
            <span className="annotation-history-id">{row.annotationId.slice(0,8)}</span></td>
          <td>v{row.version}{row.version===latest&&<span className="tag">CURRENT</span>}</td>
          <td className="nowrap">{formatTimestamp(row.snapshot.start)} – {row.snapshot.end===null?'LIVE':formatTimestamp(row.snapshot.end)}</td>
          <td>{deleted?'REMOVED':row.action}</td>
          <td>{canRestore?(isPending?<div className="annotation-history-restore">
            <button type="button" className="button primary tiny" disabled={busy} onClick={()=>void restore(row)}>CONFIRM RESTORE</button>
            <button type="button" className="button ghost tiny" disabled={busy} onClick={()=>setPending('')}>CANCEL</button>
          </div>:<button type="button" className="button ghost tiny" disabled={busy} onClick={()=>setPending(token)}>
            {row.version===latest-1?'UNDO LAST CHANGE':'RESTORE THIS VERSION'}</button>):<span className="muted small">—</span>}</td>
        </tr>;
      })}{!shown.length&&<tr><td colSpan={6} className="muted">No versions found in this view.</td></tr>}</tbody></table></div>}
    </>}
  </section>;
}

declare global {
  interface Window {
    openAnnotationHistory?:(id:string)=>void;
    restoreAnnotationRevision?:(id:string,version:number,expectedRevision:number)=>Promise<void>;
  }
}

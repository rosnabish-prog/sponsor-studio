import type { StudioData, TaskSummary } from '../types/models';
import { api, toApiMetadata } from './client';

type ListKind = 'sponsors'|'events'|'cameras';
type StudioAnnotation = TaskSummary['sponsors'][number] | TaskSummary['events'][number] | TaskSummary['cameras'][number];
export type Rekey = (kind: 'task'|'annotation', previous: string, next: string) => void;

function catalog(data:StudioData) {
  return { sponsorGroups:data.sponsorGroups, eventGroups:data.eventGroups, cameraGroups:data.cameraGroups };
}

function taskFields(task:TaskSummary) {
  return {name:task.name,durationSeconds:Math.round(task.duration),
    sponsorAnalystId:task.sponsorAnalystId||undefined,contextAnalystId:task.contextAnalystId||undefined,
    metadata:toApiMetadata(task)};
}

function annotations(task:TaskSummary):{kind:'SPONSOR'|'EVENT'|'CAMERA';item:StudioAnnotation;labelId:string}[] {
  return [
    ...task.sponsors.map(item=>({kind:'SPONSOR' as const,item,labelId:item.sponsorId})),
    ...task.events.map(item=>({kind:'EVENT' as const,item,labelId:item.eventId})),
    ...task.cameras.map(item=>({kind:'CAMERA' as const,item,labelId:item.cameraId})),
  ];
}

/** A single edit must never silently turn into a bulk deletion of saved labels. */
export function assertNoBulkAnnotationDeletion(before:TaskSummary,after:TaskSummary) {
  const incoming=new Set(annotations(after).map(row=>row.item.id));
  const removed=annotations(before).filter(row=>!incoming.has(row.item.id));
  if(removed.length>1)throw new Error(`Safety stop: ${removed.length} annotations would be deleted from ${before.number}. No deletions were submitted.`);
}

function attributes(a:StudioAnnotation) {
  return {end:a.end,placement:'placement' in a?a.placement??null:null,quality:'quality' in a?a.quality??null:null};
}

/** Sends the changes made by legacy controller actions to authoritative server APIs.
 * Server responses re-key temporary IDs before acknowledging the save. */
export async function persistStudio(
  workspaceId:string,before:StudioData,after:StudioData,version:number,rekey:Rekey,
  onRevision?:(annotationId:string,revision:number)=>void,
):Promise<number> {
  if (JSON.stringify(catalog(before))!==JSON.stringify(catalog(after))) {
    const response=await api.saveCatalog(workspaceId,catalog(after),version);
    version=response.version;
  }

  for (const previous of before.tasks) {
    if (!after.tasks.some(task => task.id === previous.id)) await api.deleteTask(workspaceId, previous.id);
  }

  for (const task of after.tasks) {
    let previous=before.tasks.find(t=>t.id===task.id);
    if (!previous) {
      const result=await api.createTask(workspaceId,{
        ...taskFields(task),number:task.number,fixtureId:task.fixtureId||undefined,
        matchDate:task.date ? `${task.date}T00:00:00.000Z` : undefined,
      });
      rekey('task',task.id,result.id);
      task.id=result.id;
    } else if (JSON.stringify(taskFields(previous))!==JSON.stringify(taskFields(task))) {
      await api.updateTask(workspaceId,task.id,taskFields(task));
    }

    const oldAnnotations=previous?annotations(previous):[];
    const newAnnotations=annotations(task);
    if(previous)assertNoBulkAnnotationDeletion(previous,task);
    for (const old of oldAnnotations) {
      if (!newAnnotations.some(row=>row.item.id===old.item.id)) {
        await api.removeAnnotation(workspaceId,task.id,old.item.id,old.item.revision??1);
      }
    }
    // Close old camera intervals before starting the next one.
    for (const current of newAnnotations) {
      const old=oldAnnotations.find(row=>row.item.id===current.item.id);
      if (!old) continue;
      const changed=JSON.stringify({labelId:old.labelId,start:old.item.start,...attributes(old.item)})!==
        JSON.stringify({labelId:current.labelId,start:current.item.start,...attributes(current.item)});
      if (changed) {
       const result=await api.updateAnnotation(workspaceId,task.id,current.item.id,{
        expectedRevision:old.item.revision??1,
        start:current.item.start,end:current.item.end,
        ...(current.kind==='CAMERA'?{labelId:current.labelId}:{}),
        ...(current.kind==='SPONSOR'?attributes(current.item):{}),
      });
       current.item.revision=result.revision;
       onRevision?.(current.item.id,result.revision);
      }
    }
    for (const current of newAnnotations) {
      if (oldAnnotations.some(row=>row.item.id===current.item.id)) continue;
      const result=await api.addAnnotation(workspaceId,task.id,{
        kind:current.kind,labelId:current.labelId,start:current.item.start,end:current.item.end,
        ...(current.kind==='SPONSOR'?attributes(current.item):{}),
      });
      rekey('annotation',current.item.id,result.id);
      current.item.id=result.id;
      current.item.revision=result.revision;
      onRevision?.(result.id,result.revision);
    }

    for (const stream of ['sponsors','context'] as const) {
      const was=previous?.submitted[stream]??false;
      const is=task.submitted[stream];
      if (is&&!was) await api.submit(workspaceId,task.id,stream);
      else if (!is&&was) await api.reopen(workspaceId,task.id,stream);
    }
  }
  return version;
}

/**
 * Deterministic, reversible recovery for legacy overlapping CAMERA rows.
 * The newer tag wins from its start; prior tags are clipped to that moment.
 * Ties retain the most recently created row. No original IDs are rewritten.
 */
export type CameraRepairRow = {
  id:string;start:number;end:number|null;createdAt:Date;
};
export type CameraRepairChange = {id:string;end?:number;remove?:true};

export function planCameraRepairs(rows:CameraRepairRow[]):CameraRepairChange[]{
  const ordered=[...rows].sort((a,b)=>a.start-b.start||
    a.createdAt.getTime()-b.createdAt.getTime()||a.id.localeCompare(b.id));
  const changes:CameraRepairChange[]=[];
  for(let i=0;i<ordered.length-1;i++){
    const current=ordered[i],next=ordered[i+1];
    if(current.end!==null&&current.end<=next.start)continue;
    if(next.start<=current.start){changes.push({id:current.id,remove:true});continue;}
    changes.push({id:current.id,end:next.start});
  }
  return changes;
}

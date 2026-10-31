/** Edits exactly one saved annotation ID in exactly one timeline array.
 * It never truncates, deletes, shifts, or creates adjacent/future annotations. */
export function editSingleInterval<T extends {id:string;start:number;end:number|null}>(
  rows:T[],id:string,start:number,end:number,sameTrack:(a:T,b:T)=>boolean,
):'updated'|'not-found'|'overlap' {
  const target=rows.find(row=>row.id===id&&row.end!==null);
  if(!target)return 'not-found';
  if(rows.some(row=>row.id!==id&&sameTrack(target,row)&&
    start<(row.end??Infinity)&&end>row.start))return 'overlap';
  target.start=Math.round(start*100)/100;
  target.end=Math.round(end*100)/100;
  return 'updated';
}

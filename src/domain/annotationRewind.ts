/** Seeking backward saves elapsed LIVE work; it must never discard annotations. */
export function preserveAnnotationsOnRewind<T extends {start:number;end:number|null;createdBy:string}>(
  rows:T[], author:string, from:number,
):{rows:T[];closed:number}{
  let closed=0;
  const result=rows.map(row=>{
    if(row.end!==null||row.createdBy!==author||from-row.start<=0.2)return row;
    closed++;
    return {...row,end:from};
  });
  return {rows:result,closed};
}

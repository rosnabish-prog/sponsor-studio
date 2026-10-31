import type { Fixture } from '../types/models';

export function easternMatchDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}

export function hasFinalResult(fixture: Pick<Fixture,'status'|'score'>): boolean {
  return /^(finished|completed|final|ended)$/i.test(fixture.status?.trim()||'') && /^\d+\s*:\s*\d+$/.test(fixture.score?.trim()||'');
}

/** Merge the full catalog. Never replace a published final result, across any day. */
export function mergeFixtureCatalog(current:Fixture[], updates:Fixture[]): {fixtures:Fixture[];added:number;changed:number} {
  const byId=new Map(current.map(fixture=>[fixture.id,fixture]));
  let added=0,changed=0;
  for(const next of updates){
    if(!next||typeof next.id!=='string'||!next.id.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(next.date))continue;
    const existing=byId.get(next.id);
    if(existing&&hasFinalResult(existing))continue;
    if(!existing){byId.set(next.id,next);added++;continue;}
    const patch=Object.fromEntries(Object.entries(next).filter(([key,value])=>
      key!=='home'&&key!=='away'&&value!==undefined&&value!==null&&value!==''));
    for(const key of ['home','away'] as const){
      if(next[key]&&next[key]!=='TBC')patch[key]=next[key];
    }
    const updated={...existing,...patch};
    if(JSON.stringify(updated)===JSON.stringify(existing))continue;
    byId.set(next.id,updated);changed++;
  }
  return {fixtures:[...byId.values()],added,changed};
}

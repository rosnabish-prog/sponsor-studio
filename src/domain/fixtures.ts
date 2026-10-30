import type { Fixture } from '../types/models';

export function easternMatchDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}

export function hasFinalResult(fixture: Pick<Fixture,'status'|'score'>): boolean {
  return /^(finished|completed|final|ended)$/i.test(fixture.status?.trim()||'') && /^\d+\s*:\s*\d+$/.test(fixture.score?.trim()||'');
}

/** Update only this day's open fixtures. Previously completed matches remain immutable. */
export function mergeTodayFixtureUpdates(current:Fixture[],updates:Fixture[],date:string): {fixtures:Fixture[];changed:number} {
  const incoming=new Map(updates.filter(f=>f.date===date&&typeof f.id==='string').map(f=>[f.id,f]));
  let changed=0;
  const fixtures=current.map(existing=>{
    if(existing.date!==date||hasFinalResult(existing))return existing;
    const latest=incoming.get(existing.id);
    if(!latest)return existing;
    const next={...existing,...Object.fromEntries(Object.entries(latest).filter(([,value])=>value!==undefined&&value!==null&&value!==''))};
    if(JSON.stringify(next)===JSON.stringify(existing))return existing;
    changed++;return next;
  });
  return {fixtures,changed};
}

import {BadGatewayException,Controller,Get,Post,UseGuards} from '@nestjs/common';
import type {Prisma} from '../generated/prisma/client';
import {SessionGuard} from './auth';
import {DatabaseService} from './database';

const BASE='https://stats.buildup.club/api/apps/6ad8b0035891124905a4079c/entities/';
const MAX_PAGES=11;
type SourceRow=Record<string,unknown>;

export interface PublicFixture {
  id:string;date:string;home:string;away:string;
  score?:string;status?:string;time?:string;venue?:string;
  sourceId?:string;homeId?:string;awayId?:string;
  homeLogo?:string;awayLogo?:string;
  group?:string;stage?:string;round?:string;cup?:string;
  order?:number;confirmed?:boolean;
}

const value=(input:unknown,max=160)=>typeof input==='string'?input.trim().slice(0,max):'';
const finalResult=(fixture:PublicFixture)=>
  /^(finished|completed|final|ended)$/i.test(fixture.status?.trim()||'') && /^\d+\s*:\s*\d+$/.test(fixture.score?.trim()||'');

/** A published final result is immutable, even if BuildUp later reports a different score. */
export function mergeFixtureSnapshots(current:PublicFixture[],incoming:PublicFixture[]) {
  const byId=new Map(current.map(item=>[item.id,item]));
  let added=0,updated=0;
  for(const next of incoming){
    if(!next.id||!/^\d{4}-\d{2}-\d{2}$/.test(next.date))continue;
    const old=byId.get(next.id);
    if(old&&finalResult(old))continue;
    if(!old){byId.set(next.id,next);added++;continue;}
    const patch=Object.fromEntries(Object.entries(next).filter(([key,v])=>
      key!=='home'&&key!=='away'&&v!==undefined&&v!==null&&v!==''));
    // Do not degrade a known club name when BuildUp has no corresponding team yet.
    for(const key of ['home','away'] as const){
      if(next[key]&&next[key]!=='TBC')patch[key]=next[key];
    }
    const merged={...old,...patch};
    if(JSON.stringify(merged)!==JSON.stringify(old)){byId.set(next.id,merged);updated++;}
  }
  return {matches:[...byId.values()].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||(a.order||0)-(b.order||0)||a.id.localeCompare(b.id)),added,updated};
}

async function readPublicRows(entity:'Match'|'Team'):Promise<SourceRow[]> {
  const rows:SourceRow[]=[];
  const seen=new Set<string>();
  for(let page=0;page<MAX_PAGES;page++){
    const query=new URLSearchParams({limit:'50',skip:String(page*50),sort:entity==='Match'?'order':'name'});
    if(entity==='Match')query.set('q',JSON.stringify({date:{$gte:'2026-01-01',$lte:'2026-12-31'}}));
    const response=await fetch(`${BASE}${entity}?${query}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error(`Public ${entity} feed unavailable`);
    const result=await response.json() as unknown;
    const items=Array.isArray(result)?result:result&&typeof result==='object'&&'items' in result?(result as {items:unknown}).items:null;
    if(!Array.isArray(items))throw Error(`Invalid ${entity} feed`);
    for(const row of items){
      if(!row||typeof row!=='object'||Array.isArray(row))continue;
      const record=row as SourceRow;
      const id=value(record.id)||value(record.code);
      if(!id||seen.has(id))continue;
      seen.add(id);rows.push(record);
    }
    if(items.length<50)break;
    if(page===MAX_PAGES-1)throw Error(`${entity} feed exceeded the supported catalog size`);
  }
  return rows;
}

async function buildPublicFixtures():Promise<PublicFixture[]> {
  const [matches,teams]=await Promise.all([readPublicRows('Match'),readPublicRows('Team')]);
  if(!matches.length||!teams.length)throw Error('Public fixture catalog is incomplete');
  const byTeamId=new Map(teams.map(team=>[value(team.id),team]));
  const fixtures:PublicFixture[]=[];
  for(const match of matches){
    const id=value(match.code,100),date=value(match.date,10);
    if(!/^[\w-]{1,100}$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const homeTeam=byTeamId.get(value(match.home_id));
    const awayTeam=byTeamId.get(value(match.away_id));
    const home=value(match.home_label)||value(homeTeam?.name)||value(match.home_source)||'TBC';
    const away=value(match.away_label)||value(awayTeam?.name)||value(match.away_source)||'TBC';
    const homeScore=match.home_score,awayScore=match.away_score;
    const score=typeof homeScore==='number'&&Number.isFinite(homeScore)&&homeScore>=0&&
      typeof awayScore==='number'&&Number.isFinite(awayScore)&&awayScore>=0
      ?`${Math.trunc(homeScore)} : ${Math.trunc(awayScore)}`:'';
    fixtures.push({
      id,date,home,away,score,
      sourceId:value(match.id),homeId:value(match.home_id),awayId:value(match.away_id),
      homeLogo:value(homeTeam?.logo,500),awayLogo:value(awayTeam?.logo,500),
      status:value(match.status),time:value(match.time,20),venue:value(match.venue),
      group:value(match.group)||value(match.stage),stage:value(match.stage),
      round:value(match.round),cup:value(match.cup),
      order:typeof match.order==='number'&&Number.isFinite(match.order)?match.order:0,
      confirmed:match.confirmed===true,
    });
  }
  if(!fixtures.length)throw Error('Public fixture catalog contained no valid matches');
  return fixtures;
}

/** Public fixture metadata is persisted separately; no task or annotation writes occur. */
@Controller('fixtures')
@UseGuards(SessionGuard)
export class FixtureController {
  constructor(private readonly db:DatabaseService) {}

  @Get('catalog')
  async catalog(){
    const rows=await this.db.fixtureSnapshot.findMany();
    return {matches:rows.map(row=>row.payload as unknown as PublicFixture)};
  }

  @Post('sync')
  async sync(){
    let incoming:PublicFixture[];
    try{incoming=await buildPublicFixtures();}
    catch{throw new BadGatewayException('BuildUp match catalog is unavailable; existing matches were preserved');}

    const summary=await this.db.$transaction(async tx=>{
      const rows=await tx.fixtureSnapshot.findMany();
      const existing=rows.map(row=>row.payload as unknown as PublicFixture);
      const result=mergeFixtureSnapshots(existing,incoming);
      const prior=new Set(rows.map(row=>row.id));
      const oldById=new Map(existing.map(match=>[match.id,match]));
      const newlyAdded=result.matches.filter(match=>!prior.has(match.id));
      if(newlyAdded.length){
        await tx.fixtureSnapshot.createMany({data:newlyAdded.map(match=>({
          id:match.id,payload:match as unknown as Prisma.InputJsonValue,finalized:finalResult(match),
        })),skipDuplicates:true});
      }
      for(const match of result.matches){
        if(!prior.has(match.id))continue;
        if(JSON.stringify(oldById.get(match.id))===JSON.stringify(match))continue;
        // Atomic predicate protects already-final rows from concurrent sync requests.
        await tx.fixtureSnapshot.updateMany({
          where:{id:match.id,finalized:false},
          data:{payload:match as unknown as Prisma.InputJsonValue,finalized:finalResult(match)},
        });
      }
      return {added:result.added,updated:result.updated};
    });
    const catalog=await this.catalog();
    return {...summary,checkedAt:new Date().toISOString(),matches:catalog.matches};
  }
}

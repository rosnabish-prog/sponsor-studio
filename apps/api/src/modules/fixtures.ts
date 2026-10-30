import {BadGatewayException,BadRequestException,Controller,Get,Query,UseGuards} from '@nestjs/common';
import {SessionGuard} from './auth';

type UpstreamMatch = Record<string,unknown>;

/** Read-only public metadata refresh. Never touches annotation tasks or stored fixtures. */
@Controller('fixtures')
@UseGuards(SessionGuard)
export class FixtureController {
  @Get('refresh')
  async refresh(@Query('day') requestedDay?:string) {
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(requestedDay!==day)throw new BadRequestException('Only the current match day (Eastern Time) may be refreshed');
    const base='https://stats.buildup.club/api/apps/6ad8b0035891124905a4079c/entities/Match';
    const all:UpstreamMatch[]=[];
    try {
      for(let skip=0;skip<250;skip+=50) {
        const query=new URLSearchParams({limit:'50',skip:String(skip),q:JSON.stringify({date:{$gte:day,$lte:day}}),sort:'order'});
        const response=await fetch(`${base}?${query}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw Error(`Fixture source returned ${response.status}`);
        const result=await response.json() as unknown;
        const rows=Array.isArray(result)?result:result&&typeof result==='object'&&'items' in result?(result as {items:unknown}).items:null;
        if(!Array.isArray(rows))throw Error('Unexpected fixture response');
        all.push(...rows.filter((row):row is UpstreamMatch=>!!row&&typeof row==='object'&&!Array.isArray(row)));
        if(rows.length<50)break;
      }
    } catch {throw new BadGatewayException('Live fixture source unavailable; existing match results were preserved');}
    const matches=all.filter(row=>row.date===day&&typeof row.code==='string')
      .map(row=>{
        const home=typeof row.home_score==='number'&&Number.isFinite(row.home_score)?row.home_score:null;
        const away=typeof row.away_score==='number'&&Number.isFinite(row.away_score)?row.away_score:null;
        return {id:row.code as string,date:day,status:String(row.status||''),score:home!==null&&away!==null?`${Math.trunc(home)} : ${Math.trunc(away)}`:'',time:String(row.time||''),venue:String(row.venue||'')};
      });
    return {day,checkedAt:new Date().toISOString(),matches};
  }
}

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BadGatewayException, BadRequestException, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthRequest, SessionGuard } from './auth';
import { TaskService } from './tasks';

const PLATFORM = 'https://platform.buildup.club';
const CDN_HOST = 'onestoscout.b-cdn.net';

@Injectable()
export class BuildupService {
  private links = new Map<string, { url:string; expires:number }>();
  constructor(private readonly tasks:TaskService) {}

  private async link(matchId:string, refresh = false):Promise<string> {
    const cached = this.links.get(matchId);
    if (!refresh && cached && cached.expires > Date.now() + 60_000) return cached.url;
    const token = process.env.BUILDUP_API_TOKEN;
    if (!token) throw new ServiceUnavailableException('BuildUp video is not configured');
    try {
      const signed = await fetch(`${PLATFORM}/match-download.php`, {
        method:'POST', redirect:'manual', signal:AbortSignal.timeout(15_000),
        headers:{'content-type':'application/json'}, body:JSON.stringify({token,match_id:Number(matchId)}),
      });
      if (!signed.ok) throw new Error('BuildUp API rejected the request');
      const data = await signed.json() as {download_url?:unknown};
      if (typeof data.download_url !== 'string') throw new Error('Missing download link');
      const pageUrl = new URL(data.download_url);
      if (pageUrl.protocol !== 'https:' || pageUrl.hostname !== 'platform.buildup.club' || pageUrl.port || pageUrl.username || pageUrl.password || pageUrl.pathname !== '/match-download.php') throw new Error('Invalid download link');
      const page = await fetch(pageUrl, {redirect:'manual', signal:AbortSignal.timeout(15_000)});
      if (!page.ok) throw new Error('BuildUp download page unavailable');
      const html = await page.text();
      if (html.length > 100_000) throw new Error('Invalid download page');
      const href = html.match(/<a\b[^>]*\bhref=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g,'&');
      if (!href) throw new Error('Missing video link');
      const url = new URL(href);
      if (url.protocol !== 'https:' || url.hostname !== CDN_HOST || url.port || url.username || url.password || url.pathname !== `/Matches/MatchID_${matchId}.mov`) throw new Error('Invalid video link');
      const expires = Number(url.searchParams.get('expires')) * 1000;
      if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('Expired video link');
      if (this.links.size >= 500) this.links.delete(this.links.keys().next().value!);
      this.links.set(matchId,{url:url.toString(),expires});
      return url.toString();
    } catch {
      throw new BadGatewayException('Could not obtain a BuildUp video link');
    }
  }

  async stream(workspaceId:string, taskId:string, userId:string, range:string|undefined, res:Response) {
    const {task} = await this.tasks.find(workspaceId,taskId,userId);
    const metadata = task.metadata as Record<string,unknown> | null;
    const matchId = metadata?.buildupMatchId;
    if (metadata?.videoType !== 'buildup' || typeof matchId !== 'string' || !/^[1-9]\d{0,14}$/.test(matchId)) throw new NotFoundException('BuildUp video not found');
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new BadRequestException('Invalid video range');
    const controller = new AbortController();
    const abort = () => { if (!res.writableFinished) controller.abort(); };
    res.once('close', abort);
    try {
      const request = (url:string) => fetch(url, {redirect:'manual', signal:controller.signal, headers:{referer:`${PLATFORM}/`,...(range?{range}:{})}});
      let upstream = await request(await this.link(matchId));
      if (upstream.status === 403) {
        await upstream.body?.cancel();
        upstream = await request(await this.link(matchId,true));
      }
      if (![200,206,416].includes(upstream.status)) {
        await upstream.body?.cancel();
        throw new BadGatewayException('BuildUp video delivery failed');
      }
      if (range && upstream.status === 200) {
        await upstream.body?.cancel();
        throw new BadGatewayException('BuildUp video server did not honor the requested range');
      }
      res.status(upstream.status);
      for (const name of ['content-type','content-length','content-range','accept-ranges']) {
        const value = upstream.headers.get(name); if (value && !(upstream.status === 416 && name === 'content-length')) res.setHeader(name,value);
      }
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('X-Accel-Buffering','no');
      if (!upstream.body || upstream.status === 416) { await upstream.body?.cancel(); res.end(); return; }
      await pipeline(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream),res);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) throw error instanceof BadGatewayException || error instanceof ServiceUnavailableException ? error : new BadGatewayException('BuildUp video connection failed');
      if (!res.destroyed) res.destroy();
    } finally { res.off('close',abort); }
  }
}

@Controller('workspaces/:workspaceId/tasks/:taskId/videos/buildup')
@UseGuards(SessionGuard)
export class BuildupController {
  constructor(private readonly buildup:BuildupService) {}
  @Get('stream')
  stream(@Req() req:AuthRequest, @Res() res:Response, @Param('workspaceId',ParseUUIDPipe) w:string, @Param('taskId',ParseUUIDPipe) t:string) {
    return this.buildup.stream(w,t,req.userId,req.headers.range,res);
  }
}

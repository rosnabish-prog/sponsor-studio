import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import type { Response as ExpressResponse } from 'express';
import { BuildupService } from '../src/modules/buildup';
import type { TaskService } from '../src/modules/tasks';

class VideoResponse extends Writable {
  headers:Record<string,string> = {};
  statusCode = 200;
  chunks:Buffer[] = [];
  status(code:number) { this.statusCode=code; return this; }
  setHeader(name:string,value:string) { this.headers[name.toLowerCase()]=value; return this; }
  _write(chunk:Buffer,_encoding:BufferEncoding,callback:(error?:Error|null)=>void) { this.chunks.push(chunk); callback(); }
}

test('BuildUp proxy authorizes, refreshes a rejected link, and forwards byte ranges', async () => {
  const originalFetch=globalThis.fetch, originalToken=process.env.BUILDUP_API_TOKEN;
  process.env.BUILDUP_API_TOKEN='test-token';
  let signed=0, cdn=0, authorized=0;
  const tasks={find:async()=>{authorized++;return {task:{metadata:{videoType:'buildup',buildupMatchId:'1769'}}};}} as unknown as TaskService;
  const expires=Math.floor(Date.now()/1000)+3600;
  globalThis.fetch=(async (input: string | URL | Request, init?:RequestInit) => {
    const url=String(input);
    if (url==='https://platform.buildup.club/match-download.php') {
      signed++; assert.deepEqual(JSON.parse(String(init?.body)),{token:'test-token',match_id:1769});
      return Response.json({download_url:'https://platform.buildup.club/match-download.php?signature=test'});
    }
    if (url.startsWith('https://platform.buildup.club/')) return new Response(`<a href="https://onestoscout.b-cdn.net/Matches/MatchID_1769.mov?token=test&amp;expires=${expires}">Download</a>`);
    cdn++;
    assert.equal((init?.headers as Record<string,string>).range,'bytes=10-12');
    assert.equal((init?.headers as Record<string,string>).referer,'https://platform.buildup.club/');
    if (cdn===1) return new Response(null,{status:403});
    return new Response('abc',{status:206,headers:{'content-range':'bytes 10-12/100','content-length':'3','accept-ranges':'bytes','content-type':'video/quicktime'}});
  }) as typeof fetch;
  try {
    const res=new VideoResponse();
    await new BuildupService(tasks).stream('workspace','task','user','bytes=10-12',res as unknown as ExpressResponse);
    assert.equal(authorized,1); assert.equal(signed,2); assert.equal(cdn,2);
    assert.equal(res.statusCode,206); assert.equal(res.headers['content-range'],'bytes 10-12/100');
    assert.equal(Buffer.concat(res.chunks).toString(),'abc');
  } finally { globalThis.fetch=originalFetch; if(originalToken===undefined) delete process.env.BUILDUP_API_TOKEN; else process.env.BUILDUP_API_TOKEN=originalToken; }
});

test('BuildUp proxy accepts a signed video with a different numeric file ID', async () => {
  const originalFetch=globalThis.fetch, originalToken=process.env.BUILDUP_API_TOKEN;
  process.env.BUILDUP_API_TOKEN='test-token';
  const tasks={find:async()=>({task:{metadata:{videoType:'buildup',buildupMatchId:'1789'}}})} as unknown as TaskService;
  const expires=Math.floor(Date.now()/1000)+3600;
  let cdnRequests=0;
  globalThis.fetch=(async (input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);
    if(url==='https://platform.buildup.club/match-download.php'){
      assert.deepEqual(JSON.parse(String(init?.body)),{token:'test-token',match_id:1789});
      return Response.json({download_url:'https://platform.buildup.club/match-download.php?signature=test'});
    }
    if(url.startsWith('https://platform.buildup.club/')){
      return new Response(`<a href="https://onestoscout.b-cdn.net/Matches/MatchID_1786.mov?token=signed&amp;expires=${expires}">Download</a>`);
    }
    cdnRequests++;
    assert.match(url,/\/Matches\/MatchID_1786\.mov\?/);
    return new Response('video',{status:200,headers:{'content-type':'video/quicktime'}});
  }) as typeof fetch;
  try{
    const res=new VideoResponse();
    await new BuildupService(tasks).stream('workspace','task','user',undefined,res as unknown as ExpressResponse);
    assert.equal(res.statusCode,200);
    assert.equal(cdnRequests,1);
    assert.equal(Buffer.concat(res.chunks).toString(),'video');
  }finally{globalThis.fetch=originalFetch;if(originalToken===undefined)delete process.env.BUILDUP_API_TOKEN;else process.env.BUILDUP_API_TOKEN=originalToken;}
});

test('BuildUp proxy continues rejecting untrusted hosts, paths, and expired links', async () => {
  const originalFetch=globalThis.fetch, originalToken=process.env.BUILDUP_API_TOKEN;
  process.env.BUILDUP_API_TOKEN='test-token';
  const tasks={find:async()=>({task:{metadata:{videoType:'buildup',buildupMatchId:'1789'}}})} as unknown as TaskService;
  const expires=Math.floor(Date.now()/1000)+3600;
  const invalidLinks=[
    `https://unexpected.example/Matches/MatchID_1786.mov?expires=${expires}`,
    `http://onestoscout.b-cdn.net/Matches/MatchID_1786.mov?expires=${expires}`,
    `https://user:pass@onestoscout.b-cdn.net/Matches/MatchID_1786.mov?expires=${expires}`,
    `https://onestoscout.b-cdn.net:8443/Matches/MatchID_1786.mov?expires=${expires}`,
    `https://onestoscout.b-cdn.net/other/MatchID_1786.mov?expires=${expires}`,
    `https://onestoscout.b-cdn.net/Matches/MatchID_1786.mp4?expires=${expires}`,
    `https://onestoscout.b-cdn.net/Matches/MatchID_0.mov?expires=${expires}`,
    `https://onestoscout.b-cdn.net/Matches/MatchID_1786.mov?expires=1`,
  ];
  let signedUrl='';
  let cdnRequests=0;
  globalThis.fetch=(async(input:string|URL|Request)=>{
    const url=String(input);
    if(url==='https://platform.buildup.club/match-download.php')return Response.json({download_url:'https://platform.buildup.club/match-download.php?signature=test'});
    if(url.startsWith('https://platform.buildup.club/'))return new Response(`<a href="${signedUrl.replace(/&/g,'&amp;')}">Download</a>`);
    cdnRequests++;
    throw Error('An untrusted CDN link must never be fetched');
  }) as typeof fetch;
  try{
    for(const invalid of invalidLinks){
      signedUrl=invalid;
      await assert.rejects(()=>new BuildupService(tasks).stream('workspace','task','user',undefined,new VideoResponse() as unknown as ExpressResponse),
        (error:unknown)=>error instanceof Error&&error.message.includes('Could not obtain a BuildUp video link'));
    }
    assert.equal(cdnRequests,0);
  }finally{globalThis.fetch=originalFetch;if(originalToken===undefined)delete process.env.BUILDUP_API_TOKEN;else process.env.BUILDUP_API_TOKEN=originalToken;}
});

test('BuildUp proxy never contacts upstream for an unauthorized task', async () => {
  const tasks={find:async()=>{throw new Error('not authorized');}} as unknown as TaskService;
  await assert.rejects(new BuildupService(tasks).stream('w','t','u',undefined,new VideoResponse() as unknown as ExpressResponse),/not authorized/);
});

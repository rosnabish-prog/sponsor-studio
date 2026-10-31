import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { readStudioRoute, writeStudioRoute } from '../src/state/routes';
import { annotatedEndpoint, labelingProgress, measuredCoverage } from '../src/domain/labelingProgress';
import { recoverVideo } from '../src/state/videoRecovery';
import { computeInsights } from '../src/domain/analytics';
import { ExposureReport } from '../src/components/ReportWidgets';
import { ExposureTrend } from '../src/components/ExposureTrend';
import { MatchesScreen } from '../src/components/MatchScreens';
import { AnnotationStudioScreen } from '../src/components/AnnotationStudioScreen';
import { attachVideoAlignmentPause } from '../src/components/videoAlignmentScroll';
import { AppShell } from '../src/components/AppShell';
import { StudioControls, StudioRail, StudioTimeline } from '../src/components/StudioWidgets';
import { WorkspaceScreen } from '../src/components/WorkspaceScreen';
import { LabelingStatusScreen } from '../src/components/LabelingStatusScreen';
import { displayHotkey, hotkeyFromKeyboard, normalizeHotkey } from '../src/domain/hotkeys';
import { hasFinalResult, mergeTodayFixtureUpdates } from '../src/domain/fixtures';
import { StudioModal } from '../src/components/StudioModals';
import { readOriginalPng, MAX_ORIGINAL_PNG_BYTES } from '../src/domain/logoUpload';
import { copyCatalogEntry, reorderById } from '../src/domain/catalogEditing';
import { hasRecordedCameraAfter, resumeCameraFromTimestamp, selectCameraAngle } from '../src/domain/cameraSwitch';
import { captureStudioSpacebar } from '../src/domain/studioKeyboard';
import { VIDEO_PLAYBACK_RATES, supportedPlaybackRate } from '../src/domain/videoPlayback';
import { nextSavedSponsorStart, retagSponsorFromTimestamp } from '../src/domain/sponsorRetag';
import { AttributesScreen, SponsorLibraryScreen, TeamScreen } from '../src/components/AdminScreens';
import { Screen } from '../src/components/Screens';
import type { TaskSummary, StudioData } from '../src/types/models';
import type { StudioScreenModel } from '../src/types/screen';

const task: TaskSummary = {
  id:'t1',number:'M13',name:'Home FC vs Away FC',fixtureId:'M13',date:'2026-10-29',duration:600,
  sponsorGroupIds:['g1'],eventGroupIds:['e1'],cameraGroupIds:['c1'],sponsorAnalystId:'a1',contextAnalystId:'a1',
  sponsors:[{id:'one',sponsorId:'s1',start:2,end:30,createdBy:'a1',createdAt:'2026-10-29'},
    {id:'zero',sponsorId:'s2',start:45,end:45,createdBy:'a1',createdAt:'2026-10-29'}],
  events:[],cameras:[],submitted:{sponsors:true,context:true},createdAt:'2026-10-29',
};
const data:StudioData = {
  users:[{id:'a1',name:'Worker',email:'worker@example.com',role:'analyst',password:''}],
  sponsorGroups:[{id:'g1',name:'Brands',description:'',sponsors:[{id:'s1',name:'Recorded Brand'},{id:'s2',name:'Zero Brand'},{id:'s3',name:'Untracked Brand'}]}],
  eventGroups:[{id:'e1',name:'Events',items:[{id:'event',name:'Goal',kind:'range'}]}],
  cameraGroups:[{id:'c1',name:'Cameras',items:[{id:'camera',name:'Wide'}]}],
  tasks:[task],
};

test('Team tab distinguishes owners and permits only owners to remove members',()=>{
  const team:StudioData={...data,users:[
    {id:'owner',name:'Administrator',email:'admin@seebot.ai',role:'owner',password:''},
    {id:'admin',name:'Second Admin',email:'second@seebot.ai',role:'admin',password:''},
    {id:'analyst',name:'Analyst',email:'analyst@seebot.ai',role:'analyst',password:''},
    {id:'viewer',name:'Viewer',email:'viewer@seebot.ai',role:'viewer',password:''},
  ]};
  const owner=renderToStaticMarkup(<TeamScreen data={team} viewerRole="owner"/>);
  assert.match(owner,/Team &amp; access/);
  assert.match(owner,/admin@seebot\.ai/);
  assert.match(owner,/>Owner<\/span>/);
  assert.equal((owner.match(/aria-label="Remove /g)||[]).length,3,'owner can remove all other roles');
  assert.doesNotMatch(owner,/aria-label="Remove Administrator"/,'owner account is protected');
  const admin=renderToStaticMarkup(<TeamScreen data={team} viewerRole="admin"/>);
  assert.doesNotMatch(admin,/aria-label="Remove /,'admins cannot remove members');
  assert.doesNotMatch(admin,/Reset password<\/button>.*Reset password<\/button>.*Reset password<\/button>/,'admin cannot reset other admins');
  const shell=renderToStaticMarkup(<AppShell screen="dashboard" context={{user:{name:'Administrator',role:'owner'}}}><span>Home</span></AppShell>);
  assert.match(shell,/OWNER/,'owner remains distinct in the header');
  assert.match(shell,/>Team<\/button>/,'owner retains administrative navigation');
});

class FakeVideo extends EventTarget {
  currentTime=4200; duration=7800; readyState=0; paused=false; error:MediaError|null=null;
  loads=0; plays=0;
  load(){this.loads++;this.currentTime=0;this.readyState=0;}
  play(){this.plays++;this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
}

test('interrupted video reconnects at the tagging time and resumes only after seeking', () => {
  const video=new FakeVideo(), messages:string[]=[];
  const recovery=recoverVideo(video as unknown as HTMLVideoElement,{position:()=>4200,status:message=>messages.push(message)});
  video.dispatchEvent(new Event('error'));
  assert.equal(video.loads,1); assert.equal(recovery.isRecovering(),true);
  video.readyState=1;video.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(video.currentTime,4200); assert.equal(video.plays,0);
  video.dispatchEvent(new Event('seeked'));
  assert.equal(recovery.isRecovering(),false); assert.equal(video.plays,1);assert.equal(messages.at(-1),'');
  recovery.dispose();
});

test('Space pauses video without activating the focused sponsor button or deleting its tag', () => {
  const dom = new JSDOM('<button id="sponsor">Sponsor</button><input id="field"/>', {url:'http://localhost/'});
  const previousDocument = globalThis.document;
  const previousElement = globalThis.Element;
  (globalThis as unknown as {document:Document}).document = dom.window.document;
  (globalThis as unknown as {Element:typeof Element}).Element = dom.window.Element;
  const button = dom.window.document.getElementById('sponsor') as HTMLButtonElement;
  const field = dom.window.document.getElementById('field') as HTMLInputElement;
  let playbackToggles = 0;
  let annotationToggles = 0;
  button.addEventListener('click', () => annotationToggles++);
  const listener = (event:KeyboardEvent) => captureStudioSpacebar(event,true,()=>playbackToggles++);
  dom.window.document.addEventListener('keydown', listener, true);
  dom.window.document.addEventListener('keyup', listener, true);
  const space = (type:'keydown'|'keyup', repeat=false) => new dom.window.KeyboardEvent(type, {bubbles:true,cancelable:true,code:'Space',key:' ',repeat});
  try {
    button.focus();
    assert.equal(dom.window.document.activeElement,button);
    assert.equal(button.dispatchEvent(space('keydown')),false,'keydown is canceled before native button activation');
    assert.equal(dom.window.document.activeElement,button,'Space leaves the sponsor button focused');
    assert.equal(button.dispatchEvent(space('keyup')),false,'keyup cannot synthesize a button click');
    assert.equal(playbackToggles,1);
    assert.equal(annotationToggles,0);
    assert.equal(dom.window.document.activeElement,button,'button remains focused after Space is released');
    assert.equal(dom.window.document.body.dispatchEvent(space('keydown')),false);
    assert.equal(dom.window.document.body.dispatchEvent(space('keydown',true)),false,'held Space does not repeat playback');
    assert.equal(dom.window.document.body.dispatchEvent(space('keyup')),false);
    assert.equal(playbackToggles,2,'the next Space resumes the video');
    assert.equal(annotationToggles,0);
    field.focus();
    assert.equal(field.dispatchEvent(space('keydown')),true,'typing controls keep native keyboard behavior');
    assert.equal(playbackToggles,2);
    assert.equal(captureStudioSpacebar(space('keydown'),false,()=>playbackToggles++),false);
  } finally {
    dom.window.document.removeEventListener('keydown',listener,true);
    dom.window.document.removeEventListener('keyup',listener,true);
    (globalThis as unknown as {document:Document}).document = previousDocument;
    (globalThis as unknown as {Element:typeof Element}).Element = previousElement;
    dom.window.close();
  }
});

test('recovery respects a user pause and seek, limits retries, and allows manual retry', () => {
  const video=new FakeVideo(), messages:string[]=[];
  const recovery=recoverVideo(video as unknown as HTMLVideoElement,{position:()=>4200,status:message=>messages.push(message)});
  video.dispatchEvent(new Event('error')); recovery.toggle(); recovery.seek(4300);
  video.readyState=1;video.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(video.currentTime,4300);
  video.dispatchEvent(new Event('seeked'));assert.equal(video.plays,0);
  video.dispatchEvent(new Event('error'));video.dispatchEvent(new Event('error'));video.dispatchEvent(new Event('error'));
  assert.equal(video.loads,3);assert.match(messages.at(-1)!,/press play to retry/i);
  assert.equal(recovery.isRecovering(),true);video.dispatchEvent(new Event('error'));assert.equal(video.loads,3);
  recovery.toggle();assert.equal(video.loads,4);
  recovery.dispose();video.dispatchEvent(new Event('error'));assert.equal(video.loads,4);
});

test('URL route survives refreshes, differentiates pages, and encodes task identifiers', () => {
  let hash = '#/matches';
  const oldWindow = globalThis.window;
  const history = {
    pushState(_state:unknown,_title:string,target:string){hash=target;},
    replaceState(_state:unknown,_title:string,target:string){hash=target;},
  };
  (globalThis as unknown as {window:unknown}).window={location:{get hash(){return hash;}},history};
  try{
    assert.equal(readStudioRoute().view,'tasks');
    writeStudioRoute('studio','task/with space');
    assert.equal(hash,'#/studio/task%2Fwith%20space');
    assert.deepEqual(readStudioRoute(),{view:'studio',taskId:'task/with space'});
    writeStudioRoute('reports','t1');
    assert.deepEqual(readStudioRoute(),{view:'reports',taskId:'t1'});
  }finally{(globalThis as unknown as {window:unknown}).window=oldWindow;}
});

test('restoring a session shows a neutral loading view rather than the login screen', () => {
  const html = renderToStaticMarkup(<Screen id="loading" context={{}} />);
  assert.match(html,/Restoring your workspace/);
  assert.doesNotMatch(html,/loginemail|loginpass/);
});

test('leaderboard excludes brands without positive duration, while configured brands stay available', () => {
  const sources={sponsors:data.sponsorGroups[0].sponsors,events:data.eventGroups[0].items,cameras:data.cameraGroups[0].items};
  const stats=computeInsights(task,sources);
  assert.equal(stats.brands.length,3);
  assert.deepEqual(stats.active.map(brand=>brand.name),['Recorded Brand']);
  const html=renderToStaticMarkup(<ExposureReport task={task} source={sources} focusId="" />);
  const leaderboard=html.split('BRAND EXPOSURE LEADERBOARD')[1].split('SPONSORSHIP PLACEMENT TYPE')[0];
  assert.match(leaderboard,/1 BRANDS RECORDED/);
  assert.match(leaderboard,/Recorded Brand/);
  assert.doesNotMatch(leaderboard,/Zero Brand|Untracked Brand/);
  assert.match(html,/exposure-curve-chart/);
  assert.doesNotMatch(html,/insight-bars/);
});

const studio:StudioScreenModel={
    id:task.id,number:task.number,name:task.name,duration:task.duration,status:'done',
    sponsorAnalyst:'Worker',contextAnalyst:'Worker',canSponsor:true,canContext:true,
    selectedTab:'all',tick:20,sponsorCount:0,logCount:2,cameraLabel:'CAMERA NOT SELECTED',
    seekStep:5,playbackRate:1,videoDimensions:'',videoError:'',playing:false,railTitle:'SPONSORS',railHint:'',
    submitted:task.submitted,task,sponsors:data.sponsorGroups[0].sponsors,events:data.eventGroups[0].items,
    cameras:data.cameraGroups[0].items,isLocalVideo:false,
};

test('Studio offers direct playback speeds from quarter-speed through double-speed', () => {
  assert.deepEqual(VIDEO_PLAYBACK_RATES, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]);
  assert.equal(supportedPlaybackRate(0.25), true);
  assert.equal(supportedPlaybackRate(0.5), true);
  assert.equal(supportedPlaybackRate(0.75), true);
  assert.equal(supportedPlaybackRate(3), false);
  const html=renderToStaticMarkup(<AnnotationStudioScreen model={studio} isAdmin={false}/>);
  const speedControl=html.match(/<select[^>]*id="rateButton"[^>]*>.*?<\/select>/)?.[0];
  assert.ok(speedControl,'playback speed is a selectable control');
  assert.match(speedControl,/aria-label="Video playback speed"/);
  for(const rate of VIDEO_PLAYBACK_RATES)assert.match(speedControl,new RegExp(`<option value="${rate}"`));
  assert.match(speedControl,/<option value="1" selected="">1×<\/option>/,'normal speed stays selected by default');
});

test('re-tagging a saved sponsor splits only the selected interval and starts a new LIVE tag', () => {
  const saved=[
    {id:'early',sponsorId:'gatorade',start:230,end:260,createdBy:'analyst',createdAt:'then',placement:'LED'},
    {id:'later',sponsorId:'gatorade',start:380,end:410,createdBy:'analyst',createdAt:'then'},
    {id:'other',sponsorId:'other',start:210,end:400,createdBy:'analyst',createdAt:'then'},
  ];
  const result=retagSponsorFromTimestamp(saved,'early',240,'reviewer','now',()=> 're-tagged');
  assert.deepEqual(result?.map(row=>[row.id,row.sponsorId,row.start,row.end]),[
    ['later','gatorade',380,410],['other','other',210,400],
    ['early','gatorade',230,240],['re-tagged','gatorade',240,null],
  ]);
  assert.equal(result?.at(-1)?.placement,'LED','the resumed tag preserves sponsor metadata');
  assert.equal(saved[0].end,260,'saved source is not modified in place');
  assert.equal(nextSavedSponsorStart(result!,'gatorade',240),380,'later saved tags are protected');
  assert.equal(nextSavedSponsorStart(result!,'gatorade',400),null);
  assert.equal(retagSponsorFromTimestamp(saved,'early',230,'reviewer','now',()=> 'fresh')?.some(row=>row.id==='early'),false,'re-tagging at interval start replaces the entire original');
  assert.equal(retagSponsorFromTimestamp(saved,'early',260,'reviewer','now',()=> 'bad'),null,'cannot split after the interval ends');
  assert.equal(retagSponsorFromTimestamp(result!,'later',390,'reviewer','now',()=> 'bad'),null,'a second concurrent live tag is refused');
  const html=renderToStaticMarkup(<StudioRail model={{...studio,tick:240,task:{...task,sponsors:[{id:'early',sponsorId:'s1',start:230,end:260,createdBy:'a1',createdAt:'then'}]}}} />);
  assert.match(html,/SAVED at this time, click to re-tag from here/);
  assert.doesNotMatch(html,/SAVED at this time, click to edit/);
  const timeline=renderToStaticMarkup(<StudioTimeline model={{...studio,tick:240,task:{...task,sponsors:[{id:'early',sponsorId:'s1',start:230,end:260,createdBy:'a1',createdAt:'then'}]}}} />);
  assert.match(timeline,/Click to re-tag/,'saved timeline segments offer the same re-tag action');
});

test('clicking a saved sponsor timeline segment re-tags at the clicked timestamp', async () => {
  const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost/'});
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  const oldAct=(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as unknown as {window:Window}).window=dom.window as unknown as Window;
  (globalThis as unknown as {document:Document}).document=dom.window.document;
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const calls:{kind:string;id?:string;at:number}[]=[];
  dom.window.seekVideo=(at:number)=>calls.push({kind:'seek',at});
  dom.window.retagRecordedSponsor=(id:string,at:number)=>calls.push({kind:'re-tag',id,at});
  const root=createRoot(dom.window.document.getElementById('mount')!);
  try {
    const sample={...studio,task:{...task,sponsors:[{...task.sponsors[0],start:230,end:260}]},tick:240};
    await act(async()=>root.render(<StudioTimeline model={sample}/>));
    const segment=dom.window.document.querySelector('.block.sponsor') as HTMLElement;
    assert.ok(segment);
    segment.getBoundingClientRect=()=>({left:100,width:100,right:200,top:0,bottom:20,height:20,x:100,y:0,toJSON(){return {};}});
    await act(async()=>segment.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:150})));
    assert.deepEqual(calls,[{kind:'seek',at:245},{kind:'re-tag',id:'one',at:245}]);
  } finally {
    await act(async()=>root.unmount());
    (globalThis as unknown as {window:Window}).window=oldWindow;
    (globalThis as unknown as {document:Document}).document=oldDocument;
    (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=oldAct;
    dom.window.close();
  }
});

test('timelines contain only annotated tracks, one shared cursor, and a layer filter', () => {
  const html=renderToStaticMarkup(<StudioTimeline model={studio} />);
  assert.equal((html.match(/class="trackrow"/g)||[]).length,1);
  assert.match(html,/timelineLayerFilter/);
  assert.match(html,/value="cameras"/);
  assert.equal((html.match(/class="timeline-global-playhead"/g)||[]).length,1);
  assert.doesNotMatch(html,/class="playhead"/);
  assert.doesNotMatch(html,/Zero Brand/);
});

test('exposure chart scales to observed values and offers selectable time windows', () => {
  const sources={sponsors:data.sponsorGroups[0].sponsors,events:data.eventGroups[0].items,cameras:data.cameraGroups[0].items};
  const stats=computeInsights(task,sources);
  const report=renderToStaticMarkup(<ExposureReport task={task} source={sources} focusId="" />);
  const trend=report.split('WHERE SPONSORS APPEAR IN THE MATCH')[1].split('BRAND EXPOSURE LEADERBOARD')[0];
  assert.match(trend,/TIME INTERVAL/);
  assert.match(trend,/id="exposureInterval"/);
  assert.match(trend,/BRAND FILTER/);
  assert.ok(trend.indexOf('id="exposureInterval"') < trend.indexOf('exposure-curve-chart'));
  assert.match(trend,/1 minute/);
  assert.match(trend,/30 minutes/);
  const chart=renderToStaticMarkup(<ExposureTrend data={stats} focusId="" />);
  assert.match(chart,/data-max-percent="20"/);
  assert.match(chart,/visibility peaked at 9\.3% during 00:00–05:00/);
  const minute=renderToStaticMarkup(<ExposureTrend data={stats} focusId="" windowSeconds={60} />);
  assert.match(minute,/data-max-percent="60"/);
  assert.match(minute,/46\.7% during 00:00–01:00/);
  const fullCoverage={...task,sponsors:[{...task.sponsors[0],start:0,end:300}]};
  const full=renderToStaticMarkup(<ExposureTrend data={computeInsights(fullCoverage,sources)} focusId="" />);
  assert.match(full,/data-max-percent="100"/);
});

test('chart hover gives sponsor name, interval coverage and recorded duration', async () => {
  const sources={sponsors:data.sponsorGroups[0].sponsors,events:data.eventGroups[0].items,cameras:data.cameraGroups[0].items};
  const stats=computeInsights(task,sources);
  const previousWindow=globalThis.window;
  const previousDocument=globalThis.document;
  const previousAct=(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT;
  const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost/'});
  (globalThis as unknown as {window:Window}).window=dom.window as unknown as Window;
  (globalThis as unknown as {document:Document}).document=dom.window.document;
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const container=dom.window.document.getElementById('mount')!;
  const root=createRoot(container);
  try {
    await act(async()=>root.render(<ExposureTrend data={stats} focusId=""/>));
    const svg=container.querySelector('svg.exposure-curve-chart') as SVGSVGElement;
    svg.getBoundingClientRect=()=>({left:0,top:0,right:920,bottom:260,width:920,height:260,x:0,y:0,toJSON(){return {};}});
    await act(async()=>svg.dispatchEvent(new dom.window.MouseEvent('mousemove',{bubbles:true,clientX:200,clientY:120})));
    const tooltip=container.querySelector('[data-chart-tooltip="sponsors"]');
    assert.ok(tooltip,'hover reveals an exposure detail panel');
    assert.match(tooltip.textContent||'',/00:00 – 05:00/);
    assert.match(tooltip.textContent||'',/Recorded Brand/);
    assert.match(tooltip.textContent||'',/9\.3%/);
    assert.match(tooltip.textContent||'',/00:28/);
    await act(async()=>root.render(<ExposureReport task={task} source={sources} focusId=""/>));
    const select=container.querySelector<HTMLSelectElement>('#exposureInterval')!;
    assert.equal(select.value,'300');
    select.value='60';
    await act(async()=>select.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
    assert.equal(container.querySelector('svg.exposure-curve-chart')?.getAttribute('data-max-percent'),'60');
  }finally{
    await act(async()=>root.unmount());
    (globalThis as unknown as {window:Window}).window=previousWindow;
    (globalThis as unknown as {document:Document}).document=previousDocument;
    (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=previousAct;
    dom.window.close();
  }
});

test('events and camera buttons remain available together in complementary panels', () => {
  const events={...studio,selectedTab:'events' as const};
  const camera={...studio,selectedTab:'cameras' as const};
  assert.match(renderToStaticMarkup(<StudioControls model={events}/>),/CAMERA ANGLES/);
  assert.match(renderToStaticMarkup(<StudioControls model={events}/>),/camera-chip/);
  assert.match(renderToStaticMarkup(<StudioRail model={events}/>),/GOAL/i);
  assert.match(renderToStaticMarkup(<StudioControls model={camera}/>),/KEY MATCH EVENTS/);
  assert.match(renderToStaticMarkup(<StudioRail model={camera}/>),/Wide/);
});

test('camera selections switch without a manual stop and keep one live interval',()=>{
  let nextId=0;
  const makeId=()=>`camera-${++nextId}`;
  const initial=selectCameraAngle([], 'wide', 10, 'analyst', 'now',makeId);
  assert.equal(initial.action,'started');
  assert.deepEqual(initial.rows.map(row=>[row.cameraId,row.start,row.end]),[['wide',10,null]]);
  const switched=selectCameraAngle(initial.rows,'closeup',25,'analyst','now',makeId);
  assert.equal(switched.action,'switched');
  assert.deepEqual(switched.rows.map(row=>[row.cameraId,row.start,row.end]),[['wide',10,25],['closeup',25,null]]);
  assert.equal(switched.rows.filter(row=>row.end===null).length,1);
  const stopped=selectCameraAngle(switched.rows,'closeup',40,'analyst','now',makeId);
  assert.equal(stopped.action,'stopped');
  assert.deepEqual(stopped.rows.map(row=>row.end),[25,40]);
  const cancelled=selectCameraAngle(initial.rows,'wide',10,'analyst','now',makeId);
  assert.equal(cancelled.action,'cancelled');
  assert.equal(cancelled.rows.length,0);
  const sameMomentSwitch=selectCameraAngle(initial.rows,'closeup',10,'analyst','now',makeId);
  assert.deepEqual(sameMomentSwitch.rows.map(row=>[row.cameraId,row.start,row.end]),[['closeup',10,null]]);
  const legacyTwo=[...initial.rows,{id:'old',cameraId:'bench',start:12,end:null,createdBy:'analyst',createdAt:'now'}];
  const normalized=selectCameraAngle(legacyTwo,'replay',30,'analyst','now',makeId);
  assert.equal(normalized.rows.filter(row=>row.end===null).length,1);
  assert.deepEqual(normalized.rows.filter(row=>row.cameraId!=='replay').map(row=>row.end),[30,30]);
});

test('resuming a SAVED camera starts LIVE at the playhead and preserves only earlier camera history',()=>{
  const make=(id:string,cameraId:string,start:number,end:number|null)=>({id,cameraId,start,end,createdBy:'analyst',createdAt:'then'});
  const saved=[make('wide-old','wide',10,30),make('close-old','close',30,50),make('replay-old','replay',52,60)];
  assert.equal(hasRecordedCameraAfter(saved,20),true);
  assert.equal(hasRecordedCameraAfter(saved,61),false);
  const resumed=resumeCameraFromTimestamp(saved,'wide',20,'analyst','now',()=> 'wide-live');
  assert.deepEqual(resumed.rows.map(row=>[row.id,row.cameraId,row.start,row.end]),[
    ['wide-old','wide',10,20],['wide-live','wide',20,null],
  ]);
  assert.equal(resumed.removed,2);
  assert.equal(resumed.trimmed,1);
  assert.equal(saved[0].end,30,'source saved interval is not mutated');
  assert.equal(resumed.rows.filter(row=>row.end===null).length,1);
  const switched=selectCameraAngle(resumed.rows,'close',26,'analyst','now',()=> 'close-live');
  assert.deepEqual(switched.rows.map(row=>[row.cameraId,row.start,row.end]),[
    ['wide',10,20],['wide',20,26],['close',26,null],
  ]);
  const boundary=resumeCameraFromTimestamp(saved,'close',30,'analyst','now',()=> 'new-close');
  assert.deepEqual(boundary.rows.map(row=>[row.cameraId,row.start,row.end]),[
    ['wide',10,30],['close',30,null],
  ]);
  const zero=resumeCameraFromTimestamp([make('a','wide',5,15)],'replay',5,'analyst','now',()=> 'new');
  assert.deepEqual(zero.rows.map(row=>[row.cameraId,row.start,row.end]),[['replay',5,null]]);
});

test('studio assignments explain each role and workspace creation is hidden', () => {
  const page=renderToStaticMarkup(<AnnotationStudioScreen model={studio} isAdmin />);
  assert.ok(page.indexOf('class="studio-head"') > page.indexOf('class="studio-media-column"'));
  assert.match(page,/Sponsor tagging: Assigned to Worker/);
  assert.match(page,/Events &amp; cameras: Assigned to Worker/);
  assert.doesNotMatch(page,/Sponsors: Worker|Context: Worker/);
  const workspace=renderToStaticMarkup(<WorkspaceScreen workspaces={[{id:'w1',name:'Messi Cup',slug:'mc'}]} />);
  assert.doesNotMatch(workspace,/CREATE WORKSPACE|newWorkspaceName/);
  const shell=renderToStaticMarkup(<AppShell screen="dashboard" context={{user:{name:'Worker',role:'admin'},workspaceName:'Messi Cup',workspaces:[{id:'w1',name:'Messi Cup',slug:'mc'}]}}><span>Home</span></AppShell>);
  assert.match(shell,/ops-workspace-name/);
  assert.doesNotMatch(shell,/Manage workspaces|Switch workspace/);
});

test('studio wheel stops when video meets sponsor rail, pauses briefly, then continues', () => {
  const dom = new JSDOM('<div id="left"><div id="video"></div></div><div id="right"></div>');
  const column = dom.window.document.getElementById('left')!;
  const video = dom.window.document.getElementById('video')!;
  const rail = dom.window.document.getElementById('right')!;
  Object.defineProperty(column, 'scrollHeight', { value: 1800 });
  Object.defineProperty(column, 'clientHeight', { value: 700 });
  column.getBoundingClientRect = () => ({ top: 80 } as DOMRect);
  video.getBoundingClientRect = () => ({ top: 135 - column.scrollTop } as DOMRect);
  const detach = attachVideoAlignmentPause(column, video, () => true);
  const wheel = (element: Element, deltaY: number) => {
    const event = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  };
  try {
    assert.equal(wheel(column, 100), true, 'first scroll catches at alignment');
    assert.equal(column.scrollTop, 55);
    assert.equal(wheel(column, 70), true, 'next scroll is held briefly');
    assert.equal(column.scrollTop, 55);
    assert.equal(wheel(rail, 100), false, 'sponsor panel scroll is independent');
    assert.equal(wheel(column, 100), true, 'extra wheel distance releases the catch');
    assert.equal(column.scrollTop, 85);
    assert.equal(wheel(column, 100), false, 'later movement scrolls freely');
    assert.equal(wheel(column, -100), false, 'reverse scrolling is never blocked');
    column.scrollTop = 0;
    assert.equal(wheel(column, 90), true, 'alignment can be reached again after returning up');
  } finally {
    detach();
    dom.window.close();
  }
});

test('fixture cards are fully keyboard-accessible and team names use equal halves', () => {
  const html=renderToStaticMarkup(<MatchesScreen context={{data,viewerId:'a1',user:{name:'Owner',role:'admin'},taskFilter:'all',fixtureDay:'all',fixtures:[{id:'M13',date:'2026-10-29',home:'Home FC',away:'Away FC'}],badges:{}}} />);
  assert.match(html,/class="fixture-card fixture-task-done" role="button" tabindex="0"/);
  assert.match(html,/fixture-mini-team home/);
  assert.match(html,/fixture-mini-team away/);
});

test('coverage counts short gaps, excludes long missing windows and ignores playback position', () => {
  const base={...task,duration:600,sponsors:[{...task.sponsors[0],start:0,end:60},{...task.sponsors[0],id:'next',start:360,end:420}],cameras:[],events:[],observedTime:600};
  const complete={...base,sponsorGroupIds:['g1'],cameraGroupIds:[],eventGroupIds:['e1']};
  assert.equal(measuredCoverage(base.sponsors,600),120,'five-minute missing window is not covered');
  assert.equal(labelingProgress(complete).percent,20);
  const gap={...base,sponsors:[{...task.sponsors[0],start:0,end:60},{...task.sponsors[0],id:'next',start:180,end:200}]};
  assert.equal(measuredCoverage(gap.sponsors,600),200,'two-minute gap bridges two recorded intervals');
  const empty={...complete,sponsors:[],events:[{id:'goal',eventId:'goal',kind:'point' as const,start:480,end:481,createdBy:'a1',createdAt:'now'}]};
  assert.equal(labelingProgress(empty).percent,0,'a played video and a sparse match moment do not imply coverage');
  assert.equal(labelingProgress(empty).eventCount,1);
  assert.equal(annotatedEndpoint(empty),481);
  const rendered=renderToStaticMarkup(<LabelingStatusScreen data={{...data,tasks:[empty]}} viewerId="a1" admin />);
  assert.match(rendered,/Labeling status/);
  assert.match(rendered,/0.0%/);
  assert.match(rendered,/1 recorded/);
});

test('timeline ends near annotations and allows control-scroll zoom', () => {
  const sample={...studio,duration:8100,task:{...studio.task,duration:8100,sponsors:[{...task.sponsors[0],start:0,end:60}]}};
  const markup=renderToStaticMarkup(<StudioTimeline model={sample}/>);
  assert.match(markup,/timeline through 01:00/);
  assert.match(markup,/Ctrl \+ scroll to zoom/);
  assert.match(markup,/00:15/);
  assert.doesNotMatch(markup,/02:15:00/);
  assert.match(markup,/Reset zoom/);
});

test('recorded annotations are visible at the playhead, and admin task deletion is gated', () => {
  const at={...studio,tick:20,task:{...studio.task,sponsors:[{...task.sponsors[0],start:2,end:30}],cameras:[{id:'c',cameraId:'camera',start:10,end:40,createdBy:'a1',createdAt:'now'}]}};
  const rail=renderToStaticMarkup(<StudioRail model={at}/>);
  assert.match(rail,/SAVED at this time, click to re-tag from here/);
  assert.match(rail,/● SAVED/);
  assert.match(renderToStaticMarkup(<StudioControls model={at}/>),/SAVED at this time, tap to resume LIVE with confirmation/);
  const cameraAt={...at,selectedTab:'cameras' as const};
  assert.match(renderToStaticMarkup(<StudioRail model={cameraAt}/>),/SAVED at this time, tap to resume LIVE with confirmation/);
  const cameraLive={...cameraAt,task:{...cameraAt.task,cameras:[{...cameraAt.task.cameras[0],start:20,end:null}]}};
  assert.match(renderToStaticMarkup(<StudioRail model={cameraLive}/>),/LIVE, tap to end/);
  const studioHtml=renderToStaticMarkup(<AnnotationStudioScreen model={at} isAdmin/>);
  assert.match(studioHtml,/DELETE TASK/);
  assert.match(studioHtml,/REOPEN TASK/);
});

test('interval editing keeps the selected sponsor category active', () => {
  const editing={...studio,selectedTab:'sponsors' as const,editingInterval:{key:'sponsors' as const,id:'one',start:2,end:30}};
  const html=renderToStaticMarkup(<AnnotationStudioScreen model={editing} isAdmin/>);
  const sponsorTab=html.match(/<button[^>]*data-studio-tab="sponsors"[^>]*>/)?.[0]||'';
  assert.match(sponsorTab,/aria-pressed="true"/);
  assert.match(html,/EDIT INTERVAL/);
  assert.match(html,/Save interval/);
  assert.match(html,/Select sponsor logos from the right-hand SPONSORS panel/);
});

test('sponsor and tag shortcuts accept letters, digits, Ctrl and Alt with stable normalized keys',()=>{
  assert.equal(normalizeHotkey(' Ctrl + Q '),'ctrl+q');
  assert.equal(normalizeHotkey('Alt + 8'),'alt+8');
  assert.equal(normalizeHotkey('t'),'t');
  assert.equal(normalizeHotkey('shift+x'),'');
  assert.equal(displayHotkey('ctrl+r'),'Ctrl + R');
  const key=(code:string,extra:Partial<KeyboardEvent>={})=>({key:code==='Digit1'?'1':'q',code,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,...extra});
  assert.equal(hotkeyFromKeyboard(key('KeyQ',{ctrlKey:true})),'ctrl+q');
  assert.equal(hotkeyFromKeyboard(key('Digit1',{altKey:true})),'alt+1');
  assert.equal(hotkeyFromKeyboard(key('KeyQ',{shiftKey:true})), '');
  const sponsorHtml=renderToStaticMarkup(<StudioModal model={{type:'sponsor',group:{id:'g',name:'Brands',sponsors:[]},sponsor:{id:'s',name:'Orange',hotkey:'alt+q'}}}/>);
  assert.match(sponsorHtml,/id="shotkey"/);
  assert.match(sponsorHtml,/value="alt\+q"/);
  const attrHtml=renderToStaticMarkup(<StudioModal model={{type:'item',kind:'camera',groupId:'cg',item:{id:'camera',name:'Wide',hotkey:'ctrl+1'}}}/>);
  assert.match(attrHtml,/id="ihotkey"/);
  assert.match(attrHtml,/value="ctrl\+1"/);
});

test('PNG uploads preserve the original bytes without canvas resizing or format conversion',async()=>{
  const dom=new JSDOM('',{url:'http://localhost/'});
  const oldReader=globalThis.FileReader;
  (globalThis as unknown as {FileReader:typeof FileReader}).FileReader=dom.window.FileReader;
  const original=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,72,68,82]);
  const file=new dom.window.File([original],'original.png',{type:'image/png'});
  Object.defineProperty(file,'slice',{value:(_start:number,_end:number)=>({arrayBuffer:async()=>original.slice(0,8).buffer})});
  try {
    const result=await readOriginalPng(file);
    assert.equal(result,`data:image/png;base64,${Buffer.from(original).toString('base64')}`);
    assert.equal(MAX_ORIGINAL_PNG_BYTES,2*1024*1024);
    const fake=new dom.window.File([new Uint8Array([1,2,3,4,5,6,7,8])],'fake.png',{type:'image/png'});
    Object.defineProperty(fake,'slice',{value:()=>({arrayBuffer:async()=>new Uint8Array([1,2,3,4,5,6,7,8]).buffer})});
    await assert.rejects(()=>readOriginalPng(fake),/valid PNG/);
    const modal=renderToStaticMarkup(<StudioModal model={{type:'sponsor',group:{id:'g',name:'Sponsors',sponsors:[]}}}/>);
    assert.match(modal,/accept="image\/png,\.png"/);
    assert.match(modal,/original PNG is stored unchanged/);
    assert.doesNotMatch(modal,/trimmed automatically/);
  }finally{
    (globalThis as unknown as {FileReader:typeof FileReader}).FileReader=oldReader;
    dom.window.close();
  }
});

test('catalog reordering persists array order and changes studio button order',()=>{
  const sponsors=[{id:'alpha',name:'Alpha'},{id:'beta',name:'Beta'},{id:'gamma',name:'Gamma'}];
  const moved=reorderById(sponsors,'gamma','alpha','before');
  assert.deepEqual(moved.map(item=>item.id),['gamma','alpha','beta']);
  assert.deepEqual(sponsors.map(item=>item.id),['alpha','beta','gamma']);
  assert.deepEqual(reorderById(moved,'gamma','beta','after').map(item=>item.id),['alpha','beta','gamma']);
  assert.strictEqual(reorderById(sponsors,'alpha','alpha'),sponsors);
  const orderedModel={...studio,sponsors:moved};
  const markup=renderToStaticMarkup(<StudioRail model={orderedModel}/>);
  assert.ok(markup.indexOf('Gamma')<markup.indexOf('Alpha'));
  assert.ok(markup.indexOf('Alpha')<markup.indexOf('Beta'));
});

test('copied sponsors keep original PNG/color but receive unique IDs and no conflicting hotkeys',()=>{
  const original={id:'first',name:'Roshan',logo:'data:image/png;base64,iVBORw0KGgo=',color:'#ff7722',hotkey:'ctrl+1'};
  const copied=copyCatalogEntry(original,'new-id',false);
  assert.equal(copied.logo,original.logo);
  assert.equal(copied.color,original.color);
  assert.equal(copied.name,original.name);
  assert.equal(copied.id,'new-id');
  assert.equal(copied.hotkey,'');
  assert.equal(original.hotkey,'ctrl+1');
  assert.equal(copyCatalogEntry(original,'same-list',true).name,'Roshan (copy)');
});

test('sponsor and attribute lists show drag, copy/paste and keyboard-accessible ordering controls',()=>{
  const richer={...data,sponsorGroups:[...data.sponsorGroups,{id:'g2',name:'Other list',sponsors:[]}],
    eventGroups:[...data.eventGroups,{id:'e2',name:'Other events',items:[]}]};
  const sponsorHtml=renderToStaticMarkup(<SponsorLibraryScreen data={richer}/>);
  assert.match(sponsorHtml,/Drag to reorder/);
  assert.match(sponsorHtml,/Copy/);
  assert.match(sponsorHtml,/Paste here/);
  assert.match(sponsorHtml,/Move .* list down/);
  const attrHtml=renderToStaticMarkup(<AttributesScreen data={richer}/>);
  assert.match(attrHtml,/Paste here/);
  assert.match(attrHtml,/Drag Goal to reorder/);
});

test('timeline segment carries sponsor configured color and offers confirmed edge editing',()=>{
  const customized={...studio,sponsors:[{id:'s1',name:'Recorded Brand',color:'#12a4dd'}],editingInterval:{key:'sponsors' as const,id:'one',start:2,end:30}};
  const timeline=renderToStaticMarkup(<StudioTimeline model={customized}/>);
  assert.match(timeline,/--segment-color:#12a4dd/);
  // The edit controls appear after the saved-annotation confirmation in the controller.
  const withEditing={...customized};
  const editMarkup=renderToStaticMarkup(<StudioTimeline model={withEditing}/>);
  assert.match(editMarkup,/timeline-edit-toolbar|timeline-resize-handle/);
});

test('refresh updates only incomplete fixtures on current match day and never rewrites completed scores',()=>{
  const today='2026-10-30';
  const fixture=(id:string,date:string,status:string,score:string)=>({id,date,home:'Home',away:'Away',status,score});
  const original=[fixture('M1',today,'finished','2 : 1'),fixture('M2',today,'scheduled',''),fixture('M3','2026-10-29','scheduled','')];
  const updates=[fixture('M1',today,'finished','9 : 9'),fixture('M2',today,'finished','0 : 0'),fixture('M3','2026-10-29','finished','1 : 1')];
  const next=mergeTodayFixtureUpdates(original,updates,today);
  assert.equal(next.changed,1);
  assert.equal(next.fixtures[0].score,'2 : 1');
  assert.equal(next.fixtures[1].score,'0 : 0');
  assert.equal(next.fixtures[2].score,'');
  assert.ok(hasFinalResult(next.fixtures[1]));
});

test('viewer sees only Insights and export, with no studio or management actions', () => {
  const viewer={user:{name:'Report viewer',role:'viewer' as const}};
  const reports={tasks:[{id:task.id,number:task.number,name:task.name}],selectedId:task.id,selectedTask:task,data,focusId:'',fixtures:[],badges:{},visibleTasks:[task]};
  const shell=renderToStaticMarkup(<AppShell screen="reports" context={viewer}><span>Reports</span></AppShell>);
  assert.match(shell,/Insights/);
  assert.doesNotMatch(shell,/>Overview<|>Matches<|>Team<|>Sponsors</);
  const page=renderToStaticMarkup(<Screen id="reports" context={{...viewer,reports}}/>);
  assert.match(page,/Export JSON/);
  assert.doesNotMatch(page,/Open studio/);
});

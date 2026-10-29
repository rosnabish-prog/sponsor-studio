import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readStudioRoute, writeStudioRoute } from '../src/state/routes';
import { computeInsights } from '../src/domain/analytics';
import { ExposureReport } from '../src/components/ReportWidgets';
import { ExposureTrend } from '../src/components/ExposureTrend';
import { MatchesScreen } from '../src/components/MatchScreens';
import { AnnotationStudioScreen } from '../src/components/AnnotationStudioScreen';
import { AppShell } from '../src/components/AppShell';
import { StudioControls, StudioRail, StudioTimeline } from '../src/components/StudioWidgets';
import { WorkspaceScreen } from '../src/components/WorkspaceScreen';
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
  const chart=renderToStaticMarkup(<ExposureTrend data={stats} focusId="" />);
  assert.match(chart,/TIME INTERVAL/);
  assert.match(chart,/1 minute/);
  assert.match(chart,/30 minutes/);
  assert.match(chart,/20% vertical scale/);
  assert.match(chart,/visibility peaked at 9\.3% during 00:00–05:00/);
  const fullCoverage={...task,sponsors:[{...task.sponsors[0],start:0,end:300}]};
  const full=renderToStaticMarkup(<ExposureTrend data={computeInsights(fullCoverage,sources)} focusId="" />);
  assert.match(full,/100% vertical scale/);
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

test('studio assignments explain each role and workspace creation is hidden', () => {
  const page=renderToStaticMarkup(<AnnotationStudioScreen model={studio} isAdmin />);
  assert.match(page,/Sponsor tagging: Assigned to Worker/);
  assert.match(page,/Events &amp; cameras: Assigned to Worker/);
  assert.doesNotMatch(page,/Sponsors: Worker|Context: Worker/);
  const workspace=renderToStaticMarkup(<WorkspaceScreen workspaces={[{id:'w1',name:'Messi Cup',slug:'mc'}]} />);
  assert.doesNotMatch(workspace,/CREATE WORKSPACE|newWorkspaceName/);
  const shell=renderToStaticMarkup(<AppShell screen="dashboard" context={{user:{name:'Worker',role:'admin'},workspaceName:'Messi Cup',workspaces:[{id:'w1',name:'Messi Cup',slug:'mc'}]}}><span>Home</span></AppShell>);
  assert.match(shell,/ops-workspace-name/);
  assert.doesNotMatch(shell,/Manage workspaces|Switch workspace/);
});

test('fixture cards are fully keyboard-accessible and team names use equal halves', () => {
  const html=renderToStaticMarkup(<MatchesScreen context={{data,viewerId:'a1',user:{name:'Owner',role:'admin'},taskFilter:'all',fixtureDay:'all',fixtures:[{id:'M13',date:'2026-10-29',home:'Home FC',away:'Away FC'}],badges:{}}} />);
  assert.match(html,/class="fixture-card fixture-task-done" role="button" tabindex="0"/);
  assert.match(html,/fixture-mini-team home/);
  assert.match(html,/fixture-mini-team away/);
});

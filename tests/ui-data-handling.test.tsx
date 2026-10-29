import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readStudioRoute, writeStudioRoute } from '../src/state/routes';
import { computeInsights } from '../src/domain/analytics';
import { ExposureReport } from '../src/components/ReportWidgets';
import { MatchesScreen } from '../src/components/MatchScreens';
import { StudioTimeline } from '../src/components/StudioWidgets';
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

test('timelines contain only annotated tracks and have an independent layer filter', () => {
  const studio:StudioScreenModel={
    id:task.id,number:task.number,name:task.name,duration:task.duration,status:'done',
    sponsorAnalyst:'Worker',contextAnalyst:'Worker',canSponsor:true,canContext:true,
    selectedTab:'all',tick:20,sponsorCount:0,logCount:2,cameraLabel:'CAMERA NOT SELECTED',
    seekStep:5,playbackRate:1,videoDimensions:'',videoError:'',playing:false,railTitle:'SPONSORS',railHint:'',
    submitted:task.submitted,task,sponsors:data.sponsorGroups[0].sponsors,events:data.eventGroups[0].items,
    cameras:data.cameraGroups[0].items,isLocalVideo:false,
  };
  const html=renderToStaticMarkup(<StudioTimeline model={studio} />);
  assert.equal((html.match(/class="trackrow"/g)||[]).length,1);
  assert.match(html,/timelineLayerFilter/);
  assert.match(html,/value="cameras"/);
  assert.doesNotMatch(html,/Zero Brand/);
});

test('fixture cards are fully keyboard-accessible and team names use equal halves', () => {
  const html=renderToStaticMarkup(<MatchesScreen context={{data,viewerId:'a1',user:{name:'Owner',role:'admin'},taskFilter:'all',fixtureDay:'all',fixtures:[{id:'M13',date:'2026-10-29',home:'Home FC',away:'Away FC'}],badges:{}}} />);
  assert.match(html,/class="fixture-card fixture-task-done" role="button" tabindex="0"/);
  assert.match(html,/fixture-mini-team home/);
  assert.match(html,/fixture-mini-team away/);
});

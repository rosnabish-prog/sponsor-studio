const fs = require('node:fs');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { JSDOM, VirtualConsole } = require('jsdom');

const bundle = buildSync({entryPoints:['src/main.tsx'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',loader:{'.css':'empty'},define:{'import.meta.env':'{}'}}).outputFiles[0].text;
const fixture = {id:'M13',date:'2026-10-29',home:'Home FC',away:'Away FC'};
const user = {id:'u1',name:'Admin',email:'admin@example.com'};
const workspace = {id:'w1',name:'Sponsor Studio',slug:'sponsor-studio'};
const task = {id:'t1',workspaceId:'w1',number:'M13',name:'Home FC vs Away FC',fixtureId:'M13',matchDate:'2026-10-29T00:00:00.000Z',durationSeconds:600,sponsorAnalystId:'u1',contextAnalystId:'u1',sponsorsSubmittedAt:null,contextSubmittedAt:null,createdAt:'2026-10-29T00:00:00.000Z',metadata:{sponsorGroupIds:['sg'],eventGroupIds:[],cameraGroupIds:[],videoType:'https',videoUrl:'https://media.example/video.mp4'},annotations:[{id:'a1',kind:'SPONSOR',labelId:'s1',start:3,end:30,placement:null,quality:null,createdBy:'u1',createdAt:'2026-10-29T00:00:00.000Z'}],videos:[]};
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));

async function verify(initialHash, expectedScreen){
  const errors=[];
  let unlockSession;
  const sessionGate = new Promise(resolve=>unlockSession=resolve);
  const virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:`http://127.0.0.1/${initialHash}`,runScripts:'dangerously',virtualConsole,beforeParse(window){
    window.scrollTo=()=>{};
    window.HTMLMediaElement.prototype.play=()=>Promise.resolve();
    window.HTMLMediaElement.prototype.pause=()=>{};
    window.fetch=async request=>{
      const path=String(request).replace('http://127.0.0.1','');
      if(path.endsWith('/auth/me'))await sessionGate;
      const result=path.endsWith('/auth/me')?{user}:
        path==='/api/workspaces'?[{role:'OWNER',workspace}]:
        path.endsWith('/catalog')?{version:1,payload:{sponsorGroups:[{id:'sg',name:'Brands',sponsors:[{id:'s1',name:'Test Brand'}]}],eventGroups:[],cameraGroups:[]}}:
        path.endsWith('/members')?[{role:'OWNER',user}]:
        path.endsWith('/tasks')?[task]:
        path==='data/fixtures.json'?{matches:Array.from({length:11},(_,i)=>({...fixture,id:`M${i+10}`})),clubs:[]}:
        null;
      return {ok:result!==null,status:result===null?404:200,json:async()=>result};
    };
  }});
  const {window}=dom;
  try {
    window.eval(bundle);
    await wait(35);
    assert.ok(window.document.querySelector('.session-loading'),'session verification presents a neutral waiting state');
    assert.equal(window.document.querySelector('#loginemail'),null,'login must never flash before session check');
    unlockSession();
    await wait(90);
    assert.equal(window.location.hash,initialHash,'reload preserves the selected route URL');
    assert.ok(window.document.querySelector(expectedScreen),`restored screen ${expectedScreen} is displayed`);
    assert.equal(window.document.querySelector('.session-loading'),null,'loading state closes after verification');
    assert.deepEqual(errors,[],'no uncaught browser errors');
    if(initialHash==='#/matches'){
      const insightButton=[...window.document.querySelectorAll('.ops-nav .nav')].find(element=>element.textContent.includes('Insights'));
      insightButton.click();
      assert.equal(window.location.hash,'#/insights','navigation writes an addressable page URL');
      assert.ok(window.document.querySelector('.insights-dashboard'),'insights route renders');
      window.history.back();
      await wait(35);
      assert.equal(window.location.hash,'#/matches','browser history restores previous URL');
      assert.ok(window.document.querySelector('.match-tile-grid'),'back navigation restores matches');
    }else{
      const menu=window.document.querySelector('#taskActionMenu');
      menu.open=true;
      window.document.body.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true}));
      assert.equal(menu.open,false,'clicking outside the action menu closes it');
      const segment=window.document.querySelector('.block.sponsor');
      assert.ok(segment,'recorded sponsor segment visible in timeline');
      segment.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:150}));
      await wait(5);
      assert.ok(window.document.querySelector('.timeline-context-menu button'),'right-click opens segment deletion action');
      window.document.querySelector('.timeline-context-menu button').click();
      assert.ok(window.document.querySelector('.modal .confirm-message'),'deletion requires confirmation');
      window.closeModal();
      window.createTaskModal('t1');
      assert.ok(window.document.querySelector('.task-video-removal button'),'source removal is located in Edit Task');
      window.document.querySelector('.task-video-removal button').click();
      await wait(10);
      assert.equal(window.document.querySelector('#taskremovevideo').value,'yes','editor queues removal on save');
      assert.equal(window.document.querySelector('#taskurl').value,'','editor clears the URL source');
    }
  }finally{dom.window.close();}
}

(async()=>{
  await verify('#/matches','.match-tile-grid');
  await verify('#/studio/t1','.studio-grid');
  process.stdout.write('Session restoration and multi-view navigation verified.\n');
})().catch(error=>{console.error(error);process.exitCode=1;});

// @ts-nocheck
// Existing page generators and annotation handlers, preserved during the
// component-by-component React migration. New code is checked strictly.
import type { LegacyMount } from '../types/legacy';
import { formatTimestamp as fmt, clampNumber as clamp, mergeIntervals as merged, intervalOverlap as overlap } from '../domain/intervals';

export function initializeLegacy(mount: LegacyMount) {
const DBKEY='messicup_sponsor_studio_v5', SESSION='messicup_studio_user_v5';
const uid=()=> 'id_'+Math.random().toString(36).slice(2,10);const copy=o=>JSON.parse(JSON.stringify(o));
const icons=n=>`<svg class="ic"><use href="#i-${n}"></use></svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tstamp=()=>new Date().toISOString(), toTime=s=>Number(s)||0;

// A dated, curated snapshot of publicly listed 2026 fixtures. NOT a live feed.
let OFFICIAL_FIXTURES=[
{id:'M13',date:'2026-10-26',home:'River Plate',away:'AFC Ajax',score:'2 : 0',group:'GROUP A',venue:'IMCF Stadium'},
{id:'M19',date:'2026-10-27',home:'River Plate',away:'Inter',score:'3 : 1',group:'GROUP A',venue:'Field 4'},
{id:'M20',date:'2026-10-27',home:'Chelsea FC',away:'AFC Ajax',score:'0 : 2',group:'GROUP A',venue:'Field 6'},
{id:'M21',date:'2026-10-27',home:'Boca Juniors',away:'CR Flamengo',score:'1 : 1',group:'GROUP D',venue:'IMCF Stadium'},
{id:'M22',date:'2026-10-27',home:'SL Benfica',away:'Independiente del Valle',score:'4 : 2',group:'GROUP C',venue:'IMCF Stadium'},
{id:'M23',date:'2026-10-27',home:'Palmeiras',away:'Arsenal FC',score:'3 : 1',group:'GROUP B',venue:'IMCF Stadium'},
{id:'M24',date:'2026-10-27',home:'Manchester City',away:'UE Cornellà',score:'1 : 2',group:'GROUP D',venue:'IMCF Stadium'},
{id:'M25',date:'2026-10-28',home:'Chelsea FC',away:'Manchester City',score:'',group:'COPA PLATA',venue:'Field 4'},
{id:'M26',date:'2026-10-28',home:"Newell's Old Boys",away:'Independiente del Valle',score:'2 : 0',group:'COPA PLATA',venue:'Field 6'},
{id:'M27',date:'2026-10-28',home:'Inter Miami CF',away:'Arsenal FC',score:'0 : 1',group:'COPA PLATA',venue:'Field 4'},
{id:'M28',date:'2026-10-28',home:'UE Cornellà',away:'Inter',score:'2 : 1',group:'COPA PLATA',venue:'Field 6'},
{id:'M29',date:'2026-10-28',home:'River Plate',away:'CR Flamengo',score:'2 : 1',group:'COPA ORO',venue:'IMCF Stadium'},
{id:'M30',date:'2026-10-28',home:'Atlético de Madrid',away:'FC Barcelona',score:'3 : 1',group:'COPA ORO',venue:'IMCF Stadium'},
{id:'M31',date:'2026-10-28',home:'Palmeiras',away:'SL Benfica',score:'6 : 3',group:'COPA ORO',venue:'IMCF Stadium'},
{id:'M32',date:'2026-10-28',home:'Boca Juniors',away:'AFC Ajax',score:'1 : 2',group:'COPA ORO',venue:'IMCF Stadium'},
{id:'M33',date:'2026-10-30',home:'Manchester City',away:'Independiente del Valle',score:'',group:'COPA PLATA',venue:'IMCF Stadium'},
{id:'M34',date:'2026-10-30',home:'Inter Miami CF',away:'Inter',score:'',group:'COPA PLATA',venue:'IMCF Stadium'},
{id:'M35',date:'2026-10-30',home:'CR Flamengo',away:'FC Barcelona',score:'',group:'COPA ORO',venue:'IMCF Stadium'},
{id:'M36',date:'2026-10-30',home:'SL Benfica',away:'Boca Juniors',score:'',group:'COPA ORO',venue:'IMCF Stadium'}
];
const BADGES={
'River Plate':'https://commons.wikimedia.org/wiki/Special:FilePath/Club_Atl%C3%A9tico_River_Plate_logo.svg',
'AFC Ajax':'https://commons.wikimedia.org/wiki/Special:FilePath/Logo_AFC_Ajax_%281928-1991%2C_2025-%29.svg',
'Inter Miami CF':'https://playclubsoccer.org/logos/inter-miami-cf_logo.png',
'Chelsea FC':'https://toppng.com/uploads/preview/chelsea-fc-vector-logo-11574230515h7qxtmmgxz.png',
'Manchester City':'https://1.bp.blogspot.com/-Dzjk61XwScM/YBcY5v1MbRI/AAAAAAAACi0/1XLjptsZeDMwYcbELUV_ALiGSLxp3b30ACLcBGAsYHQ/s1200/1200px-Manchester_City_FC_badge.svg.png',
'FC Barcelona':'https://pngimg.com/uploads/fcb_logo/fcb_logo_PNG25.png',
'Atlético de Madrid':'https://toppng.com/public/uploads/preview/club-atletico-de-madrid-logo-vector-11574137503ryvaeaidnk.png',
'SL Benfica':'https://p1.hiclipart.com/preview/789/1003/729/champions-league-logo-sl-benfica-b-ligapro-sl-benfica-under19-portugal-primeira-liga-football-sporting-cp-png-clipart.jpg',
'Boca Juniors':'https://img.favpng.com/1/6/15/boca-juniors-copa-libertadores-argentina-national-football-team-superliga-argentina-de-f-tbol-png-favpng-XD4ww9dvr9r0gYQP0s4xJf77c.jpg',
'Palmeiras':'https://icon2.cleanpng.com/20190202/vfb/kisspng-dream-league-soccer-sociedade-esportiva-palmeiras-betonmobile-ru-1713908376829.webp',
"Newell's Old Boys":'https://images.seeklogo.com/logo-png/30/1/newells-old-boys-logo-png_seeklogo-307585.png',
'Independiente del Valle':'https://www.logotypes101.com/logos/863/F5D3418E82A92E61E8AC6B20401C321F/selloindependiente.png'
};
const fixtureById=id=>OFFICIAL_FIXTURES.find(f=>f.id===id)||null;
async function refreshFixtureFeed(){
  try{
    const response=await fetch('data/fixtures.json',{cache:'no-store'});
    if(!response.ok)throw Error('Feed unavailable: '+response.status);
    const payload=await response.json();
    if(!Array.isArray(payload.matches)||payload.matches.length<10)throw Error('Incomplete feed');
    const safe=payload.matches.filter(f=>f&&typeof f.id==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(f.date)&&typeof f.home==='string'&&typeof f.away==='string');
    if(safe.length<10)throw Error('Invalid feed');
    OFFICIAL_FIXTURES=safe;
    for(const team of payload.clubs||[]){
      if(team.name&&typeof team.logo==='string'&&/^https:\/\//.test(team.logo))BADGES[team.name]=team.logo;
    }
    fixtureSyncLabel='BuildUp public fixture feed · auto-synced';
    if(me()&&!modalOpen&&['tasks','dashboard'].includes(view))render();
  }catch(err){console.warn('Using bundled fixture snapshot:',err.message)}
}
window.chooseFixtureDay=day=>{fixtureDay=day;render()};
// Match catalog links fixtures to existing tasks rather than creating duplicates.
const taskForFixture=id=>{
 const key=String(id||'').trim().toUpperCase();
 if(!key)return null;
 const matching=db.tasks.filter(t=>{
  const fixture=String(t.fixtureId||'').trim().toUpperCase();
  const number=String(t.number||'').trim().toUpperCase();
  return fixture===key||number===key||number==='MC-'+key;
 });
 // If older browser data has duplicate tasks, surface completed work first.
 return matching.find(t=>taskStatus(t)==='done')
  ||matching.find(t=>taskStatus(t)==='progress')
  ||matching[0]||null;
};
window.openFixtureTask=id=>{
 if(me()?.role!=='admin')return;
 const existing=taskForFixture(id);
 if(existing){openTask(existing.id);return}
 createTaskModal();
 const sel=document.getElementById('taskfixture');
 if(sel){sel.value=id;selectFixture(id)}
};
const fixtureFor=t=>fixtureById(t.fixtureId)||OFFICIAL_FIXTURES.find(f=>t.number===f.id||t.number==='MC-'+f.id)||null;
const crest=name=>`<span class="club-crest"><span class="crest-fallback">${esc((name||'?').split(' ').map(x=>x[0]).join('').slice(0,3).toUpperCase())}</span>${BADGES[name]?`<img src="${esc(BADGES[name])}" alt="${esc(name)} crest" loading="lazy" onload="this.previousElementSibling.style.display='none'" onerror="this.remove()">`:''}</span>`;
function fixtureMini(t){let f=fixtureFor(t),nm=t.name.split(/\s+vs\s+/i),home=t.homeTeam||f?.home||nm[0],away=t.awayTeam||f?.away||nm[1];return home&&away?`<div class="fixture-mini">${crest(home)}<span>${esc(home)}</span><span class="vstag">VS</span>${crest(away)}<span>${esc(away)}</span></div>`:`<span>${esc(t.name)}</span>`}
function matchHero(t){let f=fixtureFor(t);if(!f)return '';return `<section class="match-hero" aria-label="Match details"><div class="match-hero-meta">${esc(f.group)} · ${esc(f.id)}</div><div class="match-hero-body"><div class="match-club">${crest(f.home)}<h2>${esc(f.home)}</h2></div><div class="match-result"><span>2026 MESSI CUP</span><strong>${esc(f.score||'VS')}</strong><span>${esc(f.date)}</span></div><div class="match-club">${crest(f.away)}<h2>${esc(f.away)}</h2></div></div><div class="match-venue">${esc(f.venue)} <span>·</span> Match details are a public fixture snapshot, not live results</div></section>`}
const seed=()=>({
 users:[{id:'u_admin',name:'Operations Admin',email:'admin@demo.seebot.ai',password:'Demo1234!',role:'admin'},{id:'u_analyst',name:'Alex Morgan',email:'analyst@demo.seebot.ai',password:'Demo1234!',role:'analyst'},{id:'u_analyst2',name:'Jamie Cruz',email:'events@demo.seebot.ai',password:'Demo1234!',role:'analyst'}],
 sponsorGroups:[{id:'sg_main',name:'Main stadium sponsors',description:'Primary tournament and stadium placements',sponsors:[{id:'s_adidas',name:'Adidas x Messi',logo:'',color:'#10131c'},{id:'s_gatorade',name:'Gatorade',logo:'',color:'#ee6029'},{id:'s_panini',name:'Panini',logo:'',color:'#f4cd2d'},{id:'s_hardrock',name:'Hard Rock',logo:'',color:'#ba8d4b'}]},{id:'sg_side',name:'Sideline & secondary sponsors',description:'Pitchside, perimeter, and secondary brand placements',sponsors:[{id:'s_espn',name:'ESPN',logo:'',color:'#dd2525'},{id:'s_433',name:'433',logo:'',color:'#272637'},{id:'s_messif',name:'Messi Fragrances',logo:'',color:'#867ad7'},{id:'s_525',name:'525 Rosario',logo:'',color:'#3db5b1'}]}],
 eventGroups:[{id:'eg_basic',name:'Match moments',items:[{id:'e_goal',name:'Goal',kind:'range'},{id:'e_celebrate',name:'Goal celebration',kind:'range'},{id:'e_sub',name:'Substitution',kind:'range'},{id:'e_corner',name:'Corner',kind:'range'},{id:'e_replay',name:'Replay',kind:'range'}]}],
 cameraGroups:[{id:'cg_basic',name:'Broadcast camera angles',items:[{id:'c_center',name:'Wide · Center'},{id:'c_left',name:'Wide · Left goal'},{id:'c_right',name:'Wide · Right goal'},{id:'c_close',name:'Close-up / zoomed'},{id:'c_crowd',name:'Crowd / stands'},{id:'c_bench',name:'Bench / sideline'},{id:'c_replay',name:'Replay angle'}]}],
 tasks:[{id:'task_demo1',number:'M13',name:'River Plate vs AFC Ajax',date:'2026-10-26',fixtureId:'M13',duration:3600,videoType:'none',videoUrl:'',videoName:'',sponsorGroupIds:['sg_main','sg_side'],eventGroupIds:['eg_basic'],cameraGroupIds:['cg_basic'],sponsorAnalystId:'u_analyst',contextAnalystId:'u_analyst',sponsors:[],events:[],cameras:[],submitted:{sponsors:false,context:false},demo:true,createdAt:tstamp()},{id:'task_demo2',number:'M29',name:'River Plate vs CR Flamengo',date:'2026-10-28',fixtureId:'M29',duration:3600,videoType:'none',videoUrl:'',videoName:'',sponsorGroupIds:['sg_main'],eventGroupIds:['eg_basic'],cameraGroupIds:['cg_basic'],sponsorAnalystId:'u_analyst',contextAnalystId:'u_analyst2',sponsors:[],events:[],cameras:[],submitted:{sponsors:false,context:false},demo:true,createdAt:tstamp()},{id:'task_demo3',number:'M30',name:'Atlético de Madrid vs FC Barcelona',date:'2026-10-28',fixtureId:'M30',duration:3600,videoType:'none',videoUrl:'',videoName:'',sponsorGroupIds:['sg_main','sg_side'],eventGroupIds:['eg_basic'],cameraGroupIds:['cg_basic'],sponsorAnalystId:'u_analyst2',contextAnalystId:'u_analyst',sponsors:[],events:[],cameras:[],submitted:{sponsors:false,context:false},demo:true,createdAt:tstamp()}]
});
const memoryStore={};const safeStorage=(type)=>({getItem(k){try{return window[type].getItem(k)}catch(e){return memoryStore[type+':'+k]??null}},setItem(k,v){try{window[type].setItem(k,String(v))}catch(e){memoryStore[type+':'+k]=String(v)}},removeItem(k){try{window[type].removeItem(k)}catch(e){delete memoryStore[type+':'+k]}}});const local=safeStorage('localStorage'),session=safeStorage('sessionStorage');
let db;try{db=JSON.parse(local.getItem(DBKEY))||seed()}catch(e){db=seed()};
let fixtureSyncLabel='Bundled schedule';let fixtureDay='all';
// Existing demos may contain point-configured event attributes. Preserve recorded history,
// but convert attribute definitions to duration tagging for all future annotations.
for(const group of db.eventGroups||[])for(const item of group.items||[])item.kind='range';
const save=()=>{try{local.setItem(DBKEY,JSON.stringify(db))}catch(e){/* In-memory demonstration still works when storage is restricted. */}};
save();let logged=(()=>{try{return session.getItem(SESSION)||''}catch(e){return ''}})(),view='dashboard',selectedTaskId='',reportTaskId='',studioTab='all',taskFilter='all',insightFocusId='',tick=0,seekStep=5,localVideos={},videoEl=null,forgot=false,modalOpen=false;
const me=()=>db.users.find(x=>x.id===logged);const currentTask=()=>db.tasks.find(x=>x.id===selectedTaskId);const reportTask=()=>db.tasks.find(x=>x.id===reportTaskId)||db.tasks[0];const visibleTasks=()=>me()?.role==='admin'?db.tasks:db.tasks.filter(t=>t.sponsorAnalystId===logged||t.contextAnalystId===logged);
const taskStatus=t=>t.submitted?.sponsors&&t.submitted?.context?'done':t.sponsors.length||t.events.length||t.cameras.length||t.submitted?.sponsors||t.submitted?.context?'progress':'ready';
const statusHTML=t=>{let s=taskStatus(t);return `<span class="status ${s}">${s==='done'?'Completed':s==='progress'?'In progress':'Ready to tag'}</span>`};
const foundUser=id=>db.users.find(u=>u.id===id);const nameUser=id=>foundUser(id)?.name||'Unassigned';
const allowed=(t,kind)=>me()?.role==='admin'||((kind==='sponsors'?t.sponsorAnalystId:t.contextAnalystId)===logged);
const canEdit=(t,kind)=>allowed(t,kind)&&!(t.submitted?.[kind]);
const sponsorFor=t=>db.sponsorGroups.filter(g=>t.sponsorGroupIds.includes(g.id)).flatMap(g=>g.sponsors.map(s=>({...s,groupName:g.name}))).filter((s,i,a)=>a.findIndex(v=>v.id===s.id)===i);
const eventsFor=t=>db.eventGroups.filter(g=>t.eventGroupIds.includes(g.id)).flatMap(g=>g.items);
const camerasFor=t=>db.cameraGroups.filter(g=>t.cameraGroupIds.includes(g.id)).flatMap(g=>g.items);
const labelFor=(t,type,id)=>({sponsors:sponsorFor(t),events:eventsFor(t),cameras:camerasFor(t)})[type].find(i=>i.id===id)?.name||id;
// Each presence interval has one optional primary placement and one optional visibility-quality rating.
// Unclassified intervals stay unclassified; do not infer placement or readability from sponsor identity.
const PLACEMENT_TYPES=[
 ['led','LED / DIGITAL BOARD'],['static','STATIC PITCHSIDE BOARD'],
 ['jersey','JERSEY / KIT'],['backdrop','BACKDROP / INTERVIEW'],
 ['stadium','STADIUM SIGNAGE'],['graphic','BROADCAST GRAPHIC'],['other','OTHER PLACEMENT']
];
const VISIBILITY_QUALITIES=[
 ['clear','CLEAR / READABLE'],['partial','PARTIALLY READABLE'],['obscured','OBSCURED / NOT READABLE']
];
const attributeOptions=(data,value)=>'<option value="">NOT CLASSIFIED</option>'+data.map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join('');
const taggedSpanSeconds=(x,endpoint)=>Math.max(0,(x.end==null?endpoint:x.end)-x.start);
const clipOverlap=overlap;
const seconds=t=>clamp(tick,0,t.duration||3600);
function intervals(arr,key,id,end){return arr.filter(x=>x[key]===id).map(x=>({start:x.start,end:x.end==null?end:x.end})).filter(x=>x.end>x.start)}
function durationFor(t,id){return merged(intervals(t.sponsors,'sponsorId',id,t.observedTime||0)).reduce((n,x)=>n+x.end-x.start,0)}
function sponsorVisibleAt(t,id,time){return t.sponsors.some(x=>x.sponsorId===id&&x.start<=time&&(x.end==null||time<x.end))}
function sponsorsAt(t,time){return sponsorFor(t).filter(s=>sponsorVisibleAt(t,s.id,time))}
function getEvents(t){return t.events.slice().sort((a,b)=>a.start-b.start)}
function sponsorOnEvent(t,sponsorId,e){let spans=intervals(t.sponsors,'sponsorId',sponsorId,t.observedTime||0);if(e.kind==='point'&&e.end===e.start)return spans.some(x=>e.start>=x.start&&e.start<x.end);return spans.some(x=>overlap(x,{start:e.start,end:e.end==null?Math.max(e.start,t.observedTime||0):e.end})>0)}
function metrics(t){let ss=sponsorFor(t);let rows=ss.map(s=>({...s,sec:durationFor(t,s.id),appearances:t.sponsors.filter(x=>x.sponsorId===s.id).length,eventHits:t.events.filter(e=>sponsorOnEvent(t,s.id,e)).length})).sort((a,b)=>b.sec-a.sec);return {rows,total:rows.reduce((v,r)=>v+r.sec,0),recorded:rows.filter(x=>x.sec>0).length,exposures:t.sponsors.length,events:t.events.length}}
const logo=(s,size='')=>`<div class="tinylogo ${size}" style="${s.logo?'':'background:'+esc(s.color||'#f2eff8')+'25;color:'+esc(s.color||'#665b87')}">${s.logo?`<img src="${esc(s.logo)}" alt="">`:esc((s.name||'?').split(' ').map(x=>x[0]).join('').slice(0,3).toUpperCase())}</div>`;
function notify(m){let x=document.getElementById('toast');x.textContent=m;x.classList.remove('hidden');clearTimeout(notify.t);notify.t=setTimeout(()=>x.classList.add('hidden'),3200)}
let pendingInAppConfirm=null;
function openModal(title,body,footer='',wide=false){modalOpen=true;document.getElementById('legacy-screen').insertAdjacentHTML('beforeend',`<div class="overlay" id="modal" onclick="if(event.target===this)closeModal()"><div class="modal" style="${wide?'width:min(860px,100%)':''}"><div class="modalhead"><div><div class="eyebrow">SPONSOR INTELLIGENCE</div><h2>${title}</h2></div><button class="button ghost icononly" onclick="closeModal()">${icons('close')}</button></div><div class="modalbody">${body}</div>${footer?`<div class="modalfoot">${footer}</div>`:''}</div></div>`)}
window.closeModal=()=>{document.getElementById('modal')?.remove();modalOpen=false;pendingInAppConfirm=null};
function confirmInApp(title,message,onAccept,{actionLabel='REMOVE',danger=true}={}){
 if(typeof onAccept!=='function')return;
 if(modalOpen)return notify('Close the current dialog first.');
 pendingInAppConfirm=onAccept;
 const body=`<p class="confirm-message">${esc(message)}</p>`;
 const footer=`<button type="button" class="button ghost" onclick="closeModal()">CANCEL</button>
 <button type="button" class="button ${danger?'confirm-danger':'primary'}" onclick="acceptInAppConfirm()">${esc(actionLabel)}</button>`;
 openModal(esc(title),body,footer);
 document.querySelector('#modal .modalfoot .button.ghost')?.focus();
}
window.acceptInAppConfirm=()=>{
 const action=pendingInAppConfirm;
 if(!action)return;
 closeModal();
 action();
};
const formVal=(id)=>document.getElementById(id)?.value||'';
function layout(title,subtitle,body,extra=''){let user=me(),isAdmin=user.role==='admin';
if(view==='studio'){
 return `<div class="app app-focus"><header class="focusbar"><div class="identity-lockup"><button type="button" class="focusbrand brand-home" onclick="navigate('dashboard')" aria-label="Go to Sponsor Studio dashboard" title="Back to dashboard"><img src="assets/mc26-wordmark.svg" alt="Messi Cup 26"></button><span class="powered-by"><span>POWERED BY</span><img src="assets/seebot-wordmark-orange-20261029.svg" alt="Seebot" loading="eager"></span></div><div class="focusactions"><button class="button ghost" onclick="showReport('${esc(selectedTaskId)}')">${icons('chart')} INSIGHTS</button><button class="button ghost" onclick="logout()">SIGN OUT</button></div></header><main class="focuscontent">${body}</main></div>`;
}let nav=[['dashboard','Overview','grid'],['tasks','Matches','video'],['reports','Insights','chart'],...(isAdmin?[['sponsors','Sponsors','tags'],['attributes','Attributes','settings'],['users','Team','users']]:[])];return `<div class="app"><header class="ops-header"><div class="ops-head-first"><div class="identity-lockup"><button type="button" class="ops-brand brand-home" onclick="navigate('dashboard')" aria-label="Go to Sponsor Studio dashboard" title="Back to dashboard"><img src="assets/mc26-wordmark.svg" alt="MESSI CUP 26"></button><span class="powered-by"><span>POWERED BY</span><img src="assets/seebot-wordmark-orange-20261029.svg" alt="Seebot" loading="eager"></span></div><div class="ops-year">● 2026 TOURNAMENT <i></i> OCT 25 – NOV 1</div><div class="ops-user"><span>${esc(user.name)} <small>/ ${user.role.toUpperCase()}</small></span><button onclick="logout()" aria-label="Sign out">${icons('logout')} SIGN OUT</button></div></div><nav class="ops-nav" aria-label="Main navigation"><div class="ops-nav-items">${nav.map(n=>`<button class="nav ${view===n[0]?'active':''}" onclick="navigate('${n[0]}')">${icons(n[2])}${esc(n[1])}</button>`).join('')}</div><span class="ops-global-tag">16 CLUBS. ONE GLOBAL STAGE.</span></nav></header><main class="content">${body}</main></div>`}
function loginView(){return `<div class="login-page"><header class="login-top"><div class="identity-lockup"><img src="assets/mc26-wordmark.svg" alt="Messi Cup 2026"><span class="powered-by"><span>POWERED BY</span><img src="assets/seebot-wordmark-orange-20261029.svg" alt="Seebot" loading="eager"></span></div><span>2026 TOURNAMENT <b>·</b> OCT 25 – NOV 1</span></header><main class="login-central"><img class="login-wordmark" src="assets/mc26-wordmark.svg" alt="Messi Cup 2026"><div class="login-kicker">SPONSOR INTELLIGENCE / MATCH OPERATIONS</div><h1>${forgot?'RESET DEMO ACCESS':'SIGN IN.'}</h1><p>${forgot?'For this demonstration, change a local demo account password. Production email recovery requires a server.':'Access your assigned matches, track sponsor visibility, and analyze key broadcast moments.'}</p><form id="signInForm" class="loginform"><div class="field"><label for="loginemail">EMAIL ADDRESS</label><input id="loginemail" name="email" type="email" placeholder="name@organization.com" autocomplete="username" required></div>${forgot?`<div class="field"><label for="newpwd">NEW DEMO PASSWORD</label><input id="newpwd" type="password" minlength="8" placeholder="Minimum 8 characters" autocomplete="new-password" required></div>`:`<div class="field"><div class="row between"><label for="loginpass">PASSWORD</label><a href="#" onclick="event.preventDefault();toggleForgot(true)">Forgot password?</a></div><input id="loginpass" name="password" type="password" placeholder="Enter password" autocomplete="current-password" required></div>`}<div id="authError" role="alert" aria-live="polite" class="auth-error"></div><button class="button primary auth-submit" type="submit">${forgot?'RESET PASSWORD':'SIGN IN'} ${icons('arrow')}</button>${forgot?`<button type="button" class="button ghost auth-back" onclick="toggleForgot(false)">BACK TO SIGN IN</button>`:''}</form><div class="demo-line"><span>DEMO ACCESS</span><span>NO LIVE USER ACCOUNTS CONNECTED</span></div><div class="demo-roles"><button type="button" onclick="fillDemo('admin@demo.seebot.ai')">USE ADMIN ACCOUNT</button><button type="button" onclick="fillDemo('analyst@demo.seebot.ai')">USE ANALYST ACCOUNT</button><button type="button" onclick="fillDemo('events@demo.seebot.ai')">EVENTS ANALYST</button></div><p class="demo-password"><span class="demo-password-hint">Demo password: <code>Demo1234!</code></span><button type="button" onclick="resetDemoData()">RESET DEMO</button></p></main><footer class="login-footer"><span>MESSI CUP 26' / SPONSOR INTELLIGENCE</span><span>LOCAL PROTOTYPE · NOT PRODUCTION AUTHENTICATION</span></footer></div>`;}
window.fillDemo=email=>{document.getElementById('loginemail').value=email;if(document.getElementById('loginpass'))document.getElementById('loginpass').value='Demo1234!'};
window.toggleForgot=b=>{forgot=b;render()};
window.login=e=>{e.preventDefault();let email=formVal('loginemail').trim().toLowerCase(),pwd=formVal('loginpass');let u=db.users.find(x=>x.email.toLowerCase()===email&&x.password===pwd);if(!u){let err=document.getElementById('authError');if(err)err.textContent='Incorrect demo email or password. Select a sample account or restore demo accounts below.';return}logged=u.id;session.setItem(SESSION,logged);view='dashboard';render()};
window.resetDemo=e=>{e.preventDefault();let u=db.users.find(x=>x.email.toLowerCase()===formVal('loginemail').trim().toLowerCase());if(!u){document.getElementById('authError').textContent='No demo account found for that email.';return}u.password=formVal('newpwd');save();forgot=false;render();notify('Demo-only password changed. This does not send an email.')};
window.resetDemoData=()=>confirmInApp('Reset demo workspace','Restore all demo accounts and tasks in this browser? Existing demo annotations will be discarded.',()=>{db=seed();save();logged='';session.removeItem(SESSION);forgot=false;view='dashboard';render();notify('Demo accounts restored. Choose an account to sign in.');},{actionLabel:'RESET DEMO'});
window.logout=()=>{logged='';session.removeItem(SESSION);selectedTaskId='';if(videoEl){videoEl.pause()}render()};
window.navigate=(v)=>{view=v;if(videoEl){videoEl.pause()}selectedTaskId='';render();window.scrollTo(0,0)};
window.closeTaskMenu=()=>{const menu=document.getElementById('taskActionMenu');if(menu)menu.open=false};
window.openTask=id=>{selectedTaskId=id;view='studio';tick=0;studioTab='all';render();window.scrollTo(0,0)};
function dashboard(){const ts=visibleTasks(),done=ts.filter(t=>taskStatus(t)==='done').length,progress=ts.filter(t=>taskStatus(t)==='progress').length,logs=ts.reduce((v,t)=>v+t.sponsors.length+t.events.length+t.cameras.length,0);return `<div class="dashboard-banner"><div class="dashboard-banner-copy"><span class="banner-kicker">OFFICIAL MESSI CUP 2026 / MATCH OPERATIONS</span><strong>Every second of visibility matters.</strong><p>${OFFICIAL_FIXTURES.length} published fixtures · Build your analysis queue from the match catalog.</p></div><button class="dashboard-banner-action" onclick="navigate('tasks')">OPEN MATCH CATALOG ${icons('arrow')}</button></div><div class="pagehead"><div><div class="eyebrow">TOURNAMENT / ANALYST WORKSPACE</div><h1>Workspace<span style="color:var(--orange)">.</span></h1><p class="sub">Track broadcast visibility, match moments, and sponsor intelligence.</p></div>${me().role==='admin'?`<button class="button primary" onclick="createTaskModal()">${icons('plus')} Create a match</button>`:''}</div><div class="stats">${[['video',ts.length,'Assigned matches'],['clock',progress,'In progress'],['check',done,'Completed matches'],['tags',logs,'Recorded annotations']].map(x=>`<div class="card statcard"><div class="statghost"></div><div class="staticon">${icons(x[0])}</div><div class="svalue">${x[1]}</div><div class="slabel">${x[2]}</div></div>`).join('')}</div><div class="layout2"><div class="card cardpad"><div class="sectionhead"><div><h2>Recent match assignments</h2><p class="sub">Select a match to start tagging or review its progress</p></div><button class="textlink" onclick="navigate('tasks')">View all ${icons('arrow')}</button></div>${ts.length?ts.slice().reverse().slice(0,5).map((t,i)=>`<div class="taskrow" onclick="openTask('${t.id}')"><div class="taskbadge ${i%2?'blue':''}">MC<span style="font-size:8px">${i+1}</span></div><div class="info"><strong>${fixtureMini(t)}</strong><span>${esc(t.number)} · ${fmt(t.duration)} footage · ${t.sponsorGroupIds.length} sponsor lists</span></div>${statusHTML(t)}${icons('chevron')}</div>`).join(''):'<div class="empty"><strong>No assigned matches yet</strong><p>Matches appear after an administrator assigns them to you.</p></div>'}</div><div><div class="callout"><div class="eyebrow" style="color:#74d9fc">INSIGHT ENGINE</div><h3>Tag once. Understand every moment.</h3><p>Every visibility interval can be combined with goals, replays and camera context.</p><button class="button" onclick="navigate('reports')">Explore insights ${icons('arrow')}</button></div><div class="smalltiles"><div class="smalltile"><b>${db.sponsorGroups.reduce((n,g)=>n+g.sponsors.length,0)}</b><span>Brands in library</span></div><div class="smalltile"><b>${db.eventGroups.reduce((n,g)=>n+g.items.length,0)}</b><span>Event tag types</span></div></div></div></div><div class="card cardpad"><div class="sectionhead"><h2>Production queue</h2><span class="tag">${ts.length} matches</span></div>${taskTable(ts)}</div>`}
function taskTable(ts){if(!ts.length)return '<div class="empty"><strong>No tasks available</strong><p>Ask your administrator to assign a match.</p></div>';return `<div class="tablewrap"><table class="table"><thead><tr><th>Match</th><th>Assigned sponsor analyst</th><th>Events / camera analyst</th><th>Annotations</th><th>Status</th><th></th></tr></thead><tbody>${ts.map(t=>`<tr class="clickable" onclick="openTask('${t.id}')"><td><div class="mainname">${fixtureMini(t)}</div><div class="detail">${esc(t.number)} · ${esc(t.date||'No date')} ${t.demo?'· Sample task':''}</div></td><td>${esc(nameUser(t.sponsorAnalystId))}</td><td>${esc(nameUser(t.contextAnalystId))}</td><td>${t.sponsors.length+t.events.length+t.cameras.length} logs</td><td>${statusHTML(t)}</td><td>${icons('chevron')}</td></tr>`).join('')}</tbody></table></div>`}
function matchTiles(ts){
 if(!ts.length)return '<div class="empty"><strong>No tasks available</strong><p>Ask your administrator to assign a match or create a new task.</p></div>';
 return `<div class="match-tile-grid">${ts.map(t=>`<button type="button" class="match-tile" onclick="openTask('${t.id}')" aria-label="Open ${esc(t.name)}">
  <div class="match-tile-head"><span class="match-tile-code">${esc(t.number)} · ${esc(t.date||'DATE TBD')}</span>${statusHTML(t)}</div>
  <div class="match-tile-match">${fixtureMini(t)}</div>
  <div class="match-tile-foot"><div class="match-tile-person">SPONSORS: ${esc(nameUser(t.sponsorAnalystId))}<div>EVENTS: ${esc(nameUser(t.contextAnalystId))}</div></div><span class="match-tile-arrow">${icons('arrow')}</span></div>
 </button>`).join('')}</div>`;
}
function tasksView(){let ts=visibleTasks().filter(t=>taskFilter==='all'||taskStatus(t)===taskFilter);return `<div class="pagehead"><div><div class="eyebrow">PRODUCTION / ALL MATCHES</div><h1>Match assignments</h1><p class="sub">Only matches assigned to your account are visible to you.</p></div>${me().role==='admin'?`<button class="button primary" onclick="createTaskModal()">${icons('plus')} New task</button>`:''}</div><div class="filterbar">${[['all','All matches'],['ready','Ready'],['progress','In progress'],['done','Completed']].map(p=>`<button class="chip ${taskFilter===p[0]?'active':''}" onclick="setFilter('${p[0]}')">${p[1]}</button>`).join('')}</div>${matchTiles(ts)}${me().role==='admin'?fixtureCatalog():''}`}
function fixtureCatalog(){
 const byDay=[...new Set(OFFICIAL_FIXTURES.map(f=>f.date))].sort();
 const visible=OFFICIAL_FIXTURES.filter(f=>fixtureDay==='all'||f.date===fixtureDay)
  .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||(a.order||0)-(b.order||0));
 const catalogCards=visible.map(f=>{
  const task=taskForFixture(f.id);
  const status=task?taskStatus(task):'uncreated';
  const actionLabel=status==='done'?'✓ COMPLETED':task?'OPEN TASK →':'CREATE TASK +';
  const statusLabel=status==='done'?'COMPLETED':status==='progress'?'IN PROGRESS':status==='ready'?'READY TO TAG':'NOT CREATED';
  const actionTitle=status==='done'?'Review completed annotation work':task?'Open existing annotation task':'Create an annotation task';
  const streams=task&&task.submitted?.sponsors!==task.submitted?.context?
   `<div class="fixture-stream-note">${task.submitted?.sponsors?'Sponsor tagging complete · Events & camera pending':'Events & camera complete · Sponsor tagging pending'}</div>`:'';
  return `<article class="fixture-card fixture-task-${status}" data-fixture-id="${esc(f.id)}">
   <div class="fixture-date">${esc(f.id)} · ${esc(f.date)} · ${esc(f.time||'Time TBD')} ET <span>${esc(f.stage||f.group||'')}</span></div>
   <div class="fixture-task-state ${status}">${statusLabel}</div>
   <div class="fixture-line">${crest(f.home)}<b>${esc(f.home)}</b><strong>${esc(f.score||'VS')}</strong><b>${esc(f.away)}</b>${crest(f.away)}</div>
   ${streams}
   <div class="fixture-bottom"><span>${esc(f.venue||'Venue TBD')} · ${esc(f.status||'Scheduled')}</span>
    <button class="button tiny fixture-task-action ${status==='done'?'fixture-completed':'ghost'}" title="${actionTitle}" aria-label="${actionTitle} for ${esc(f.id)}" onclick="openFixtureTask('${esc(f.id)}')">${actionLabel}</button>
   </div></article>`;
 }).join('');
 return `<section class="fixture-catalog"><div class="sectionhead"><div><div class="eyebrow">SCHEDULE / LIVE DATA SNAPSHOT</div>
 <h2>MATCH CATALOG</h2>
 <p class="sub">Published fixture schedule with live annotation-task status. Completed matches are ready to review; existing tasks open directly without creating duplicates. Times shown in Eastern Time (ET).</p>
 </div><span class="tag">${esc(fixtureSyncLabel)} · ${OFFICIAL_FIXTURES.length} matches</span></div>
 <div class="fixture-days"><button class="chip ${fixtureDay==='all'?'active':''}" onclick="chooseFixtureDay('all')">ALL DAYS</button>${byDay.map(d=>`<button class="chip ${fixtureDay===d?'active':''}" onclick="chooseFixtureDay('${d}')">${esc(d)}</button>`).join('')}</div>
 <div class="fixture-cards">${catalogCards||'<p class="muted">No published matches on this date.</p>'}</div></section>`;
}
window.setFilter=s=>{taskFilter=s;render()};
function studio(){let t=currentTask();if(!t)return dashboard();const allS=sponsorFor(t),allE=eventsFor(t),allC=camerasFor(t);let activeS=allS.filter(s=>t.sponsors.some(x=>x.sponsorId===s.id&&x.end==null));let activeE=allE.filter(e=>t.events.some(x=>x.eventId===e.id&&x.end==null));let activeC=t.cameras.find(x=>x.end==null);let useVideo=localVideos[t.id]||(t.videoType==='https'&&t.videoUrl? t.videoUrl:null);let isLocalVideo=!!localVideos[t.id];let allowS=canEdit(t,'sponsors'),allowC=canEdit(t,'context');return `<div class="studio-head"><div class="row between studio-title-layout"><div><div class="eyebrow">ANNOTATION STUDIO / ${esc(t.number)}</div><h1>${esc(t.name)}</h1><div class="studio-meta">${statusHTML(t)} <span>${esc(t.date||'Date not specified')}</span><span>·</span><span>${fmt(t.duration)} expected video length</span><span>·</span><span>Sponsors: ${esc(nameUser(t.sponsorAnalystId))}</span><span>·</span><span>Context: ${esc(nameUser(t.contextAnalystId))}</span></div></div><div class="task-actions-dropdown"><details class="task-actions" id="taskActionMenu"><summary aria-label="Task actions"><span>ACTIONS</span><span class="menu-glyph" aria-hidden="true">⋯</span></summary><div class="task-menu-content">
<button type="button" onclick="closeTaskMenu();chooseVideo()">${icons('video')} OPEN LOCAL VIDEO</button>
<button type="button" onclick="closeTaskMenu();exportTask('${t.id}')">${icons('download')} EXPORT JSON</button>
<button type="button" class="task-menu-complete" onclick="closeTaskMenu();submitMyTask()">${icons('check')} MARK COMPLETE</button>
${me().role==='admin'?`<button type="button" onclick="closeTaskMenu();assignTaskModal('${t.id}')">${icons('users')} ASSIGN TASK</button><button type="button" onclick="closeTaskMenu();addSponsorToCurrentTask()">${icons('plus')} ADD SPONSOR / LOGO</button><button type="button" onclick="closeTaskMenu();createTaskModal('${t.id}')">${icons('settings')} EDIT TASK</button>${t.submitted?.sponsors&&t.submitted?.context?`<button type="button" onclick="closeTaskMenu();reopenTask()">REOPEN ANNOTATION STREAMS</button>`:''}`:''}
<div class="task-menu-separator"></div>
<button type="button" onclick="closeTaskMenu();navigate('tasks')">← ALL TASKS</button>
</div></details></div></div></div><div class="studio-grid"><div class="studio-media-column" role="region" aria-label="Video, annotation tools, and recorded actions" tabindex="0"><div class="video-box"><div class="video-header"><span>LIVE TAGGING CONSOLE</span><span id="videoSourceState">${isLocalVideo?'LOCAL VIDEO · NOT UPLOADED':t.videoType==='ftp'?'FTP LINK · INGEST REQUIRED':useVideo?'HTTPS VIDEO':t.videoName?'LOCAL FILE DISCONNECTED':'NO VIDEO ATTACHED'}</span></div><div id="videoFileStatus" class="video-source-note" role="status" aria-live="polite">${isLocalVideo?'OPENED LOCALLY: '+esc(t.videoName||'Video file')+' · Not uploaded, saved, or shared with other devices.':!useVideo&&t.videoName?'Previously selected: '+esc(t.videoName)+' · Reopen this local video after refreshing or reopening the browser.':'Choose a video on this device or configure a direct HTTPS source. Local video is never uploaded to the server.'}</div><div class="vidframe ${useVideo?'video-native-frame':''}">${useVideo?`<video id="matchVideo" preload="metadata" playsinline controls aria-label="Match video · original proportions" src="${esc(useVideo)}"></video>`:`<div class="fakepitch"><div class="field"></div><div class="video-stamp">MESSI CUP · ${esc(t.number)}</div><strong>${t.videoName?'Reconnect your footage.':'Ready for kickoff.'}</strong><p>${t.videoName?'Your earlier local file is not available in this browser session.':'Open a video on this device to begin frame-accurate tagging.'}</p><button class="button primary tiny" onclick="chooseVideo()">${icons('video')} ${t.videoName?'REOPEN LOCAL VIDEO':'OPEN LOCAL VIDEO'}</button></div>`}</div><div class="video-controls"><button onclick="togglePlay()" title="Play / Pause" id="playbutton">${icons('play')}</button><button onclick="skipByStep(-1)" aria-label="Seek backward" title="Seek backward"><span class="skip-number" id="skipBack">−5s</span></button><input class="seek" id="seek" aria-label="Video timestamp" type="range" min="0" max="${t.duration}" value="${tick}" step="0.1" oninput="seekVideo(this.value)"><button onclick="skipByStep(1)" aria-label="Seek forward" title="Seek forward"><span class="skip-number" id="skipForward">+5s</span></button><span class="vidtime" id="vidtime">${fmt(tick)} / ${fmt(t.duration)}</span><div class="skip-setting" role="group" aria-label="Seek step"><span>STEP</span><button class="active" id="seekstep-5" onclick="setSeekStep(5)" aria-pressed="true">5 SEC</button><button id="seekstep-10" onclick="setSeekStep(10)" aria-pressed="false">10 SEC</button></div><button class="rate" onclick="cycleRate()" id="rateButton">1×</button></div></div><div class="card cardpad studio-maincard"><div class="tag-toolbar"><div><h2>Fast-tag controls</h2><p class="sub">Events and camera angles are timed intervals. Tap once to start, again to stop; switching cameras closes the previous view.</p></div><div class="segmented"><button type="button" data-studio-tab="all" aria-pressed="${studioTab==='all'}" class="${studioTab==='all'?'on':''}" onclick="setStudioTab('all')">All</button><button type="button" data-studio-tab="sponsors" aria-pressed="${studioTab==='sponsors'}" class="${studioTab==='sponsors'?'on':''}" onclick="setStudioTab('sponsors')">Sponsors</button><button type="button" data-studio-tab="events" aria-pressed="${studioTab==='events'}" class="${studioTab==='events'?'on':''}" onclick="setStudioTab('events')">Events</button><button type="button" data-studio-tab="cameras" aria-pressed="${studioTab==='cameras'}" class="${studioTab==='cameras'?'on':''}" onclick="setStudioTab('cameras')">Camera</button></div></div><div class="contextline">${icons('clock')} Current video timestamp <b id="currentT">${fmt(tick)}</b> <span style="margin-left:auto">${allowS?'Sponsor tagging enabled':'Sponsor tagging view only'} · ${allowC?'Context tagging enabled':'Context view only'}</span></div><div id="controlsBody">${controlsHTML(t)}</div><div class="tline-wrap"><div class="sectionhead"><div><h3>Unified match timeline</h3><p class="sub">One shared time axis · switch visible layers using the controls above</p></div><div class="tline-legend"><span><i class="key" style="background:#ff9b36"></i>Sponsors</span><span><i class="key" style="background:#d7c7b5"></i>Events</span><span><i class="key" style="background:#9cabb0"></i>Cameras</span></div></div><div id="timelineBody">${timelineHTML(t)}</div></div></div><div class="card cardpad" style="margin-top:17px"><div class="sectionhead"><h2>Recorded actions</h2><span class="tag" id="logcount">${t.sponsors.length+t.events.length+t.cameras.length} logs</span></div><div id="logBody">${logsHTML(t)}</div></div></div><aside class="sponsor-rail" aria-label="${studioSidebarHeading().title} tagging panel" tabindex="0"><div class="rail-compact-heading"><h2 id="railTagTitle">${studioSidebarHeading().title}</h2><p id="railTagHint">${studioSidebarHeading().hint}</p></div><div id="sponsorRail" class="rail-scroll">${sponsorRailHTML(t)}</div></aside></div>`}
function studioSidebarHeading(){
 if(studioTab==='events')return {title:'KEY MATCH EVENTS',hint:'Tap a match event to start an interval. Tap again to stop it.'};
 if(studioTab==='cameras')return {title:'CAMERA ANGLES',hint:'Tap to begin a view. Switching angles ends the previous one.'};
 return {title:'SPONSORS',hint:'Tap a sponsor to switch between OFF and LIVE.'};
}
function eventTagButtons(t){
 const canTag=canEdit(t,'context');
 return eventsFor(t).map(ev=>{
  const active=t.events.some(a=>a.eventId===ev.id&&a.end==null);
  return `<button class="event-chip tagged-state-chip ${active?'active':''}" type="button" onclick="tagEvent('${esc(ev.id)}')" ${canTag?'':'disabled'} aria-pressed="${active}" aria-label="${esc(ev.name)} · ${active?'LIVE, tap to end':'OFF, tap to start'}" title="${esc(ev.name)} · ${active?'LIVE':'OFF'}"><span class="chip-symbol">↔</span><span class="chip-label">${esc(ev.name)}</span><span class="tag-live-pill ${active?'on':'off'}" aria-hidden="true">${active?'● LIVE':'● OFF'}</span></button>`;
 }).join('');
}
function cameraTagButtons(t){
 const canTag=canEdit(t,'context');
 return camerasFor(t).map(cam=>{
  const active=t.cameras.some(a=>a.cameraId===cam.id&&a.end==null);
  return `<button class="event-chip camera-chip tagged-state-chip ${active?'active':''}" type="button" onclick="tagCamera('${esc(cam.id)}')" ${canTag?'':'disabled'} aria-pressed="${active}" aria-label="${esc(cam.name)} · ${active?'LIVE, tap to end':'OFF, tap to start or switch'}" title="${esc(cam.name)} · ${active?'LIVE':'OFF'}"><span class="chip-symbol">◎</span><span class="chip-label">${esc(cam.name)}</span><span class="tag-live-pill ${active?'on':'off'}" aria-hidden="true">${active?'● LIVE':'● OFF'}</span></button>`;
 }).join('');
}
function sponsorRailHTML(t){
 if(studioTab==='events')return `<div class="side-tag-list">${eventTagButtons(t)||'<span class="rail-empty">No key event tags assigned to this match.</span>'}</div>`;
 if(studioTab==='cameras')return `<div class="side-tag-list">${cameraTagButtons(t)||'<span class="rail-empty">No camera angles assigned to this match.</span>'}</div>`;
 const sponsors=sponsorFor(t),canTag=canEdit(t,'sponsors');
 if(!sponsors.length)return '<div class="rail-empty">No sponsors assigned to this match.</div>';
 return `<div class="rail-cards">${sponsors.map(sp=>{
  const active=t.sponsors.some(row=>row.sponsorId===sp.id&&row.end==null);
  return `<button class="rail-brand ${active?'isactive':''}" type="button"
  onclick="tagSponsor('${esc(sp.id)}')" ${canTag?'':'disabled'}
  aria-label="${esc(sp.name)} · ${active?'LIVE, click to stop':'OFF, click to start'}"
  aria-pressed="${active}" title="${esc(sp.name)} · ${active?'LIVE':'OFF'}">
  <span class="rail-logo">${logo(sp)}</span>
  <span class="rail-live-pill ${active?'on':'off'}" aria-hidden="true">${active?'● LIVE':'● OFF'}</span>
  </button>`;
 }).join('')}</div>`;
}
function controlsHTML(t){
 const chips=eventTagButtons(t),angles=cameraTagButtons(t);
 const eventSection=`<section class="studio-chip-group"><div class="chip-group-title"><span>KEY MATCH EVENTS</span><small>TAP TO START · TAP AGAIN TO END</small></div><div class="event-chip-row">${chips||'<span class="small muted">No match events assigned</span>'}</div></section>`;
 const cameraSection=`<section class="studio-chip-group"><div class="chip-group-title"><span>CAMERA ANGLES</span><small>TAP AGAIN TO END · SWITCH TO CLOSE PREVIOUS</small></div><div class="event-chip-row">${angles||'<span class="small muted">No camera angles assigned</span>'}</div></section>`;
 if(studioTab==='events')return '<div class="studio-layer-hint">Key match event buttons are in the right panel. Select an event there to start or end its interval; the timeline below displays event annotations.</div>';
 if(studioTab==='cameras')return '<div class="studio-layer-hint">Camera-angle buttons are in the right panel. Select an angle there to begin or end its interval; switching cameras closes the previous view.</div>';
 if(studioTab==='sponsors')return '<div class="studio-layer-hint">Select sponsor logos from the right-hand SPONSORS panel. The timeline below shows sponsor visibility only.</div>';
 return eventSection+cameraSection;
}
function timelineHTML(t){let dur=t.duration||3600,now=tick;const track=(name,items,type,point=false)=>`<div class="trackrow"><span class="trackname" title="${esc(name)}">${esc(name)}</span><div class="track" onclick="seekFromTrack(event,this)">${items.map(x=>{let left=100*clamp(x.start,0,dur)/dur,right=100*clamp(x.end==null?Math.max(x.start,t.observedTime||0,tick):x.end,0,dur)/dur;return `<span title="${esc(name)}: ${fmt(x.start)}${point?'':' – '+fmt(x.end==null?now:x.end)}" class="block ${type} ${x.end==null?'open':''} ${point?'dotpoint':''}" style="left:${left}%;width:${point?'.15':Math.max(.15,right-left)}%"></span>`}).join('')}<span class="playhead" style="left:${100*now/dur}%"></span></div></div>`;
let rows=[];if(studioTab==='all'||studioTab==='sponsors')for(let s of sponsorFor(t))rows.push(track(s.name,t.sponsors.filter(x=>x.sponsorId===s.id),'sponsor'));
if(studioTab==='all'||studioTab==='events')for(let e of eventsFor(t))rows.push(track(e.name,t.events.filter(x=>x.eventId===e.id),'event'));
if(studioTab==='all'||studioTab==='cameras')for(let c of camerasFor(t))rows.push(track(c.name,t.cameras.filter(x=>x.cameraId===c.id),'camera'));
return `<div class="track-top">${[0,.25,.5,.75,1].map(x=>`<span>${fmt(dur*x)}</span>`).join('')}</div>${rows.join('')||'<div class="empty">No tracks configured</div>'}`}
function logsHTML(t){
 let logs=[...t.sponsors.map(x=>({...x,type:'Sponsor',itemId:x.sponsorId,key:'sponsors',color:'#ff9b36'})),
 ...t.events.map(x=>({...x,type:'Event',itemId:x.eventId,key:'events',color:'#d7c7b5'})),
 ...t.cameras.map(x=>({...x,type:'Camera',itemId:x.cameraId,key:'cameras',color:'#9cabb0'}))].sort((a,b)=>b.start-a.start);
 return `<div class="logtable"><table class="table"><thead><tr>
 <th>START</th><th>TYPE</th><th>ATTRIBUTE</th><th>END</th><th>PLACEMENT TYPE / VISIBILITY QUALITY</th><th>ACTIONS</th>
 </tr></thead><tbody>${logs.map(x=>`<tr>
 <td class="nowrap" style="font-weight:900">${fmt(x.start)}</td>
 <td><span style="color:${x.color};font-weight:800">${x.type}</span></td>
 <td>${esc(labelFor(t,x.key,x.itemId))}</td>
 <td>${x.end==null?'<span style="color:#15ac76;font-weight:900">Recording…</span>':x.kind==='point'?'Moment':fmt(x.end)}</td>
 <td>${x.key==='sponsors'? `<div class="exposure-attribute-inputs">
 <label>PRIMARY PLACEMENT<select aria-label="Placement type for ${esc(labelFor(t,x.key,x.itemId))}" onchange="setExposureAttribute('${x.id}','placement',this.value)" ${canEdit(t,'sponsors')?'':'disabled'}>${attributeOptions(PLACEMENT_TYPES,x.placement)}</select></label>
 <label>VISIBILITY QUALITY<select aria-label="Visibility quality for ${esc(labelFor(t,x.key,x.itemId))}" onchange="setExposureAttribute('${x.id}','quality',this.value)" ${canEdit(t,'sponsors')?'':'disabled'}>${attributeOptions(VISIBILITY_QUALITIES,x.quality)}</select></label>
 </div>`: '<span class="muted small">—</span>'}</td>
 <td><button class="button ghost tiny" onclick="seekVideo(${x.start})" title="Jump to time">${icons('play')}</button>
 ${canEdit(t,x.key==='sponsors'?'sponsors':'context')?`<button class="button ghost tiny" onclick="deleteLog('${x.key}','${x.id}')" title="Remove log">${icons('close')}</button>`:''}</td>
 </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#999;padding:20px">No actions recorded yet</td></tr>'}</tbody></table>
 <p class="exposure-meta-note">For each sponsor appearance, select the primary placement and readability. Unknown stays unclassified. If placement or clarity changes materially during an appearance, end the interval and start a new one.</p></div>`;
}
window.setExposureAttribute=(id,field,value)=>{
 const t=currentTask();if(!t||!canEdit(t,'sponsors'))return;
 const choices=field==='placement'?PLACEMENT_TYPES:field==='quality'?VISIBILITY_QUALITIES:null;
 if(!choices||!['',...choices.map(x=>x[0])].includes(value))return;
 const item=t.sponsors.find(x=>x.id===id);
 if(!item)return;
 item[field]=value||null;
 save();notify('Sponsor exposure '+(field==='placement'?'placement':'quality')+' saved');
};
window.setStudioTab=k=>{if(!['all','sponsors','events','cameras'].includes(k))return;if(studioTab!==k){studioTab=k;const panel=document.querySelector('.sponsor-rail');if(panel)panel.scrollTop=0;}refreshStudio()};
function refreshStudio(){
 const t=currentTask();if(!t||view!=='studio')return;
 const heading=studioSidebarHeading();
 const title=document.getElementById('railTagTitle');if(title)title.textContent=heading.title;
 const hint=document.getElementById('railTagHint');if(hint)hint.textContent=heading.hint;
 const panel=document.querySelector('.sponsor-rail');if(panel)panel.setAttribute('aria-label',heading.title+' tagging panel');
 const rail=document.getElementById('sponsorRail');if(rail)rail.innerHTML=sponsorRailHTML(t);
 const chips=document.getElementById('controlsBody');if(chips)chips.innerHTML=controlsHTML(t);
 const timeline=document.getElementById('timelineBody');if(timeline)timeline.innerHTML=timelineHTML(t);
 const tabButtons=document.querySelectorAll('[data-studio-tab]');
 tabButtons.forEach(btn=>{const active=btn.dataset.studioTab===studioTab;btn.classList.toggle('on',active);btn.setAttribute('aria-pressed',String(active))});
 const logs=document.getElementById('logBody');if(logs)logs.innerHTML=logsHTML(t);
 const count=document.getElementById('logcount');if(count)count.textContent=`${t.sponsors.length+t.events.length+t.cameras.length} logs`;
 const live=document.getElementById('activeCount');if(live)live.textContent=`${t.sponsors.filter(a=>a.end==null).length} LIVE`;
 const total=document.getElementById('totalLogs');if(total)total.textContent=`${t.sponsors.length+t.events.length+t.cameras.length} ANNOTATIONS`;
 const camera=document.getElementById('activeCamera');if(camera){const current=t.cameras.find(c=>c.end==null);camera.textContent=current?labelFor(t,'cameras',current.cameraId):'CAMERA NOT SELECTED'}
 updateClock();
}
// Actions tagged at the same video timestamp are corrections, not zero-duration annotations.
const SAME_TIME_TOLERANCE=0.2;
const sameVideoTimestamp=(a,b)=>Math.abs(Number(a)-Number(b))<=SAME_TIME_TOLERANCE;
window.tagSponsor=id=>{
 const t=currentTask();if(!t||!canEdit(t,'sponsors'))return;
 const at=seconds(t),active=t.sponsors.find(x=>x.sponsorId===id&&x.end==null);
 if(active){
  if(sameVideoTimestamp(at,active.start)){
   t.sponsors=t.sponsors.filter(x=>x.id!==active.id);
   save();refreshStudio();notify('Sponsor event removed — same timestamp');return;
  }
  if(at<active.start)return notify('End time cannot precede start time');
  active.end=at;
 }else{
  t.sponsors.push({id:uid(),sponsorId:id,start:at,end:null,createdBy:logged,createdAt:tstamp()});
 }
 save();refreshStudio();
};
window.tagEvent=id=>{
 const t=currentTask();if(!t||!canEdit(t,'context'))return;
 if(!eventsFor(t).some(x=>x.id===id))return;
 const at=seconds(t),active=t.events.find(x=>x.eventId===id&&x.end==null);
 if(active){
  if(sameVideoTimestamp(at,active.start)){
   t.events=t.events.filter(x=>x.id!==active.id);
   save();refreshStudio();notify('Key event removed — same timestamp');return;
  }
  if(at<active.start)return notify('End time cannot precede start time');
  active.end=at;
 }else{
  t.events.push({id:uid(),eventId:id,kind:'range',start:at,end:null,createdBy:logged,createdAt:tstamp()});
 }
 save();refreshStudio();
};
window.tagCamera=id=>{
 const t=currentTask();if(!t||!canEdit(t,'context'))return;
 if(!camerasFor(t).some(x=>x.id===id))return;
 const at=seconds(t),active=t.cameras.find(x=>x.end==null);
 if(active){
  if(sameVideoTimestamp(at,active.start)){
   if(active.cameraId===id){
    t.cameras=t.cameras.filter(x=>x.id!==active.id);
    save();refreshStudio();notify('Camera event removed — same timestamp');return;
   }
   // Replacing the angle at the same time prevents a zero-duration camera segment.
   active.cameraId=id;
   save();refreshStudio();notify('Camera angle replaced at same timestamp');return;
  }
  if(at<active.start)return notify('Camera end time cannot precede start time');
  active.end=at;
  if(active.cameraId===id){save();refreshStudio();return}
 }
 t.cameras.push({id:uid(),cameraId:id,start:at,end:null,createdBy:logged,createdAt:tstamp()});
 save();refreshStudio();
};
window.deleteLog=(key,id)=>{let t=currentTask(),kind=key==='sponsors'?'sponsors':'context';if(!t||!canEdit(t,kind))return;confirmInApp('Remove annotation','Remove this recorded annotation? This action cannot be undone.',()=>{t[key]=t[key].filter(x=>x.id!==id);save();refreshStudio();notify('Annotation removed');},{actionLabel:'REMOVE ANNOTATION'})};
window.seekVideo=val=>{let t=currentTask();if(!t)return;tick=clamp(Number(val)||0,0,t.duration||3600);if(videoEl&&Number.isFinite(videoEl.duration)){try{videoEl.currentTime=clamp(tick,0,videoEl.duration)}catch(e){}}updateClock();save();let l=document.getElementById('timelineBody');if(l)l.innerHTML=timelineHTML(t)};
window.seekFromTrack=(e,el)=>{let rect=el.getBoundingClientRect();seekVideo(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*currentTask().duration)};
window.skipVideo=n=>seekVideo((videoEl&&Number.isFinite(videoEl.currentTime)?videoEl.currentTime:tick)+n);
window.skipByStep=direction=>skipVideo((Number(direction)||0)*seekStep);
window.setSeekStep=value=>{
 seekStep=value===10?10:5;
 for(const n of [5,10]){const b=document.getElementById('seekstep-'+n);if(b){b.classList.toggle('active',n===seekStep);b.setAttribute('aria-pressed',String(n===seekStep))}}
 const back=document.getElementById('skipBack'),forward=document.getElementById('skipForward');
 if(back)back.textContent='−'+seekStep+'s';if(forward)forward.textContent='+'+seekStep+'s';
};
window.togglePlay=()=>{if(!videoEl)return notify('Attach a video to play. You can still scrub timestamps to test tagging.');if(videoEl.paused){videoEl.play().catch(()=>notify('Video playback unavailable for this source.'))}else videoEl.pause()};
window.cycleRate=()=>{let values=[1,1.25,1.5,2];let cur=videoEl?.playbackRate||1;let next=values[(values.indexOf(cur)+1)%values.length];if(videoEl)videoEl.playbackRate=next;document.getElementById('rateButton').textContent=next+'×'};
function updateClock(){let t=currentTask();if(!t)return;t.observedTime=Math.max(t.observedTime||0,tick);let e=document.getElementById('vidtime');if(e)e.textContent=`${fmt(tick)} / ${fmt(t.duration)}`;let r=document.getElementById('seek');if(r){r.max=t.duration;r.value=tick};let c=document.getElementById('currentT');if(c)c.textContent=fmt(tick);let p=document.querySelectorAll('.track .playhead');p.forEach(x=>x.style.left=(100*tick/t.duration)+'%');let b=document.getElementById('playbutton');if(b&&videoEl)b.innerHTML=icons(videoEl.paused?'play':'pause')}
function attachVideo(){
 videoEl=document.getElementById('matchVideo');if(!videoEl)return;
 const el=videoEl;
 el.addEventListener('timeupdate',()=>{tick=el.currentTime;updateClock();if(Math.floor(tick)%4===0)save()});
 el.addEventListener('play',updateClock);
 el.addEventListener('pause',updateClock);
 el.addEventListener('loadedmetadata',()=>{
  const t=currentTask();if(!t)return;
  if(Number.isFinite(el.duration)&&el.duration>1){
   if(Math.abs(el.duration-t.duration)>2){
    t.duration=Math.round(el.duration*100)/100;
    save();refreshStudio();
   }
   const notice=document.getElementById('videoFileStatus');
   const res=el.videoWidth&&el.videoHeight?el.videoWidth+' × '+el.videoHeight:'';
   if(notice&&localVideos[t.id])notice.textContent='LOCAL FILE: '+(t.videoName||'Video')+
    (res?' · '+res:'')+' · '+fmt(el.duration)+' · Not uploaded or shared. Reselect after refresh.';
   updateClock();
  }
 });
 el.addEventListener('error',()=>{
  const msg='This browser could not decode the video. Try H.264 MP4 or WebM, or check the HTTPS source.';
  const notice=document.getElementById('videoFileStatus');
  if(notice)notice.textContent=msg;
  notify(msg);
 });
 el.addEventListener('ended',updateClock);
}
window.chooseVideo=()=>{
 if(!currentTask())return notify('Open a match before selecting a video.');
 const picker=document.getElementById('videofile');
 if(!picker)return notify('Local video picker is unavailable.');
 picker.value=''; // Allows selecting the same file again to reconnect it.
 picker.click();
};
window.attachLocalVideoFile=file=>{
 const t=currentTask();if(!t||!file)return false;
 if(!file.type.startsWith('video/')&&!/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name||'')){
  notify('Choose a video file, such as MP4 or WebM.');return false;
 }
 let url;
 try{url=URL.createObjectURL(file)}catch(err){
  notify('Could not open this local video. Try selecting it again.');return false;
 }
 const prior=localVideos[t.id];
 localVideos[t.id]=url;
 if(prior)URL.revokeObjectURL(prior);
 t.videoName=file.name;
 t.videoSize=file.size;
 t.videoMime=file.type||'unknown';
 tick=0;
 save();
 render();
 notify('Local video opened. It was not uploaded; select it again after refreshing.');
 return true;
};
const handleVideoFileChange=e=>{
 const file=e.target.files&&e.target.files[0];
 if(file)attachLocalVideoFile(file);
};
document.getElementById('videofile').addEventListener('change',handleVideoFileChange);
function runKeydown(e){if(view!=='studio'||modalOpen||e.target.matches('input,textarea,select,[contenteditable]'))return;if(e.code==='Space'){e.preventDefault();togglePlay()}else if(e.key==='ArrowLeft'){e.preventDefault();skipByStep(-1)}else if(e.key==='ArrowRight'){e.preventDefault();skipByStep(1)}}
document.addEventListener('keydown',runKeydown);
window.submitMyTask=()=>{
 let t=currentTask();if(!t)return;
 let mineS=allowed(t,'sponsors')&&!t.submitted.sponsors,mineC=allowed(t,'context')&&!t.submitted.context;
 if(!mineS&&!mineC)return notify('No open assigned stream to submit.');
 if(mineS&&t.sponsors.some(x=>x.end==null))return notify('Close all active sponsor visibility tags before submitting.');
 if(mineC&&t.events.some(x=>x.end==null))return notify('Close all active duration events before submitting.');
 const parts=[mineS?'sponsor visibility':'',mineC?'events & camera':''].filter(Boolean).join(' and ');
 confirmInApp('Submit annotation streams',`Submit ${parts}? These streams will be locked until an administrator reopens them.`,()=>{
  if(mineS)t.submitted.sponsors=true;
  if(mineC){t.submitted.context=true;t.cameras.forEach(x=>{if(x.end==null)x.end=t.duration})}
  save();render();notify('Assigned work submitted.');
 },{actionLabel:'SUBMIT',danger:false});
};
window.reopenTask=()=>{
 const t=currentTask();if(!t||me().role!=='admin')return;
 confirmInApp('Reopen annotation streams','Reopen both annotation streams for editing?',()=>{
  t.submitted={sponsors:false,context:false};save();render();notify('Task streams reopened');
 },{actionLabel:'REOPEN STREAMS',danger:false});
};
function checkOptions(groups,selected,checkName){return groups.map(g=>`<label class="checkline"><input type="checkbox" name="${checkName}" value="${g.id}" ${selected.includes(g.id)?'checked':''}><span>${esc(g.name)}</span></label>`).join('')||'<span class="muted small">No attribute group exists. Add one in the library first.</span>'}
function optionUsers(selected){return `<option value="">Unassigned</option>`+db.users.filter(u=>u.role==='analyst').map(u=>`<option value="${u.id}" ${u.id===selected?'selected':''}>${esc(u.name)} — ${esc(u.email)}</option>`).join('')}
// Assign roles independently of match metadata and annotation records.
window.assignTaskModal=id=>{
 if(me()?.role!=='admin')return;
 const t=db.tasks.find(x=>x.id===id);
 if(!t)return notify('Match task not found.');
 if(modalOpen)return notify('Close the current dialog before assigning workers.');
 const body=`<div class="assignment-summary"><span class="eyebrow">MATCH ${esc(t.number)}</span><strong>${esc(t.name)}</strong><p>Choose the analysts responsible for each tagging stream. You may assign both to the same person, or leave either stream unassigned.</p></div>
 <div class="assignment-fields">
  <div class="field"><label for="assignSponsorWorker">Sponsor visibility analyst</label>
  <select id="assignSponsorWorker">${optionUsers(t.sponsorAnalystId||'')}</select>
  <small>Records sponsor appearances and visibility durations.</small></div>
  <div class="field"><label for="assignContextWorker">Events & camera analyst</label>
  <select id="assignContextWorker">${optionUsers(t.contextAnalystId||'')}</select>
  <small>Records key match events and broadcast camera angles.</small></div>
 </div>
 ${t.submitted?.sponsors||t.submitted?.context?'<p class="assignment-notice">A completed tagging stream remains locked when reassigned. An admin must reopen it separately to permit changes.</p>':''}
 <p class="assignment-storage-note">Demo-only: task assignments are stored in this browser and are not delivered to analysts on other devices.</p>`;
 const footer=`<button type="button" class="button ghost" onclick="closeModal()">Cancel</button><button type="button" class="button primary" onclick="saveTaskAssignment('${t.id}')">Save assignment</button>`;
 openModal('Assign task',body,footer);
 document.getElementById('assignSponsorWorker')?.focus();
};
window.saveTaskAssignment=id=>{
 if(me()?.role!=='admin')return;
 const t=db.tasks.find(x=>x.id===id);
 if(!t)return notify('Match task not found.');
 const sponsorId=formVal('assignSponsorWorker');
 const contextId=formVal('assignContextWorker');
 const valid=id=>id===''||db.users.some(u=>u.id===id&&u.role==='analyst');
 if(!valid(sponsorId)||!valid(contextId))return notify('Select a valid analyst or Unassigned.');
 const previousSponsor=t.sponsorAnalystId||'';
 const previousContext=t.contextAnalystId||'';
 t.sponsorAnalystId=sponsorId;
 t.contextAnalystId=contextId;
 save();
 closeModal();
 render();
 notify(previousSponsor===sponsorId&&previousContext===contextId?'Assignments unchanged':'Task assignments saved');
};

window.createTaskModal=(id='')=>{if(me().role!=='admin')return;const t=db.tasks.find(x=>x.id===id);openModal(t?'Edit match task':'Create new task',`<div class="formgrid">${!t?`<div class="field full"><label>IMPORT FROM OFFICIAL 2026 MATCH CATALOG</label><select id="taskfixture" onchange="selectFixture(this.value)"><option value="">Custom match / select official fixture</option>${OFFICIAL_FIXTURES.map(f=>`<option value="${f.id}">${f.id} · ${esc(f.home)} vs ${esc(f.away)} · ${f.date}</option>`).join('')}</select><small>Daily BuildUp public match data; automatically refreshed when the feed is available.</small></div>`:``}<div class="field"><label>Task name *</label><input id="taskname" required value="${esc(t?.name||'')}" placeholder="Inter Miami CF vs Arsenal FC"></div><div class="field"><label>Task number *</label><input id="tasknumber" required value="${esc(t?.number||'')}" placeholder="MC-004"></div><div class="field"><label>Match date</label><input id="taskdate" type="date" value="${esc(t?.date||'')}"></div><div class="field"><label>Expected footage length (minutes)</label><input id="taskduration" type="number" min="1" step="0.01" value="${Math.round((t?.duration||3600)/60*100)/100}"></div><div class="field full match-period-config">
 <label>OPTIONAL MATCH PERIOD MAPPING</label>
 <small>Use video minutes, not the stadium clock. Leave both blank if the match periods have not been mapped. The mapping assumes video starts with first-half play and ends with second-half play.</small>
 <div class="period-fields">
  <div><label>FIRST HALF ENDS (VIDEO MINUTE)</label><input type="number" min="0" step="0.01" id="periodFirstEnd" value="${t?.periods?.firstEnd??''}" placeholder="e.g. 30"></div>
  <div><label>SECOND HALF STARTS (VIDEO MINUTE)</label><input type="number" min="0" step="0.01" id="periodSecondStart" value="${t?.periods?.secondStart??''}" placeholder="e.g. 60 with halftime footage"></div>
 </div>
 <small>Example: 60-minute playing time with 30-minute halftime video → 1H ends at 30, 2H starts at 60. If halftime is omitted in the footage, both boundaries may be 30.</small>
 </div><div class="field full"><label>Sponsor attribute lists (select multiple)</label><div class="checkgrid">${checkOptions(db.sponsorGroups,t?.sponsorGroupIds||['sg_main'],'sgroups')}</div></div><div class="field full"><label>Key event attribute lists</label><div class="checkgrid">${checkOptions(db.eventGroups,t?.eventGroupIds||['eg_basic'],'egroups')}</div></div><div class="field full"><label>Camera angle attribute lists</label><div class="checkgrid">${checkOptions(db.cameraGroups,t?.cameraGroupIds||['cg_basic'],'cgroups')}</div></div><div class="field"><label>Sponsor visibility analyst</label><select id="tsponsor">${optionUsers(t?.sponsorAnalystId||'')}</select><small>Assign the same person in both fields for an all-in-one task.</small></div><div class="field"><label>Events & camera analyst</label><select id="tcontext">${optionUsers(t?.contextAnalystId||'')}</select><small>Or assign separately for two synchronized work streams.</small></div><div class="field"><label>Video source</label><select id="taskvideosrc"><option value="none" ${(t?.videoType||'none')==='none'?'selected':''}>Attach local video later</option><option value="https" ${t?.videoType==='https'?'selected':''}>Direct HTTPS video URL</option><option value="ftp" ${t?.videoType==='ftp'?'selected':''}>FTP / SFTP source (metadata)</option></select></div><div class="field"><label>Source URL (optional)</label><input id="taskurl" value="${esc(t?.videoUrl||'')}" placeholder="https://… or sftp://…"><small>FTP/SFTP requires backend ingestion before video playback.</small></div></div><div class="infohint">Required for production: server-side video ingestion, secure role-based authentication, live syncing and durable media storage. This single-file demo keeps task data in this browser only.</div>`,`<button class="button ghost" onclick="closeModal()">Cancel</button><button class="button primary" onclick="saveTask('${id}')">${t?'Save changes':'Create task'}</button>`,true)};
const checks=name=>[...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value);
window.selectFixture=id=>{let f=fixtureById(id);if(!f)return;let selector=document.getElementById('taskfixture');if(selector)selector.value=id;document.getElementById('taskname').value=f.home+' vs '+f.away;document.getElementById('tasknumber').value=f.id;document.getElementById('taskdate').value=f.date;};
window.saveTask=id=>{const name=formVal('taskname').trim(),number=formVal('tasknumber').trim(),dur=Number(formVal('taskduration'));if(!name||!number||!dur||dur<1)return notify('Add the task name, number and a valid footage duration.');if(db.tasks.some(t=>t.number.toLowerCase()===number.toLowerCase()&&t.id!==id))return notify('Task number must be unique.');let task=db.tasks.find(x=>x.id===id);const firstVal=formVal('periodFirstEnd'),secondVal=formVal('periodSecondStart');
 const providedFirst=firstVal!==''&&firstVal!=null,providedSecond=secondVal!==''&&secondVal!=null;
 if(providedFirst!==providedSecond)return notify('Set both half boundaries, or leave both blank.');
 const firstEnd=Number(firstVal),secondStart=Number(secondVal);
 if(providedFirst&&(!Number.isFinite(firstEnd)||!Number.isFinite(secondStart)||firstEnd<=0||secondStart<firstEnd||secondStart>=dur))return notify('Period mapping must satisfy 0 < first-half end ≤ second-half start < video duration.');
 let data={name,number,date:formVal('taskdate'),duration:Math.round(dur*60*100)/100,
 periods:providedFirst?{firstEnd,secondStart}:null,sponsorGroupIds:checks('sgroups'),eventGroupIds:checks('egroups'),cameraGroupIds:checks('cgroups'),sponsorAnalystId:formVal('tsponsor'),contextAnalystId:formVal('tcontext'),videoType:formVal('taskvideosrc'),videoUrl:formVal('taskurl').trim(),fixtureId:formVal('taskfixture')||task?.fixtureId||''};if(!task&&data.fixtureId&&taskForFixture(data.fixtureId))return notify('This fixture already has a task. Open its existing entry in the Match Catalog.');if(data.videoType==='https'&&data.videoUrl&&!/^https:\/\//i.test(data.videoUrl))return notify('Direct video links must start with https://');if(data.videoType==='ftp'&&data.videoUrl&&!/^(ftp|sftp):\/\//i.test(data.videoUrl))return notify('FTP links must start with ftp:// or sftp://');if(!task){task={id:uid(),sponsors:[],events:[],cameras:[],submitted:{sponsors:false,context:false},createdAt:tstamp(),demo:false};db.tasks.push(task)}Object.assign(task,data);save();closeModal();view='tasks';render();notify(id?'Task updated':'Task created')};
function sponsorsView(){let gs=db.sponsorGroups;return `<div class="pagehead"><div><div class="eyebrow">SETUP / BRAND CATALOG</div><h1>Sponsor library</h1><p class="sub">Organize sponsors into reusable groups. Upload a logo or full-brand image for each.</p></div><button class="button primary" onclick="groupModal('sponsor')">${icons('plus')} New sponsor list</button></div><div class="library-layout">${gs.map(g=>`<div class="card groupcard"><div class="grouphead"><div><h3>${esc(g.name)}</h3><p>${esc(g.description||'Reusable sponsor attribute list')} · ${g.sponsors.length} sponsors</p></div><button class="button ghost tiny" onclick="groupModal('sponsor','${g.id}')">Edit</button></div><div class="groupitems">${g.sponsors.map(s=>`<div class="sponsor-mini">${logo(s)}${esc(s.name)} <button class="button ghost tiny" onclick="sponsorModal('${g.id}','${s.id}')" title="Replace or upload logo">UPLOAD / EDIT</button><button class="button warn tiny" onclick="deleteSponsor('${g.id}','${s.id}')" title="Delete sponsor">DELETE</button></div>`).join('')}</div><button class="button soft tiny" style="margin-top:17px" onclick="sponsorModal('${g.id}')">${icons('plus')} Add sponsor</button></div>`).join('')}</div>`}
function attrsView(){const gs=[['event','Key event attributes',db.eventGroups],['camera','Camera angle attributes',db.cameraGroups]];return `<div class="pagehead"><div><div class="eyebrow">SETUP / TAG ONTOLOGY</div><h1>Tagging attributes</h1><p class="sub">Create reusable event and camera presets that match different client requirements.</p></div></div>${gs.map(([kind,title,groups])=>`<div class="sectionhead" style="margin:30px 0 15px"><h2>${title}</h2><button class="button primary tiny" onclick="groupModal('${kind}')">${icons('plus')} New list</button></div><div class="library-layout">${groups.map(g=>`<div class="card groupcard"><div class="grouphead"><div><h3>${esc(g.name)}</h3><p>${g.items.length} attributes</p></div><button class="button ghost tiny" onclick="groupModal('${kind}','${g.id}')">Edit</button></div><div class="groupitems">${g.items.map(i=>`<span class="sponsor-mini">${esc(i.name)} ${kind==='event'&&i.highValue===true?'<span class="tag">HIGH VALUE</span>':''} <button class="button ghost tiny" style="padding:3px 5px" title="Remove attribute" onclick="removeItem('${kind}','${g.id}','${i.id}')">${icons('close')}</button></span>`).join('')}</div><button class="button soft tiny" style="margin-top:17px" onclick="attrItemModal('${kind}','${g.id}')">${icons('plus')} Add attribute</button></div>`).join('')}</div>`).join('')}`}
window.groupModal=(kind,id='')=>{let groups=kind==='sponsor'?db.sponsorGroups:kind==='event'?db.eventGroups:db.cameraGroups;let g=groups.find(x=>x.id===id);openModal(g?'Edit attribute list':'New attribute list',`<div class="field"><label>List name</label><input id="gname" value="${esc(g?.name||'')}" placeholder="${kind==='sponsor'?'Main stadium sponsors':kind==='event'?'Match moments':'Broadcast camera presets'}"></div>${kind==='sponsor'?`<div class="field" style="margin-top:15px"><label>Description</label><textarea id="gdesc" rows="2" placeholder="Optional">${esc(g?.description||'')}</textarea></div>`:''}`,`<button class="button ghost" onclick="closeModal()">Cancel</button><button class="button primary" onclick="saveGroup('${kind}','${id}')">Save list</button>`)};
window.saveGroup=(kind,id)=>{let gs=kind==='sponsor'?db.sponsorGroups:kind==='event'?db.eventGroups:db.cameraGroups;let v=formVal('gname').trim();if(!v)return notify('List name is required.');let g=gs.find(x=>x.id===id);if(g){g.name=v;if(kind==='sponsor')g.description=formVal('gdesc')}else gs.push({id:uid(),name:v,...(kind==='sponsor'?{description:formVal('gdesc'),sponsors:[]}:{items:[]})});save();closeModal();render();notify('Attribute list saved')};
window.addSponsorToCurrentTask=()=>{let t=currentTask();if(!t||me()?.role!=='admin')return;let g=db.sponsorGroups.find(x=>t.sponsorGroupIds.includes(x.id));if(!g){notify('Assign a sponsor list to the task first.');return}sponsorModal(g.id)};
window.sponsorModal=(gid,sid='')=>{let g=db.sponsorGroups.find(x=>x.id===gid),s=g?.sponsors.find(x=>x.id===sid);if(!g)return;openModal(s?'Edit sponsor':'Add a sponsor',`<div class="formgrid"><div class="field full"><label>Sponsor name</label><input id="sname" value="${esc(s?.name||'')}" placeholder="Brand name" required></div><div class="field"><label>UPLOAD SPONSOR LOGO / FULL BRAND IMAGE</label><input type="file" id="simage" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="previewSponsorLogo(this)"><div id="logo-preview" class="logo-preview">${s?.logo?`<img src="${esc(s.logo)}" alt="Current sponsor logo">`:'SELECT AN IMAGE — THIS WILL APPEAR ON THE ANALYST TAGGING CARD'}</div><small>Transparent margins are trimmed automatically so the brand fills the card. Existing white JPEG backgrounds require re-uploading the original transparent PNG. All logos stay browser-local.</small></div><div class="field"><label>Fallback brand color</label><input type="color" id="scolor" value="${esc(s?.color||'#7059c4')}" style="padding:5px;height:45px"></div></div>`,`<button class="button ghost" onclick="closeModal()">Cancel</button>${s?`<button class="button warn" onclick="deleteSponsor('${gid}','${sid}')">Delete</button>`:''}<button class="button primary" onclick="saveSponsor('${gid}','${sid}')">Save sponsor</button>`)};
window.previewSponsorLogo=input=>{const p=document.getElementById('logo-preview'),f=input?.files?.[0];if(!p||!f)return;if(!f.type.startsWith('image/')){p.textContent='Please select an image';return}const rd=new FileReader();rd.onload=()=>{p.innerHTML='<img alt="New sponsor logo preview">';p.firstChild.src=rd.result};rd.readAsDataURL(f)};
// Trim transparent image margins before thumbnailing. A fixed 220 × 140
// thumbnail with transparent padding makes horizontal brand marks appear tiny.
function logoAlphaBounds(pixels,width,height){
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(pixels[(y*width+x)*4+3]<=12)continue;
  left=Math.min(left,x);top=Math.min(top,y);
  right=Math.max(right,x);bottom=Math.max(bottom,y);
 }
 if(right<left)return {x:0,y:0,width,height};
 const pad=Math.max(1,Math.ceil(Math.min(width,height)*.012));
 left=Math.max(0,left-pad);top=Math.max(0,top-pad);
 right=Math.min(width-1,right+pad);bottom=Math.min(height-1,bottom+pad);
 return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
function cropLogoDataUrl(source){
 return new Promise((resolve,reject)=>{
  const img=new Image();
  img.onerror=()=>reject(new Error('Could not decode sponsor image'));
  img.onload=()=>{
   try{
    const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
    if(!iw||!ih)throw new Error('Image has no dimensions');
    const scanScale=Math.min(1,1400/Math.max(iw,ih));
    const sw=Math.max(1,Math.round(iw*scanScale)),sh=Math.max(1,Math.round(ih*scanScale));
    const sourceCanvas=document.createElement('canvas');sourceCanvas.width=sw;sourceCanvas.height=sh;
    const sourceContext=sourceCanvas.getContext('2d',{willReadFrequently:true});
    if(!sourceContext)throw new Error('Image processor is not available');
    sourceContext.clearRect(0,0,sw,sh);
    sourceContext.drawImage(img,0,0,sw,sh);
    const rgba=sourceContext.getImageData(0,0,sw,sh).data;
    const bounds=logoAlphaBounds(rgba,sw,sh);
    const scale=Math.min(1,560/bounds.width,260/bounds.height);
    const ow=Math.max(1,Math.round(bounds.width*scale));
    const oh=Math.max(1,Math.round(bounds.height*scale));
    const output=document.createElement('canvas');output.width=ow;output.height=oh;
    const ctx=output.getContext('2d');
    if(!ctx)throw new Error('Image processor is not available');
    ctx.clearRect(0,0,ow,oh);
    ctx.drawImage(sourceCanvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,ow,oh);
    resolve(output.toDataURL('image/png'));
   }catch(err){reject(err)}
  };
  img.src=source;
 });
}
function thumbnail(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('Unable to read logo'));
  reader.onload=()=>cropLogoDataUrl(reader.result).then(resolve,reject);
  reader.readAsDataURL(file);
 });
}
// Automatically tighten existing browser-local transparent PNG thumbnails.
async function optimizeStoredSponsorLogos(){
 let changed=false;
 for(const group of db.sponsorGroups||[])for(const sponsor of group.sponsors||[]){
  if(sponsor.logoTrimmed||!/^data:image\/png[;,]/i.test(sponsor.logo||''))continue;
  try{
   const compact=await cropLogoDataUrl(sponsor.logo);
   if(compact){sponsor.logo=compact;sponsor.logoTrimmed=true;changed=true}
  }catch(err){/* Preserve the original logo when it cannot be decoded. */}
 }
 if(changed){
  save();
  if(!modalOpen){
   if(view==='studio')refreshStudio();
   else render();
  }
 }
}
window.saveSponsor=async(gid,sid)=>{let g=db.sponsorGroups.find(x=>x.id===gid),name=formVal('sname').trim(),file=document.getElementById('simage').files[0];if(!g||!name)return notify('Sponsor name required');if(file&&file.size>6*1024*1024)return notify('Sponsor image must be under 6 MB');let logoData;try{if(file)logoData=await thumbnail(file)}catch(e){return notify('Could not read this logo image.')}let s=g.sponsors.find(x=>x.id===sid);if(!s){s={id:uid()};g.sponsors.push(s)}s.name=name;s.color=formVal('scolor');if(logoData){s.logo=logoData;s.logoTrimmed=true;}save();closeModal();render();notify('Sponsor saved')};
window.deleteSponsor=(gid,sid)=>{let g=db.sponsorGroups.find(x=>x.id===gid);if(!g)return;let used=db.tasks.some(t=>t.sponsors.some(v=>v.sponsorId===sid));if(used)return notify('This brand has recorded annotations. Preserve the history; create a new list instead.');const sponsor=g.sponsors.find(x=>x.id===sid);confirmInApp('Delete sponsor',`Delete ${sponsor?.name||'this sponsor'} and its uploaded brand image from the list?`,()=>{g.sponsors=g.sponsors.filter(x=>x.id!==sid);save();render();notify('Sponsor removed')},{actionLabel:'DELETE SPONSOR'})};
window.attrItemModal=(kind,gid)=>openModal('Add '+(kind==='event'?'match event':'camera angle'),`<div class="formgrid"><div class="field"><label>Attribute name</label><input id="iname" placeholder="${kind==='event'?'Goal, replay, substitution':'Wide · left goal'}"></div>
 ${kind==='event'?'<div class="field full"><label class="checkline"><input type="checkbox" id="ihigh"><span>Highlight as high-value sponsor moment (e.g., goal, trophy celebration)</span></label></div>':''}</div>`,`<button class="button ghost" onclick="closeModal()">Cancel</button><button class="button primary" onclick="saveAttrItem('${kind}','${gid}')">Add attribute</button>`);
window.saveAttrItem=(kind,gid)=>{let gs=kind==='event'?db.eventGroups:db.cameraGroups,g=gs.find(x=>x.id===gid),name=formVal('iname').trim();if(!g||!name)return notify('Attribute name required');g.items.push({id:uid(),name,...(kind==='event'?{kind:'range',highValue:!!document.getElementById('ihigh')?.checked}: {})});save();closeModal();render()};
window.removeItem=(kind,gid,id)=>{let gs=kind==='event'?db.eventGroups:db.cameraGroups,g=gs.find(x=>x.id===gid);if(!g)return;const item=g.items.find(x=>x.id===id);if(!item)return;confirmInApp('Remove attribute',`Remove "${item.name}" from this list? Historical annotations may lose the display label.`,()=>{g.items=g.items.filter(x=>x.id!==id);save();render();notify('Attribute removed')},{actionLabel:'REMOVE ATTRIBUTE'})};
function usersView(){return `<div class="pagehead"><div><div class="eyebrow">WORKSPACE / PEOPLE</div><h1>Analysts & access</h1><p class="sub">Assign either one analyst to both streams or two analysts to split tagging responsibilities.</p></div><button class="button primary" onclick="userModal()">${icons('plus')} Add analyst</button></div><div class="card cardpad"><div class="tablewrap"><table class="table"><thead><tr><th>Team member</th><th>Role</th><th>Email</th><th>Active assignments</th><th></th></tr></thead><tbody>${db.users.map(u=>`<tr><td><div class="row"><div class="avatar">${esc(u.name.slice(0,2).toUpperCase())}</div><b>${esc(u.name)}</b></div></td><td><span class="tag ${u.role==='admin'?'pink':''}">${esc(u.role)}</span></td><td>${esc(u.email)}</td><td>${db.tasks.filter(t=>t.sponsorAnalystId===u.id||t.contextAnalystId===u.id).length}</td><td>${u.role==='analyst'?`<button class="button ghost tiny" onclick="userModal('${u.id}')">Edit</button>`:''}</td></tr>`).join('')}</tbody></table></div></div><div class="infohint">This demo stores account passwords in local browser storage for demonstration only. Production authentication must use a secured server, password hashing, verified email recovery, sessions and server-enforced permissions.</div>`}
window.userModal=(id='')=>{let u=db.users.find(x=>x.id===id);openModal(u?'Edit analyst':'Add analyst',`<div class="formgrid"><div class="field"><label>Full name</label><input id="uname" value="${esc(u?.name||'')}"></div><div class="field"><label>Work email</label><input type="email" id="uemail" value="${esc(u?.email||'')}"></div><div class="field full"><label>Demo password ${u?'(leave empty to keep current)':''}</label><input type="password" id="upass" placeholder="At least 8 characters" autocomplete="new-password"></div></div>`,`<button class="button ghost" onclick="closeModal()">Cancel</button><button class="button primary" onclick="saveUser('${id}')">Save analyst</button>`)};
window.saveUser=id=>{let u=db.users.find(x=>x.id===id),name=formVal('uname').trim(),email=formVal('uemail').trim().toLowerCase(),pwd=formVal('upass');if(!name||!/^\S+@\S+\.\S+$/.test(email))return notify('Add a name and valid email address.');if(db.users.some(x=>x.email===email&&x.id!==id))return notify('An account already uses this email.');if((!u||pwd)&&pwd.length<8)return notify('Demo password must have at least eight characters.');if(u){u.name=name;u.email=email;if(pwd)u.password=pwd}else db.users.push({id:uid(),name,email,password:pwd,role:'analyst'});save();closeModal();render();notify('Analyst saved')};
/* Analytics computed strictly from annotated intervals; no inferred impressions or valuations. */
function insightData(t){
 const videoSeconds=Math.max(1,Number(t.duration)||3600);
 const annotations=[...t.sponsors,...t.events,...t.cameras];
 const endpoint=Math.min(videoSeconds,Math.max(0,Number(t.observedTime)||0,...annotations.map(x=>Number(x.end==null?x.start:x.end)||0)));
 const clampTime=v=>Math.max(0,Math.min(videoSeconds,Number(v)||0));
 const span=x=>({start:clampTime(x.start),end:clampTime(x.end==null?endpoint:x.end)});
 const spans=xs=>xs.map(span).filter(x=>x.end>x.start);
 const length=xs=>xs.reduce((sum,x)=>sum+x.end-x.start,0);
 const pct=(v,base)=>base>0?100*v/base:0;
 const union=xs=>merged(xs);
 const brands=sponsorFor(t).map(s=>{
  const rows=t.sponsors.filter(x=>x.sponsorId===s.id);
  const own=union(spans(rows));
  const duration=length(own);
  const eventHits=t.events.filter(e=>{
   if(e.kind==='point'&&e.end===e.start)return own.some(x=>e.start>=x.start&&e.start<x.end);
   return spans([e]).some(ev=>own.some(x=>overlap(ev,x)>0));
  }).length;
  return {...s,own,seconds:duration,entries:rows.length,segments:own.length,
   longest:Math.max(0,...own.map(x=>x.end-x.start)),
   first:own.length?own[0].start:null,eventHits};
 }).sort((a,b)=>b.seconds-a.seconds);
 const active=brands.filter(b=>b.seconds>0);
 const sumSeconds=brands.reduce((n,b)=>n+b.seconds,0);
 const anySponsor=union(brands.flatMap(b=>b.own));
 const coveredSeconds=length(anySponsor);
 const cameras=camerasFor(t).map(c=>{
  const windows=union(spans(t.cameras.filter(a=>a.cameraId===c.id)));
  const cameraTime=length(windows);
  const sponsors=brands.map(b=>{
   const seconds=length(union(b.own.flatMap(x=>windows.map(w=>({start:Math.max(x.start,w.start),end:Math.min(x.end,w.end)})).filter(p=>p.end>p.start))));
   return {id:b.id,name:b.name,seconds};
  });
  return {id:c.id,name:c.name,seconds:cameraTime,sponsorSeconds:sponsors.reduce((n,b)=>n+b.seconds,0),
   sponsorCount:sponsors.filter(x=>x.seconds>0).length,
   leader:sponsors.sort((a,b)=>b.seconds-a.seconds)[0]};
 }).sort((a,b)=>b.seconds-a.seconds);
 const cameraCovered=length(union(spans(t.cameras)));
 const eventRows=t.events.map(e=>{
  const isPoint=e.kind==='point'&&e.start===e.end;
  const window=span(e);
  const valid=window.end>window.start;
  const brandMatches=brands.map(b=>{
   const seconds=isPoint?0:(valid?length(b.own.map(x=>({start:Math.max(window.start,x.start),end:Math.min(window.end,x.end)})).filter(x=>x.end>x.start)):0);
   const hit=isPoint?b.own.some(x=>e.start>=x.start&&e.start<x.end):seconds>0;
   return {id:b.id,name:b.name,seconds,hit};
  }).filter(b=>b.hit);
  const covered=valid?length(union(anySponsor.map(x=>({start:Math.max(x.start,window.start),end:Math.min(x.end,window.end)})).filter(x=>x.end>x.start))):0;
  return {id:e.id,eventId:e.eventId,name:labelFor(t,'events',e.eventId),start:window.start,end:window.end,
   duration:Math.max(0,window.end-window.start),open:e.end==null,legacyPoint:isPoint,brands:brandMatches,
   coverageSeconds:covered,coveragePct:valid?pct(covered,window.end-window.start):0};
 }).sort((a,b)=>a.start-b.start);
 const eventGroups=new Map();
 for(const e of eventRows){let v=eventGroups.get(e.name)||{name:e.name,count:0,withBrands:0,seconds:0,brandNames:new Set()};v.count++;v.withBrands+=e.brands.length>0?1:0;v.seconds+=e.duration;e.brands.forEach(b=>v.brandNames.add(b.name));eventGroups.set(e.name,v)}
 const pairs=[];
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
  const seconds=length(active[i].own.flatMap(a=>active[j].own.map(b=>({start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)})).filter(x=>x.end>x.start)));
  if(seconds>0)pairs.push({a:active[i].name,b:active[j].name,seconds});
 }
 pairs.sort((a,b)=>b.seconds-a.seconds);
 const buckets=[];
 const step=300;
 for(let start=0;start<videoSeconds;start+=step){
  const window={start,end:Math.min(videoSeconds,start+step)};
  const brandSeconds=brands.reduce((n,b)=>n+length(b.own.map(x=>({start:Math.max(x.start,window.start),end:Math.min(x.end,window.end)})).filter(x=>x.end>x.start)),0);
  const covered=length(anySponsor.map(x=>({start:Math.max(x.start,window.start),end:Math.min(x.end,window.end)})).filter(x=>x.end>x.start));
  buckets.push({start,end:window.end,brandSeconds,covered,pct:pct(covered,window.end-window.start),
   eventCount:eventRows.filter(e=>e.start>=start&&e.start<window.end).length});
 }
 const classifiedRows=t.sponsors.map(a=>({
  ...a,endSeconds:a.end==null?endpoint:a.end,
  seconds:Math.max(0,(a.end==null?endpoint:a.end)-a.start)
 })).filter(x=>x.seconds>0);
 const positiveIntervals=classifiedRows.length;
 const classifiedSeconds=classifiedRows.reduce((n,x)=>n+x.seconds,0);
 const placementTotals=PLACEMENT_TYPES.map(([key,label])=>({
  key,label,seconds:classifiedRows.filter(x=>x.placement===key).reduce((n,x)=>n+x.seconds,0),
  intervals:classifiedRows.filter(x=>x.placement===key).length
 })).filter(x=>x.seconds>0).sort((a,b)=>b.seconds-a.seconds);
 const placementUnclassified=classifiedRows.filter(x=>!PLACEMENT_TYPES.some(([k])=>k===x.placement)).reduce((n,x)=>n+x.seconds,0);
 const qualityTotals=VISIBILITY_QUALITIES.map(([key,label])=>({
  key,label,seconds:classifiedRows.filter(x=>x.quality===key).reduce((n,x)=>n+x.seconds,0),
  intervals:classifiedRows.filter(x=>x.quality===key).length
 })).filter(x=>x.seconds>0).sort((a,b)=>b.seconds-a.seconds);
 const qualityUnclassified=classifiedRows.filter(x=>!VISIBILITY_QUALITIES.some(([k])=>k===x.quality)).reduce((n,x)=>n+x.seconds,0);
 const frequency=brands.reduce((n,b)=>n+b.own.length,0);
 const avgExposure=frequency>0?sumSeconds/frequency:0;
 const placementCoverage=classifiedSeconds>0?pct(classifiedSeconds-placementUnclassified,classifiedSeconds):0;
 const qualityCoverage=classifiedSeconds>0?pct(classifiedSeconds-qualityUnclassified,classifiedSeconds):0;
 const periods=t.periods;
 const mapped=periods&&Number.isFinite(Number(periods.firstEnd))&&Number.isFinite(Number(periods.secondStart))&&Number(periods.firstEnd)>0&&Number(periods.secondStart)>=Number(periods.firstEnd)&&Number(periods.secondStart)*60<videoSeconds;
 const periodWindows=mapped?[
  {key:'first',label:'FIRST HALF',start:0,end:Number(periods.firstEnd)*60},
  {key:'break',label:'HALFTIME / UNMAPPED BREAK',start:Number(periods.firstEnd)*60,end:Number(periods.secondStart)*60},
  {key:'second',label:'SECOND HALF',start:Number(periods.secondStart)*60,end:videoSeconds}
 ]:[];
 const periodBreakdown=periodWindows.map(w=>{
  const brandRows=brands.map(b=>({
   name:b.name,id:b.id,seconds:b.own.reduce((n,x)=>n+clipOverlap(x,w),0)
  })).sort((a,b)=>b.seconds-a.seconds);
  const anySeconds=anySponsor.reduce((n,x)=>n+clipOverlap(x,w),0);
  return {...w,anySeconds,combinedBrandSeconds:brandRows.reduce((n,b)=>n+b.seconds,0),
   brandRows:brandRows.filter(b=>b.seconds>0)};
 });
 const highValueEvents=eventRows.filter(e=>{
  const config=eventsFor(t).find(x=>x.id===e.eventId);
  if(config&&typeof config.highValue==='boolean')return config.highValue;
  return /goal|celebrat|penalty|trophy|award/i.test(e.name);
 });
 const highValueIntervals=highValueEvents.filter(e=>e.duration>0&&!e.legacyPoint);
 const highValueMomentSeconds=length(union(highValueIntervals.map(e=>({start:e.start,end:e.end}))));
 const highValueCoverageSeconds=length(union(anySponsor.flatMap(b=>highValueIntervals.map(e=>({
  start:Math.max(e.start,b.start),end:Math.min(e.end,b.end)
 })).filter(x=>x.end>x.start))));
 const brandHighValue=brands.map(b=>({
  id:b.id,name:b.name,seconds:length(union(b.own.flatMap(a=>highValueIntervals.map(e=>({
    start:Math.max(a.start,e.start),end:Math.min(a.end,e.end)
  })).filter(x=>x.end>x.start)))),
  momentCount:highValueEvents.filter(e=>e.brands.some(x=>x.id===b.id)).length
 })).filter(b=>b.seconds>0).sort((a,b)=>b.seconds-a.seconds);
 const sponsorOpen=t.sponsors.filter(x=>x.end==null).length;
 const eventOpen=t.events.filter(x=>x.end==null).length;
 const cameraOpen=t.cameras.filter(x=>x.end==null).length;
 return {brands,active,videoSeconds,endpoint,sumSeconds,coveredSeconds,cameras,cameraCovered,eventRows,
 eventGroups:[...eventGroups.values()].sort((a,b)=>b.count-a.count),pairs,buckets,
 frequency,avgExposure,positiveIntervals,placementTotals,qualityTotals,placementUnclassified,qualityUnclassified,
 placementCoverage,qualityCoverage,periodBreakdown,periodMapped:!!mapped,
 highValueEvents,highValueMomentSeconds,highValueCoverageSeconds,brandHighValue,classifiedSeconds,
 sponsorOpen,eventOpen,cameraOpen,pct,number:n=>Number(n).toFixed(1)};
}
function buildReport(t){
 const d=insightData(t),pct=d.pct,percent=n=>(Number.isFinite(n)?n:0).toFixed(1)+'%';
 const focused=d.brands.find(b=>b.id===insightFocusId),hasData=d.active.length>0;
 const coverage=percent(pct(d.coveredSeconds,d.videoSeconds));
 const incomplete=!(t.submitted?.sponsors&&t.submitted?.context);
 const cards=[
  {label:'TOTAL SPONSOR VISIBILITY',value:fmt(d.sumSeconds),note:'Combined unique-brand seconds; multiple brands add separately'},
  {label:'EXPOSURE FREQUENCY',value:d.frequency,note:'Distinct positive-duration sponsor appearances'},
  {label:'AVERAGE EXPOSURE DURATION',value:d.frequency?fmt(d.avgExposure):'—',note:'Total visible brand seconds ÷ recorded appearances'},
  {label:'SPONSOR VISIBLE FOOTAGE',value:coverage,note:fmt(d.coveredSeconds)+' of '+fmt(d.videoSeconds)+' footage with at least one sponsor'},
  {label:'BRANDS DETECTED',value:d.active.length+'/'+d.brands.length,note:'Distinct visible brands in the configured list'},
  {label:'HIGH-VALUE EVENT EXPOSURE',value:d.highValueEvents.length?fmt(d.highValueCoverageSeconds):'—',note:d.highValueEvents.length+' high-value event intervals classified'}
 ];
 const activeBrands=d.brands.filter(b=>b.seconds>0),peak=Math.max(1,...activeBrands.map(b=>b.seconds));
 const labelledPct=v=>percent(v);
 const focusOptions=`<option value="">ALL SPONSORS</option>${d.brands.map(b=>`<option value="${esc(b.id)}" ${insightFocusId===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}`;
 const timeBars=d.buckets.map(bucket=>{
  const own=focused?focused.own:[],raw=focused?own.reduce((sum,x)=>sum+Math.max(0,Math.min(x.end,bucket.end)-Math.max(x.start,bucket.start)),0):bucket.covered;
  const share=Math.max(0,Math.min(100,pct(raw,bucket.end-bucket.start)));
  return `<div class="insight-tick" title="${fmt(bucket.start)}–${fmt(bucket.end)}: ${fmt(raw)} covered"><div class="insight-tick-track"><span style="height:${share}%"></span></div><span>${fmt(bucket.start)}</span></div>`;
 }).join('');
 const eventSummaries=d.eventGroups.map(g=>`<div class="insight-event-summary"><strong>${esc(g.name)}</strong><span>${g.withBrands} / ${g.count} WITH SPONSORS</span><b>${fmt(g.seconds)}</b></div>`).join('');
 const eventCards=d.eventRows.slice(0,80).map(e=>`<div class="insight-event-card">
  <div class="insight-event-heading"><div><b>${esc(e.name)}</b><span>${fmt(e.start)} – ${e.legacyPoint?'LEGACY POINT':e.open?'OPEN':fmt(e.end)}</span></div>
  <button class="insight-jump" onclick="goToAnnotatedTime('${t.id}',${e.start})">OPEN AT TIME</button></div>
  <div class="insight-event-metrics"><strong>${e.brands.length} BRANDS OVERLAPPED</strong><span>${e.legacyPoint?'MOMENT TAG':percent(e.coveragePct)+' OF EVENT HAS A BRAND VISIBLE'}</span></div>
  <p>${e.brands.length?esc(e.brands.map(b=>b.name).join(' · ')):'No sponsor visibility overlaps this event'}</p>
 </div>`).join('');
 const rankRows=d.brands.map((b,i)=>`<tr><td><div class="insight-brand-cell"><span>${i+1}</span>${logo(b)}<b>${esc(b.name)}</b></div></td>
 <td><strong>${fmt(b.seconds)}</strong><div class="insight-mini-meter"><i style="width:${Math.min(100,100*b.seconds/peak)}%"></i></div></td>
 <td>${percent(pct(b.seconds,d.videoSeconds))}</td>
 <td>${percent(pct(b.seconds,d.sumSeconds))}</td>
 <td>${b.own.length}</td>
 <td>${b.own.length?fmt(b.seconds/b.own.length):'—'}</td>
 <td>${fmt(b.longest)}</td><td>${b.eventHits}</td></tr>`).join('');
 const cameraRows=d.cameras.map(c=>`<tr><td><b>${esc(c.name)}</b></td>
 <td>${fmt(c.seconds)}</td><td>${percent(pct(c.seconds,d.videoSeconds))}</td>
 <td>${fmt(c.sponsorSeconds)}</td><td>${c.sponsorCount}</td><td>${c.leader?.seconds>0?esc(c.leader.name):'—'}</td></tr>`).join('');
 const pairs=d.pairs.slice(0,8).map(p=>`<div class="insight-pair"><span>${esc(p.a)} <em>+</em> ${esc(p.b)}</span><b>${fmt(p.seconds)}</b></div>`).join('');
 const classifiedDuration=d.classifiedSeconds;
 const unknownPlacement=d.placementUnclassified;
 const unknownQuality=d.qualityUnclassified;
 const placeBars=d.placementTotals.map(p=>`<div class="intel-breakdown-row">
 <div class="intel-breakdown-label"><span>${esc(p.label)}</span><strong>${fmt(p.seconds)} · ${p.intervals} APPEARANCES</strong></div>
 <div class="intel-breakdown-meter"><i style="width:${Math.min(100,pct(p.seconds,classifiedDuration))}%"></i></div>
 <p>${percent(pct(p.seconds,classifiedDuration))} of all recorded sponsor interval-seconds</p></div>`).join('');
 const qualityBars=d.qualityTotals.map(q=>`<div class="intel-breakdown-row">
 <div class="intel-breakdown-label"><span>${esc(q.label)}</span><strong>${fmt(q.seconds)}</strong></div>
 <div class="intel-breakdown-meter quality-${q.key}"><i style="width:${Math.min(100,pct(q.seconds,classifiedDuration))}%"></i></div>
 <p>${percent(pct(q.seconds,classifiedDuration))} of all recorded sponsor interval-seconds</p></div>`).join('');
 const periodCards=d.periodBreakdown.filter(p=>p.key!=='break').map(p=>`<article class="intel-period-card">
  <div class="intel-period-header"><b>${esc(p.label)}</b><span>${fmt(p.start)} – ${fmt(p.end)}</span></div>
  <strong>${fmt(p.combinedBrandSeconds)}<small> COMBINED SPONSOR EXPOSURE</small></strong>
  <p>${fmt(p.anySeconds)} of ${fmt(p.end-p.start)} video with at least one sponsor tag</p>
  <div class="intel-breakdown-meter"><i style="width:${pct(p.anySeconds,p.end-p.start)}%"></i></div>
  <div class="intel-period-leaders">${p.brandRows.slice(0,5).map(b=>`<div><span>${esc(b.name)}</span><b>${fmt(b.seconds)}</b></div>`).join('')||'<span class="insight-muted">No sponsor tags recorded in this period.</span>'}</div>
 </article>`).join('');
 const highValueBars=d.brandHighValue.slice(0,8).map(b=>`<div class="intel-breakdown-row">
 <div class="intel-breakdown-label"><span>${esc(b.name)}</span><strong>${fmt(b.seconds)} · ${b.momentCount} MOMENTS</strong></div>
 <div class="intel-breakdown-meter"><i style="width:${Math.min(100,pct(b.seconds,d.highValueMomentSeconds))}%"></i></div></div>`).join('');
 const warnings=[
  d.sponsorOpen>0?`${d.sponsorOpen} sponsor visibility tag(s) still open`:null,
  d.eventOpen>0?`${d.eventOpen} key-event interval(s) still open`:null,
  d.cameraOpen>0?`${d.cameraOpen} camera interval(s) still open`:null,
  d.cameraCovered===0?'No camera-angle coverage recorded':null,
  !d.periodMapped?'Match half boundaries not mapped':null,
  d.placementUnclassified>0?'Some sponsor exposures have no placement type':null,
  d.qualityUnclassified>0?'Some sponsor exposures have no visibility quality':null,
  d.active.length===0?'No sponsor intervals have measurable duration':null
 ].filter(Boolean);
 return `<div class="insights-dashboard">
 <div class="insight-head"><div><div class="eyebrow">MATCH BROADCAST INTELLIGENCE</div>
 <h2>SPONSOR EXPOSURE REPORT</h2><p class="sub">Calculated from sponsor visibility, event intervals and broadcast camera tags.</p></div>
 <span class="insight-quality ${incomplete?'draft':'complete'}">${incomplete?'PRELIMINARY · ANNOTATION IN PROGRESS':'SUBMITTED DATA'}</span></div>
 <div class="insight-stat-grid">${cards.map(c=>`<article class="insight-stat"><span>${c.label}</span><strong>${c.value}</strong><p>${c.note}</p></article>`).join('')}</div>
 <div class="insight-block insight-trend">
  <div class="insight-section-title"><div><h3>WHERE SPONSORS APPEAR IN THE MATCH</h3>
  <p>Five-minute segments. Bar height shows the share of footage covered by a sponsor-visibility annotation.</p></div>
  <label class="insight-select">BRAND FILTER<select id="insightSponsorFilter" onchange="selectInsightSponsor(this.value)">${focusOptions}</select></label></div>
  <div class="insight-bars">${timeBars}</div>
  <div class="insight-trend-footer"><span>FIRST FRAME 00:00</span><span>${focused?esc(focused.name.toUpperCase()):'ANY SPONSOR VISIBLE'}</span><span>FINAL FRAME ${fmt(d.videoSeconds)}</span></div>
 </div>
 <div class="insight-block"><div class="insight-section-title"><div><h3>BRAND EXPOSURE LEADERBOARD</h3>
 <p>Screen presence—not impressions. Share of voice is brand seconds divided by combined brand seconds.</p></div><span class="insight-count">${d.brands.length} TRACKED BRANDS</span></div>
 <div class="tablewrap"><table class="table insight-table"><thead><tr><th>BRAND</th><th>VISIBLE TIME</th><th>% OF MATCH</th><th>VISIBILITY SHARE</th><th>APPEARANCES</th><th>AVG DURATION</th><th>LONGEST</th><th>EVENTS</th></tr></thead>
 <tbody>${rankRows||'<tr><td colspan="8">No configured sponsors</td></tr>'}</tbody></table></div></div>
 <div class="insight-columns">
  <section class="insight-block"><div class="insight-section-title"><div><h3>SPONSORSHIP PLACEMENT TYPE</h3><p>Which physical or broadcast placements contributed more visibility seconds?</p></div><span class="insight-count">CLASSIFIED ${percent(d.placementCoverage)}</span></div>
  ${placeBars||'<p class="insight-muted">Choose each interval’s primary placement in Recorded Actions to unlock this breakdown.</p>'}
  <div class="intel-unknown">UNCLASSIFIED PLACEMENT: ${fmt(unknownPlacement)} · No placement inferred from the brand logo.</div>
  </section>
  <section class="insight-block"><div class="insight-section-title"><div><h3>VISIBILITY QUALITY</h3><p>Readable, partially readable or obscured sponsor appearances.</p></div><span class="insight-count">CLASSIFIED ${percent(d.qualityCoverage)}</span></div>
  ${qualityBars||'<p class="insight-muted">Select Clear / Partial / Obscured for each sponsor interval to unlock this breakdown.</p>'}
  <div class="intel-unknown">UNCLASSIFIED QUALITY: ${fmt(unknownQuality)} · Values apply to each appearance, not individual frames.</div>
  </section></div>
 <section class="insight-block"><div class="insight-section-title"><div><h3>EXPOSURE BY MATCH PERIOD</h3><p>First-half versus second-half broadcast visibility, using video time rather than assuming the match clock.</p></div>
 <span class="insight-count">${d.periodMapped?'MATCH PERIODS MAPPED':'PERIOD MAPPING REQUIRED'}</span></div>
 ${d.periodMapped?`<div class="intel-period-grid">${periodCards}</div>`:
 `<div class="intel-unmapped"><b>MATCH PERIODS ARE NOT MAPPED</b><p>An admin can open the match Actions menu → Edit Task and enter First-half end and Second-half start video minutes. We do not infer the halftime boundary from footage duration.</p></div>`}
 </section>
 <section class="insight-block"><div class="insight-section-title"><div><h3>HIGH-VALUE MOMENT EXPOSURE</h3><p>Which sponsors were visible during tagged goals, celebrations, penalties and other selected major moments?</p></div>
 <span class="insight-count">${d.highValueEvents.length} HIGHLIGHTED MOMENTS</span></div>
 <div class="intel-moment-summary"><div><span>UNIQUE MOMENT TIME</span><strong>${fmt(d.highValueMomentSeconds)}</strong></div>
 <div><span>MOMENT TIME WITH ANY SPONSOR</span><strong>${fmt(d.highValueCoverageSeconds)}</strong></div>
 <div><span>MOMENT COVERAGE</span><strong>${d.highValueMomentSeconds?percent(pct(d.highValueCoverageSeconds,d.highValueMomentSeconds)):'—'}</strong></div></div>
 <div class="intel-moment-list">${highValueBars||'<p class="insight-muted">No sponsor overlap during the currently identified high-value event intervals.</p>'}</div>
 <p class="intel-unknown">Highlights use goal, celebration, penalty, trophy or award event names unless a custom event is explicitly marked high value. This is exposure context, not a sponsorship valuation.</p>
 </section>
 <div class="insight-columns">
  <section class="insight-block"><div class="insight-section-title"><div><h3>KEY EVENT SPONSOR ASSOCIATIONS</h3><p>Exactly which brands overlapped each recorded match action.</p></div><span class="insight-count">${d.eventRows.length} EVENTS</span></div>
  <div class="insight-event-summaries">${eventSummaries||'<p class="insight-muted">No key events have been tagged.</p>'}</div>
  <div class="insight-events-list">${eventCards||'<p class="insight-muted">Tag events with start and end timestamps to reveal sponsor exposure during important moments.</p>'}</div>
  </section>
  <section class="insight-block"><div class="insight-section-title"><div><h3>SIMULTANEOUS BRAND VISIBILITY</h3>
  <p>Brands that appeared together, counted as one exposure per brand.</p></div></div>
  ${pairs||'<p class="insight-muted">No overlapping sponsor pairs recorded yet.</p>'}
  <div class="insight-coverage-note"><b>NO SPONSOR TAG RECORDED</b><strong>${fmt(Math.max(0,d.videoSeconds-d.coveredSeconds))}</strong><span>Footage without recorded sponsor visibility. This does not prove no sponsor appeared when annotation is incomplete.</span></div>
  </section></div>
 <section class="insight-block"><div class="insight-section-title"><div><h3>CAMERA-ANGLE PERFORMANCE</h3><p>Tagging-time coverage and sponsor presence in each broadcast camera view.</p></div>
 <span class="insight-count">${percent(pct(d.cameraCovered,d.videoSeconds))} CAMERA TAGGED</span></div>
 <div class="tablewrap"><table class="table insight-table"><thead><tr><th>CAMERA</th><th>CAMERA DURATION</th><th>% OF MATCH</th><th>BRAND EXPOSURE</th><th>BRANDS SEEN</th><th>TOP BRAND</th></tr></thead>
 <tbody>${cameraRows||'<tr><td colspan="6">No camera angles configured</td></tr>'}</tbody></table></div></section>
 <section class="insight-notes"><div><h3>DATA QUALITY & INTERPRETATION</h3>
 <p>Based only on manually tagged sponsor presence. All durations reference footage timestamps, not clock time or estimated audience exposure. Different brands visible simultaneously each contribute their own exposure seconds, so combined brand exposure may exceed video duration. A sponsor is counted once even when its logo is repeated in the frame.</p>
 <p>Unannotated footage is not proof that sponsors were absent. These annotations cannot establish logo size, screen coverage, ad prominence, audience impressions, monetary valuation, or whether an advertised brand was noticed by a viewer.</p></div>
 <div><h4>ANNOTATION CHECKS</h4><p>Latest annotated timestamp: ${fmt(d.endpoint)} of ${fmt(d.videoSeconds)}.</p>
 ${warnings.length?warnings.map(w=>`<div class="insight-warning">${esc(w)}</div>`).join(''):'<div class="insight-ok">No open tags or missing camera coverage detected</div>'}</div></section>
 </div>`;
}
window.selectInsightSponsor=id=>{insightFocusId=id;let t=reportTask();if(!t)return;const root=document.querySelector('.insights-dashboard');if(root)root.outerHTML=buildReport(t)};
window.goToAnnotatedTime=(id,time)=>{openTask(id);seekVideo(time)};
function tournamentBenchmark(tasks){
 const eligible=tasks.filter(t=>t.sponsors.length>0||t.submitted?.sponsors);
 if(eligible.length<2)return '';
 const all=eligible.map(t=>({t,data:insightData(t)}));
 const totalFootage=all.reduce((sum,x)=>sum+x.data.videoSeconds,0);
 const summary=new Map();
 for(const {t,data} of all){
  for(const brand of data.brands){
   const key=brand.name.trim().toLocaleLowerCase();
   const item=summary.get(key)||{name:brand.name,seconds:0,matchesPresent:0,matchesConfigured:0,eventHits:0,
    longest:0};
   item.matchesConfigured++;
   if(brand.seconds>0)item.matchesPresent++;
   item.seconds+=brand.seconds;
   item.eventHits+=brand.eventHits;
   item.longest=Math.max(item.longest,brand.longest);
   summary.set(key,item);
  }
 }
 const rows=[...summary.values()].sort((a,b)=>b.seconds-a.seconds);
 const studied=all.reduce((sum,x)=>sum+x.data.coveredSeconds,0);
 return `<details class="insight-rollup">
  <summary><div><span class="eyebrow">TOURNAMENT INTELLIGENCE / MULTI-MATCH COMPARISON</span>
   <h2>COMPARE SPONSORS ACROSS MATCHES</h2>
   <p class="sub">${eligible.length} matches with sponsor annotation data · Click to expand tournament analysis.</p>
   </div><span class="insight-expand-label">EXPAND REPORT ⌄</span></summary>
  <div class="insight-rollup-body"><div class="insight-stat-grid">
   <article class="insight-stat"><span>MATCHES IN SAMPLE</span><strong>${eligible.length}</strong><p>Unannotated matches are excluded</p></article>
   <article class="insight-stat"><span>FOOTAGE IN SAMPLE</span><strong>${fmt(totalFootage)}</strong><p>Sum of video durations in the sample</p></article>
   <article class="insight-stat"><span>SPONSOR-VISIBLE FOOTAGE</span><strong>${fmt(studied)}</strong><p>Sum of footage covered by any sponsor tag</p></article>
   <article class="insight-stat"><span>BRANDS IN SAMPLE</span><strong>${rows.filter(r=>r.seconds>0).length}</strong><p>Distinct normalized brand names</p></article>
  </div><div class="insight-section-title" style="margin-top:18px"><div><h3>TOURNAMENT BRAND BENCHMARK</h3>
  <p>Aggregated tagged exposure across selected matches. The sample is not a claim about unprocessed fixtures.</p></div></div>
  <div class="tablewrap"><table class="table insight-table"><thead><tr><th>BRAND</th><th>TOTAL EXPOSURE</th><th>MATCHES VISIBLE</th><th>AVERAGE PER VISIBLE MATCH</th><th>EVENT OVERLAPS</th></tr></thead>
  <tbody>${rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${fmt(r.seconds)}</td><td>${r.matchesPresent} / ${r.matchesConfigured} configured</td>
   <td>${r.matchesPresent?fmt(r.seconds/r.matchesPresent):'—'}</td><td>${r.eventHits}</td></tr>`).join('')}</tbody></table></div>
  <p class="insight-rollup-note">This comparison uses only annotations currently available in this browser. It merges sponsor names case-insensitively and does not assume that similarly named brands are legally identical. The data does not synchronize across analysts or devices.</p>
  </div></details>`;
}
function reportsView(){let ts=visibleTasks();let t=ts.find(x=>x.id===reportTaskId)||ts[0];if(!t)return `<div class="pagehead"><div><h1>Intelligence reports</h1><p class="sub">No assigned matches yet.</p></div></div>`;reportTaskId=t.id;return `<div class="pagehead"><div><div class="eyebrow">SPONSOR INTELLIGENCE / INSIGHTS</div><h1>Exposure analytics</h1><p class="sub">Understand brand visibility against key events and camera contexts.</p></div><div class="row wrap"><select class="smallselect" onchange="chooseReport(this.value)">${ts.map(x=>`<option value="${x.id}" ${x.id===t.id?'selected':''}>${esc(x.number)} · ${esc(x.name)}</option>`).join('')}</select><button class="button ghost" onclick="exportTask('${t.id}')">${icons('download')} Export JSON</button><button class="button primary" onclick="openTask('${t.id}')">Open studio ${icons('arrow')}</button></div></div>${matchHero(t)}${buildReport(t)}${tournamentBenchmark(ts)}`}
window.chooseReport=id=>{reportTaskId=id;render()};
window.showReport=id=>{reportTaskId=id;view='reports';render();window.scrollTo(0,0)};
function insightExport(d){
 const pct=n=>Number(n.toFixed(4));
 return {
  schemaVersion:1,
  matchSeconds:d.videoSeconds,
  annotatedThroughSeconds:d.endpoint,
  anySponsorVisibleSeconds:pct(d.coveredSeconds),
  noSponsorVisibleSeconds:pct(Math.max(0,d.videoSeconds-d.coveredSeconds)),
  broadcastCoveragePercent:pct(d.pct(d.coveredSeconds,d.videoSeconds)),
  combinedBrandSeconds:pct(d.sumSeconds),
  brands:d.brands.map(b=>({sponsorId:b.id,name:b.name,visibleSeconds:pct(b.seconds),
   matchExposurePercent:pct(d.pct(b.seconds,d.videoSeconds)),
   shareOfCombinedBrandSecondsPercent:pct(d.pct(b.seconds,d.sumSeconds)),
   exposureFrequency:b.own.length,averageExposureDurationSeconds:b.own.length?pct(b.seconds/b.own.length):null,
   longestUninterruptedSeconds:pct(b.longest),taggedEventOverlaps:b.eventHits})),
  exposureFrequency:d.frequency,
  averageExposureDurationSeconds:d.frequency?pct(d.avgExposure):null,
  placementBreakdown:d.placementTotals.map(v=>({...v,seconds:pct(v.seconds)})),
  placementUnclassifiedSeconds:pct(d.placementUnclassified),
  placementClassifiedPercent:pct(d.placementCoverage),
  qualityBreakdown:d.qualityTotals.map(v=>({...v,seconds:pct(v.seconds)})),
  qualityUnclassifiedSeconds:pct(d.qualityUnclassified),
  qualityClassifiedPercent:pct(d.qualityCoverage),
  periodMapped:d.periodMapped,
  exposureByPeriod:d.periodBreakdown.map(v=>({key:v.key,label:v.label,startSeconds:v.start,endSeconds:v.end,
   anySponsorVisibleSeconds:v.anySeconds,combinedSponsorExposureSeconds:v.combinedBrandSeconds,
   byBrand:v.brandRows})),
  highValueEvents:{count:d.highValueEvents.length,durationSeconds:d.highValueMomentSeconds,
   sponsorCoveredSeconds:d.highValueCoverageSeconds,
   coveragePercent:d.pct(d.highValueCoverageSeconds,d.highValueMomentSeconds),
   byBrand:d.brandHighValue},
  eventIntervals:d.eventRows.map(e=>({id:e.id,type:e.name,start:e.start,end:e.open?null:e.end,
   duration:e.open?null:e.duration,sponsorCoverageSeconds:e.coverageSeconds,
   sponsorCoveragePercent:e.coveragePct,visibleSponsorIds:e.brands.map(b=>b.id)})),
  cameraViews:d.cameras.map(c=>({id:c.id,name:c.name,cameraDurationSeconds:c.seconds,
   coverageOfMatchPercent:d.pct(c.seconds,d.videoSeconds),
   combinedSponsorSeconds:c.sponsorSeconds,sponsorsSeen:c.sponsorCount,
   leadingSponsor:c.leader?.seconds>0?c.leader.name:null})),
  simultaneousBrandPairs:d.pairs.map(p=>({brands:[p.a,p.b],overlapSeconds:p.seconds})),
  fiveMinuteTimeBuckets:d.buckets.map(b=>({start:b.start,end:b.end,
   anySponsorVisibleSeconds:b.covered,anySponsorVisiblePercent:b.pct,combinedBrandSeconds:b.brandSeconds,
   eventsStartingWithinBucket:b.eventCount})),
  quality:{openSponsorTags:d.sponsorOpen,openEventTags:d.eventOpen,openCameraTags:d.cameraOpen,
   cameraTaggedSeconds:d.cameraCovered},
  disclaimer:'Presence and duration only. Placement and readability are manually classified per appearance; unclassified intervals are excluded from categories. Exposure by half requires explicit video-clock mapping. One primary placement and one overall quality label per visibility interval; multiple simultaneous placements and intra-interval quality changes are not measured. No impressions, logo size, screen coverage, attention, or value inferred.'
 };
}
function exportObject(t){let spo=sponsorFor(t),evt=eventsFor(t),cam=camerasFor(t),m=metrics(t);return {schema:'seebot.sponsor_visibility.v1',exportedAt:tstamp(),task:{id:t.id,number:t.number,name:t.name,date:t.date,videoDurationSeconds:t.duration,videoSourceType:t.videoType,videoSourceUrl:t.videoUrl||null,videoFileName:t.videoName||null,matchPeriods:t.periods||null},assignment:{sponsorAnalyst:{id:t.sponsorAnalystId,name:nameUser(t.sponsorAnalystId)},eventAndCameraAnalyst:{id:t.contextAnalystId,name:nameUser(t.contextAnalystId)}},status:{label:taskStatus(t),...t.submitted},definition:{visibility:'Sponsor is visible anywhere in frame; simultaneous placements of the same sponsor are counted once.',timebase:'Seconds from beginning of video',eventOverlap:'Sponsors and event intervals are matched by positive duration overlap. Legacy point annotations (if present) are checked at their original timestamps.'},attributes:{sponsors:spo.map(s=>({id:s.id,name:s.name,list:s.groupName})),keyEvents:evt,cameraAngles:cam},annotations:{sponsorVisibility:t.sponsors.map(x=>({...x,durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null})),keyEvents:t.events.map(x=>({...x,name:labelFor(t,'events',x.eventId),durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null})),cameraAngles:t.cameras.map(x=>({...x,name:labelFor(t,'cameras',x.cameraId),durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null}))},analytics:{uniqueSponsorsSeen:m.recorded,combinedBrandExposureSeconds:m.total,sponsors:m.rows.map(s=>({id:s.id,name:s.name,exposureSeconds:s.sec,percentageOfVideo:Math.round(10000*s.sec/t.duration)/100,visibilityIntervals:s.appearances,keyEventOverlaps:s.eventHits})),eventSponsorAssociations:t.events.map(e=>({eventId:e.id,tag:e.eventId,startSeconds:e.start,endSeconds:e.end,durationSeconds:e.end==null?null:e.end-e.start,sponsorIds:spo.filter(s=>sponsorOnEvent(t,s.id,e)).map(s=>s.id)})),advanced:insightExport(insightData(t))}}}
window.exportTask=id=>{let t=db.tasks.find(x=>x.id===id);if(!t||!visibleTasks().some(x=>x.id===id))return;let s=JSON.stringify(exportObject(t),null,2),a=document.createElement('a'),url=URL.createObjectURL(new Blob([s],{type:'application/json'}));a.href=url;a.download=(t.number||'match')+'_sponsor_annotations.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('JSON exported — '+t.number)};
function render(){
 videoEl=null;
 if(!me()){
  mount(loginView(),()=>{
   document.getElementById('signInForm')?.addEventListener('submit',forgot?window.resetDemo:window.login);
  });
  return;
 }
 const pages={dashboard:['Dashboard',dashboard],tasks:['Match assignments',tasksView],studio:['Annotation studio',studio],sponsors:['Sponsor library',sponsorsView],attributes:['Tagging attributes',attrsView],users:['Analysts & access',usersView],reports:['Intelligence reports',reportsView]};
 if(me().role!=='admin'&&['users','sponsors','attributes'].includes(view))view='dashboard';
 const [title,fn]=pages[view]||pages.dashboard;
 mount(layout(title,'',fn()),()=>{
  if(view==='studio'){attachVideo();setSeekStep(seekStep)}
 });
}
refreshFixtureFeed();
const fixtureRefreshId=setInterval(refreshFixtureFeed,5*60*1000);
const onStorage=e=>{if(e.key===DBKEY){try{db=JSON.parse(e.newValue)}catch(err){return}if(!modalOpen)render()}};
window.addEventListener('storage',onStorage);
render();
optimizeStoredSponsorLogos();
return ()=>{
 clearInterval(fixtureRefreshId);
 window.removeEventListener('storage',onStorage);
 document.removeEventListener('keydown',runKeydown);
 document.getElementById('videofile')?.removeEventListener('change',handleVideoFileChange);
 for(const url of Object.values(localVideos))URL.revokeObjectURL(url);
};
}

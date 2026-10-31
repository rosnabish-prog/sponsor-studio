import type { StudioMount } from '../types/screen';
import type { AnnotationBase, CameraAnnotation, EventAnnotation, Fixture, Sponsor, SponsorAnnotation, StudioData, TaskSummary, TeamMember } from '../types/models';
import type { DialogModel } from '../components/StudioModals';
import { computeInsights } from '../domain/analytics';
import { annotatedEndpoint } from '../domain/labelingProgress';
import { PLACEMENT_TYPES, VISIBILITY_QUALITIES } from '../domain/classifications';
import { formatTimestamp as fmt, clampNumber as clamp, mergeIntervals as merged, intervalOverlap as overlap } from '../domain/intervals';
import { api, buildupVideoUrl, fromApiTask, type ApiMembership, type ApiUser } from '../api/client';
import { recoverVideo } from './videoRecovery';
import { persistStudio } from '../api/sync';
import { readStudioRoute, writeStudioRoute, type ProductView } from './routes';
import { normalizeHotkey, hotkeyFromKeyboard } from '../domain/hotkeys';
import { easternMatchDate, hasFinalResult, mergeTodayFixtureUpdates } from '../domain/fixtures';
import { MAX_CATALOG_BYTES, readOriginalPng } from '../domain/logoUpload';
import { copyCatalogEntry, reorderById, type CatalogKind, type DropPlacement } from '../domain/catalogEditing';
import { hasRecordedCameraAfter, nextSavedCameraStart, resumeCameraFromTimestamp, selectCameraAngle } from '../domain/cameraSwitch';
import { captureStudioSpacebar } from '../domain/studioKeyboard';
import { supportedPlaybackRate } from '../domain/videoPlayback';
import { retagSponsorFromTimestamp, nextSavedSponsorStart } from '../domain/sponsorRetag';
import { preserveAnnotationsOnRewind } from '../domain/annotationRewind';
import { editSingleInterval } from '../domain/isolatedInterval';
import { annotationChanges, lastAnnotatedTimestamp, nextBoundary, sameAnnotationContent, serverSnapshotMatchesRow, snapshotAnnotations, type AnnotationSnapshot, type UndoChange } from '../domain/annotationUndo';

export function initializeStudioController(mount: StudioMount) {
const uid=()=> 'id_'+Math.random().toString(36).slice(2,10);
const tstamp=()=>new Date().toISOString();

// A dated, curated snapshot of publicly listed 2026 fixtures. NOT a live feed.
let OFFICIAL_FIXTURES: Fixture[]=[
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
const BADGES: Record<string,string>={
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
const fixtureById=(id:string)=>OFFICIAL_FIXTURES.find(f=>f.id===id)||null;
let fixtureFeedLoaded=false,fixtureRefreshing=false;
const activelyRefreshedFixtures=new Set<string>();
async function refreshFixtureFeed(){
  try{
    const response=await fetch('data/fixtures.json',{cache:'no-store'});
    if(!response.ok)throw Error('Feed unavailable: '+response.status);
    const payload=await response.json();
    if(!Array.isArray(payload.matches)||payload.matches.length<10)throw Error('Incomplete feed');
    const safe=payload.matches.filter((f:Fixture)=>f&&typeof f.id==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(f.date)&&typeof f.home==='string'&&typeof f.away==='string');
    if(safe.length<10)throw Error('Invalid feed');
    if(!fixtureFeedLoaded){
      OFFICIAL_FIXTURES=safe;
      fixtureFeedLoaded=true;
    }else{
      const existing=new Map(OFFICIAL_FIXTURES.map(f=>[f.id,f]));
      OFFICIAL_FIXTURES=safe.map((f:Fixture)=>{
        const old=existing.get(f.id);
        // Do not roll back an already published final score or a manual live refresh.
        return old&&(hasFinalResult(old)||activelyRefreshedFixtures.has(f.id))?old:f;
      });
    }
    for(const team of payload.clubs||[]){
      if(team.name&&typeof team.logo==='string'&&/^https:\/\//.test(team.logo))BADGES[team.name]=team.logo;
    }
    fixtureSyncLabel='BuildUp public fixture feed · auto-synced';
    if(me()&&!modalOpen&&['tasks','dashboard'].includes(view))render();
  }catch(err){console.warn('Using bundled fixture snapshot:',err instanceof Error ? err.message : String(err))}
}
window.chooseFixtureDay=day=>{fixtureDay=day;render()};
window.refreshTodayMatches=async()=>{
 if(fixtureRefreshing)return;
 const day=easternMatchDate();fixtureRefreshing=true;render();
 try{
  const response=await api.refreshFixtures(day);
  const updated=mergeTodayFixtureUpdates(OFFICIAL_FIXTURES,response.matches,day);
  OFFICIAL_FIXTURES=updated.fixtures;
  for(const next of response.matches){if(next.date===day&&OFFICIAL_FIXTURES.some(f=>f.id===next.id&&!hasFinalResult(f)))activelyRefreshedFixtures.add(next.id);}
  fixtureSyncLabel=`Match results checked ${new Date(response.checkedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'})} ET`;
  notify(updated.changed?`${updated.changed} match${updated.changed===1?'':'es'} updated for ${day}. Completed matches preserved.`:`Today's match catalog is up to date. Completed results were not changed.`);
 }catch(error){notify(error instanceof Error?error.message:'Could not refresh matches. Existing results preserved.');}
 finally{fixtureRefreshing=false;render()}
};
// Match catalog links fixtures to existing tasks rather than creating duplicates.
const taskForFixture=(id:string)=>{
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
 const existing=taskForFixture(id);
 if(existing){window.openTask?.(existing.id);return}
 if(!isManager())return notify('An administrator must create the task first.');
 window.createTaskModal?.();
 const sel=document.getElementById('taskfixture') as HTMLSelectElement|null;
 if(sel){sel.value=id;window.selectFixture?.(id)}
};
let db:StudioData={users:[],sponsorGroups:[],eventGroups:[],cameraGroups:[],tasks:[]};
let fixtureDay='all';
let remoteUser:ApiUser|null=null,liveWorkspaces:ApiMembership[]=[],workspaceId='',catalogVersion=0;
let passwordChangeRequired=false;
let sessionPending=true;
const cloneStudio=(value:StudioData):StudioData=>JSON.parse(JSON.stringify(value)) as StudioData;
let shadow:StudioData=cloneStudio(db),syncDirty=false,syncRunning=false;
type TrackKey='sponsors'|'events'|'cameras';
type BackfillDraft={taskId:string;track:TrackKey;labelId:string;start:number;id:string};
type HiddenSponsors={taskId:string;resumeIds:string[]};
type UndoEntry={taskId:string;label:string;changes:UndoChange[];hiddenBefore:HiddenSponsors|null;hiddenAfter:HiddenSponsors|null};
const undoStacks=new Map<string,UndoEntry[]>();
let backfillDrafts:BackfillDraft[]=[];
let hiddenSponsors:HiddenSponsors|null=null;
let undoInProgress=false;
function cloneHidden(value:HiddenSponsors|null):HiddenSponsors|null{return value?{taskId:value.taskId,resumeIds:[...value.resumeIds]}:null;}
function rememberAnnotationChange(task:TaskSummary,before:AnnotationSnapshot,label:string,hiddenBefore:HiddenSponsors|null=hiddenSponsors){
 const changes=annotationChanges(before,snapshotAnnotations(task));
 if(!changes.length&&JSON.stringify(hiddenBefore)===JSON.stringify(hiddenSponsors))return false;
 const stack=undoStacks.get(task.id)||[];
 stack.push({taskId:task.id,label,changes,hiddenBefore:cloneHidden(hiddenBefore),hiddenAfter:cloneHidden(hiddenSponsors)});
 undoStacks.set(task.id,stack.slice(-10));
 return true;
}
function recordAnnotationChange(task:TaskSummary,before:AnnotationSnapshot,label:string,hiddenBefore:HiddenSponsors|null=hiddenSponsors){
 if(rememberAnnotationChange(task,before,label,hiddenBefore))save();
 refreshStudio();
}
function rekeyUndoRow(previous:string,now:string){
 for(const stack of undoStacks.values())for(const entry of stack)for(const change of entry.changes){
  if(change.id===previous)change.id=now;
  if(change.before?.id===previous)change.before.id=now;
  if(change.after?.id===previous)change.after.id=now;
 }
}
async function syncLive() {
 if(syncRunning)return;
 syncRunning=true;
 try {
  while(syncDirty&&workspaceId) {
   syncDirty=false;
   const next=cloneStudio(db);
   catalogVersion=await persistStudio(workspaceId,shadow,next,catalogVersion,(kind,previous,now)=>{
    if(kind==='task'){
     const task=db.tasks.find(t=>t.id===previous);if(task)task.id=now;
     if(selectedTaskId===previous)selectedTaskId=now;
     if(reportTaskId===previous)reportTaskId=now;
    }else{
     for(const task of db.tasks)for(const row of [...task.sponsors,...task.events,...task.cameras])if(row.id===previous)row.id=now;
     rekeyUndoRow(previous,now);
    }
   },(annotationId,revision)=>{
    for(const task of db.tasks)for(const row of [...task.sponsors,...task.events,...task.cameras])
     if(row.id===annotationId)row.revision=revision;
   });
   shadow=next;
  }
 }catch(error) {
  syncDirty=false;
  notify('Server rejected a change: '+(error instanceof Error?error.message:String(error))+'. Reloading saved data.');
  await loadWorkspace(workspaceId).catch(()=>notify('Could not refresh workspace. Check your connection.'));
 }finally{syncRunning=false;if(syncDirty)void syncLive();render()}
}
const save=()=>{if(workspaceId){syncDirty=true;void syncLive()}};
let logged='';
async function loadWorkspace(id:string) {
 const [catalog,members,tasks]=await Promise.all([api.catalog(id),api.members(id),api.tasks(id)]);
 catalogClipboard=null;
 const definitions=catalog.payload;
 db={
  users:members.map(m=>({id:m.user.id,name:m.user.name,email:m.user.email,role:m.role==='OWNER'?'owner':m.role==='ADMIN'?'admin':m.role==='VIEWER'?'viewer':'analyst',password:''})),
  sponsorGroups:definitions.sponsorGroups||[],eventGroups:definitions.eventGroups||[],cameraGroups:definitions.cameraGroups||[],
  tasks:tasks.map(fromApiTask),
 };
 for(const group of db.eventGroups)for(const item of group.items)item.kind='range';
 workspaceId=id;catalogVersion=catalog.version;shadow=cloneStudio(db);
 syncDirty=false;sessionPending=false;
 // Keep the URL-selected page on reload; only recover when its task is inaccessible.
 if(view==='studio'&&(me()?.role==='viewer'||!visibleTasks().some(task=>task.id===selectedTaskId))){
  selectedTaskId='';view='tasks';writeStudioRoute(view,'',true);
 }
 if(!window.location.hash)writeStudioRoute(view,view==='studio'?selectedTaskId:reportTaskId,true);
 render();
}
async function loadLiveSession() {
 const sessionInfo=await api.me();remoteUser=sessionInfo.user;logged=remoteUser.id;
 passwordChangeRequired=!!remoteUser.passwordChangeRequired;
 if(passwordChangeRequired){workspaceId='';liveWorkspaces=[];sessionPending=false;render();return;}
 liveWorkspaces=await api.workspaces();
 if(liveWorkspaces.length)await loadWorkspace(liveWorkspaces[0].workspace.id);
 else{workspaceId='';sessionPending=false;render()}
}
const initialRoute=readStudioRoute();
let view: ProductView=initialRoute.view;
let selectedTaskId=initialRoute.view==='studio'?initialRoute.taskId:'',reportTaskId=initialRoute.view==='reports'?initialRoute.taskId:'',taskFilter='all',insightFocusId='',fixtureSyncLabel='Bundled schedule';
let studioTab:'all'|'sponsors'|'events'|'cameras'='all';
let tick=0,seekStep=5,videoEl:HTMLVideoElement|null=null,modalOpen=false;
let editingInterval:{key:'sponsors'|'events'|'cameras';id:string;start:number;end:number}|null=null;
const localVideos:Record<string,{url:string;name:string}>={};
const videoDurations:Record<string,number>={};
function clearLocalVideos(){for(const video of Object.values(localVideos))URL.revokeObjectURL(video.url);for(const id of Object.keys(localVideos))delete localVideos[id];for(const id of Object.keys(videoDurations))delete videoDurations[id];}
const me=()=>db.users.find(x=>x.id===logged)||(remoteUser&&logged?{...remoteUser,password:'',role:'viewer' as const}:undefined);const currentTask=()=>db.tasks.find(x=>x.id===selectedTaskId);const reportTask=()=>db.tasks.find(x=>x.id===reportTaskId)||db.tasks[0];const visibleTasks=()=>isManager()||me()?.role==='viewer'?db.tasks:db.tasks.filter(t=>t.sponsorAnalystId===logged||t.contextAnalystId===logged);
const isManager=():boolean=>me()?.role==='owner'||me()?.role==='admin';
const taskStatus=(t:TaskSummary):'ready'|'progress'|'done'=>t.submitted?.sponsors&&t.submitted?.context?'done':t.sponsors.length||t.events.length||t.cameras.length||t.submitted?.sponsors||t.submitted?.context?'progress':'ready';
const foundUser=(id:string)=>db.users.find(u=>u.id===id);const nameUser=(id:string)=>foundUser(id)?.name||'Unassigned';
const allowed=(t:TaskSummary,kind:'sponsors'|'context')=>isManager()||(me()?.role==='analyst'&&((kind==='sponsors'?t.sponsorAnalystId:t.contextAnalystId)===logged));
const canEdit=(t:TaskSummary,kind:'sponsors'|'context')=>!undoInProgress&&allowed(t,kind)&&!(t.submitted?.[kind]);
const sponsorFor=(t:TaskSummary)=>db.sponsorGroups.filter(g=>t.sponsorGroupIds.includes(g.id)).flatMap(g=>g.sponsors.map(s=>({...s,groupName:g.name}))).filter((s,i,a)=>a.findIndex(v=>v.id===s.id)===i);
const eventsFor=(t:TaskSummary)=>db.eventGroups.filter(g=>t.eventGroupIds.includes(g.id)).flatMap(g=>g.items);
const camerasFor=(t:TaskSummary)=>db.cameraGroups.filter(g=>t.cameraGroupIds.includes(g.id)).flatMap(g=>g.items);
const labelFor=(t:TaskSummary,type:'sponsors'|'events'|'cameras',id:string)=>({sponsors:sponsorFor(t),events:eventsFor(t),cameras:camerasFor(t)})[type].find(i=>i.id===id)?.name||id;
// Each presence interval has one optional primary placement and one optional visibility-quality rating.
// Unclassified intervals stay unclassified; do not infer placement or readability from sponsor identity.
const videoDuration=(t:TaskSummary)=>videoDurations[t.id]||t.duration||3600;
const seconds=(t:TaskSummary)=>clamp(tick,0,videoDuration(t));
const insightData=(t:TaskSummary)=>computeInsights(t,{sponsors:sponsorFor(t),events:eventsFor(t),cameras:camerasFor(t)});
function notify(message:string){window.dispatchEvent(new CustomEvent('studio-toast',{detail:message}));}
let pendingInAppConfirm:(()=>void)|null=null;
function openDialog(model:DialogModel){modalOpen=true;window.dispatchEvent(new CustomEvent('studio-dialog',{detail:model}));}
window.closeModal=()=>{modalOpen=false;pendingInAppConfirm=null;window.dispatchEvent(new CustomEvent('studio-dialog',{detail:null}));};
function confirmInApp(title:string,message:string,onAccept:()=>void,{actionLabel='REMOVE',danger=true}:{actionLabel?:string;danger?:boolean}={}){
 if(modalOpen)return notify('Close the current dialog first.');
 pendingInAppConfirm=onAccept;
 openDialog({type:'confirm',title,message,actionLabel,danger});
}
window.acceptInAppConfirm=()=>{
 const action=pendingInAppConfirm;
 if(!action)return;
 window.closeModal?.();
 action();
};
const formVal=(id:string)=>(document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value||'';
window.changeOwnPassword=async e=>{
 e.preventDefault();if(!passwordChangeRequired)return;
 const password=formVal('newpwd');
 if(password!==formVal('confirmnewpwd')){
  const err=document.getElementById('authError');if(err)err.textContent='The passwords do not match.';
  return;
 }
 try{
  await api.changePassword(formVal('currentpwd'),password);
  logged='';remoteUser=null;passwordChangeRequired=false;workspaceId='';
  render();notify('Password updated. Sign in with your new password.');
 }catch(error){const err=document.getElementById('authError');if(err)err.textContent=error instanceof Error?error.message:'Could not change password';}
};
window.login=async e=>{
 e.preventDefault();const email=formVal('loginemail').trim().toLowerCase(),pwd=formVal('loginpass');
 try{const result=await api.login({email,password:pwd});remoteUser=result.user;await loadLiveSession()}catch(error){const err=document.getElementById('authError');if(err)err.textContent=error instanceof Error?error.message:'Sign in failed';}
};
window.selectWorkspace=id=>{if(liveWorkspaces.some(w=>w.workspace.id===id)){view='dashboard';selectedTaskId='';writeStudioRoute(view);void loadWorkspace(id).catch(error=>notify('Workspace load failed: '+error.message))}};
window.logout=()=>{if(backfillDrafts.length)return notify('End your in-progress gap tags before signing out so their intervals can be saved.');void api.logout().catch(()=>{});logged='';remoteUser=null;passwordChangeRequired=false;workspaceId='';liveWorkspaces=[];catalogClipboard=null;selectedTaskId='';view='dashboard';writeStudioRoute(view,'',true);if(videoEl){videoEl.pause()}clearLocalVideos();render()};
window.showWorkspaceSwitcher=()=>{if(!flushBackfills(currentTask()))return;workspaceId='';render()};
window.navigate=(v)=>{if(v==='workspace'){window.showWorkspaceSwitcher?.();return}if(v==='loading')return;if(!flushBackfills(currentTask()))return;view=me()?.role==='viewer'?'reports':v==='login'?'dashboard':v;if(videoEl){videoEl.pause()}selectedTaskId='';editingInterval=null;writeStudioRoute(view);render();window.scrollTo(0,0)};
function restoreRoute(){const route=readStudioRoute();if((route.view!=='studio'||route.taskId!==selectedTaskId)&&!flushBackfills(currentTask())){writeStudioRoute(view,selectedTaskId,true);return;}view=route.view;selectedTaskId=view==='studio'?route.taskId:'';reportTaskId=view==='reports'?route.taskId:reportTaskId;if(videoEl)videoEl.pause();if(workspaceId)render();window.scrollTo(0,0)}
window.addEventListener('popstate',restoreRoute);
window.addEventListener('hashchange',restoreRoute);
window.closeTaskMenu=()=>{const menu=document.getElementById('taskActionMenu') as HTMLDetailsElement|null;if(menu)menu.open=false};
function dismissActionMenu(e:PointerEvent){
 const menu=document.getElementById('taskActionMenu') as HTMLDetailsElement|null;
 if(menu?.open&&!menu.contains(e.target as Node))menu.open=false;
}
document.addEventListener('pointerdown',dismissActionMenu);
window.openTask=id=>{
 if(me()?.role==='viewer')return notify('Viewers may access Insights and JSON exports only.');
 if(!visibleTasks().some(task=>task.id===id))return notify('This task is not available in your workspace.');
 if(selectedTaskId!==id&&!flushBackfills(currentTask()))return;
 videoRecovery?.dispose();videoRecovery=null;videoError='';
 selectedTaskId=id;view='studio';tick=0;studioTab='all';editingInterval=null;writeStudioRoute(view,id);render();window.scrollTo(0,0);
 const asset=db.tasks.find(t=>t.id===id)?.videoAssetId;
  if(asset&&!localVideos[id]){void api.playback(workspaceId,id,asset).then(result=>{
  const task=db.tasks.find(t=>t.id===id);if(!task)return;
  task.videoUrl=result.url;task.videoType='s3';task.videoName=result.filename;
  if(selectedTaskId===id)render();
 }).catch(error=>notify('Private video playback unavailable: '+error.message))}
};
window.setFilter=s=>{taskFilter=s;render()};
function studioSidebarHeading(){
 if(studioTab==='events')return {title:'KEY MATCH EVENTS',hint:'Tap a match event to start an interval. Tap again to stop it.'};
 if(studioTab==='cameras')return {title:'CAMERA ANGLES',hint:'One camera at a time. Selecting another angle automatically switches at the playhead.'};
 return {title:'SPONSORS',hint:'Tap a sponsor to switch between OFF and LIVE.'};
}
 window.setExposureAttribute=(id,field,value)=>{
 const t=currentTask();if(!t||!canEdit(t,'sponsors'))return;
 const choices=field==='placement'?PLACEMENT_TYPES:field==='quality'?VISIBILITY_QUALITIES:null;
 if(!choices||!['',...choices.map(x=>x[0])].includes(value))return;
 const item=t.sponsors.find(x=>x.id===id);
 if(!item)return;
 const before=snapshotAnnotations(t);
 item[field]=value||null;
 recordAnnotationChange(t,before,'Change sponsor '+field);notify('Sponsor exposure '+(field==='placement'?'placement':'quality')+' saved');
};
window.setStudioTab=k=>{if(!['all','sponsors','events','cameras'].includes(k))return;studioTab=k;refreshStudio();};
function refreshStudio(){if(currentTask()&&view==='studio')render();}
// Actions tagged at the same video timestamp are corrections, not zero-duration annotations.
const SAME_TIME_TOLERANCE=0.2;
const sameVideoTimestamp=(a:number,b:number)=>Math.abs(Number(a)-Number(b))<=SAME_TIME_TOLERANCE;
function recordedAt<T extends {start:number;end:number|null}>(rows:T[],at:number):T|undefined {
 return rows.find(row=>row.end!==null&&((row.start<=at&&at<row.end)||('kind' in row&&row.kind==='point'&&Math.abs(row.start-at)<.5)));
}
function draftFor(task:TaskSummary,track:TrackKey,labelId:string){
 return backfillDrafts.find(draft=>draft.taskId===task.id&&draft.track===track&&draft.labelId===labelId);
}
function beginBackfill(task:TaskSummary,track:TrackKey,labelId:string,at:number){
 if(draftFor(task,track,labelId))return false;
 backfillDrafts.push({taskId:task.id,track,labelId,start:at,id:uid()});
 notify(`Recording the gap from ${fmt(at)}. End this tag to save it; existing later annotations will stay untouched.`);
 refreshStudio();return true;
}
function finishBackfill(task:TaskSummary,draft:BackfillDraft,at:number,record=true){
 if(at-draft.start<=SAME_TIME_TOLERANCE){
  notify('This tag has not advanced beyond its start. Seek forward before ending it; the existing selection was preserved.');
  return false;
 }
 const rows=task[draft.track];
 const boundary=nextBoundary(rows,draft.start);
 const end=Math.min(at,boundary??at,videoDuration(task));
 if(end-draft.start<=SAME_TIME_TOLERANCE){notify('The available gap has no positive duration. No annotation was changed.');return false;}
 const overlaps=rows.some(row=>row.start<end&&(row.end===null||row.end>draft.start)&&
  (draft.track==='cameras'||draft.track==='sponsors'&&'sponsorId' in row&&row.sponsorId===draft.labelId||draft.track==='events'&&'eventId' in row&&row.eventId===draft.labelId));
 if(overlaps){notify('Another saved interval now occupies this gap. Nothing was overwritten; review the timeline before ending this draft.');return false;}
 backfillDrafts=backfillDrafts.filter(row=>row!==draft);
 const before=snapshotAnnotations(task);
 const base={id:draft.id,start:draft.start,end,createdBy:logged,createdAt:tstamp()};
 if(draft.track==='sponsors')task.sponsors.push({...base,sponsorId:draft.labelId});
 else if(draft.track==='events')task.events.push({...base,eventId:draft.labelId,kind:'range'});
 else task.cameras.push({...base,cameraId:draft.labelId});
 if(record)recordAnnotationChange(task,before,'Finish gap annotation');
 return true;
}
function finishBoundaryDrafts(task:TaskSummary,at:number){
 for(const draft of [...backfillDrafts]){
  if(draft.taskId!==task.id)continue;
  const boundary=nextBoundary(task[draft.track],draft.start);
  if(boundary!==null&&at>=boundary)finishBackfill(task,draft,boundary);
 }
}
function preserveGapDraftsOnRewind(task:TaskSummary,from:number){
 for(const draft of [...backfillDrafts]){
  if(draft.taskId===task.id&&from-draft.start>SAME_TIME_TOLERANCE)
   finishBackfill(task,draft,from);
 }
}
function flushBackfills(task:TaskSummary|undefined):boolean{
 if(!task)return true;
 const pending=[...backfillDrafts.filter(row=>row.taskId===task.id)];
 const at=seconds(task);
 if(pending.some(draft=>at-draft.start<=SAME_TIME_TOLERANCE)){
  notify('An earlier gap tag is still open. Return to its start, advance playback, and end the tag before leaving. No labels were deleted.');
  return false;
 }
 for(const draft of pending)if(!finishBackfill(task,draft,at))return false;
 return true;
}
function warnOnGapDraftUnload(event:BeforeUnloadEvent){
 if(!backfillDrafts.length)return;
 event.preventDefault();event.returnValue='';
}
window.addEventListener('beforeunload',warnOnGapDraftUnload);
window.jumpToLastAnnotation=()=>{
 const task=currentTask();if(!task)return;
 const last=lastAnnotatedTimestamp(task);
 if(last===null)return notify('No saved annotation exists yet.');
 window.seekVideo?.(last);
 notify(`Jumped to the last annotated timestamp: ${fmt(last)}.`);
};
window.undoLastAnnotationChange=async()=>{
 const task=currentTask();if(!task||!workspaceId)return;
 if(undoInProgress)return notify('Undo is already in progress.');
 if(backfillDrafts.some(draft=>draft.taskId===task.id))return notify('End the current gap tag before undoing a saved change.');
 if(syncDirty||syncRunning)return notify('Wait until the last annotation finishes saving before undoing.');
 const stack=undoStacks.get(task.id),entry=stack?.at(-1);
 if(!entry)return notify('No annotation changes to undo in this session.');
 if(entry.changes.some(change=>{
  const present=task[change.track].find(row=>row.id===change.id)||null;
  return !sameAnnotationContent(present as (typeof change.after),change.after);
 }))return notify('An annotation changed since that action. Undo was stopped to protect saved work.');
 if(entry.changes.some(change=>!canEdit(task,change.track==='sponsors'?'sponsors':'context')))
  return notify('This annotation stream is no longer editable.');
 undoInProgress=true;
 try{
  // Preflight all targets before any write, including edits from other workers.
  const histories=new Map<string,Awaited<ReturnType<typeof api.annotationHistory>>>();
  const previousVersions=new Map<string,number>();
  for(const change of entry.changes){
   const history=await api.annotationHistory(workspaceId,task.id,change.id);
   const latest=history[0];
   if(!latest)throw new Error('A selected annotation has no saved revision history.');
   const expected=change.after??change.before;
   if(!expected||!serverSnapshotMatchesRow(latest.snapshot,expected))
    throw new Error('A selected annotation changed on the server; nothing was overwritten.');
   if(change.after&&latest.snapshot.deletedAt!==null||!change.after&&latest.snapshot.deletedAt===null)
    throw new Error('The selected annotation has an unexpected saved state.');
   if(change.before){
    // A local action can be queued while another is syncing. Never assume
    // its client-side revision counter identifies the earlier saved content.
    // An exact server snapshot must exist before we attempt a restore.
    const previous=history.find(row=>row.snapshot.deletedAt===null&&serverSnapshotMatchesRow(row.snapshot,change.before!));
    if(!previous)throw new Error('The exact earlier saved version is unavailable. No annotation was changed.');
    previousVersions.set(change.id,previous.version);
   }
   histories.set(change.id,history);
  }
  // Remove creations before restoring closed intervals that used to be LIVE.
  for(const change of entry.changes.filter(change=>!change.before&&change.after)){
   const history=histories.get(change.id)!;
   await api.removeAnnotation(workspaceId,task.id,change.id,history[0].version);
  }
  for(const change of entry.changes.filter(change=>!!change.before)){
   const history=histories.get(change.id)!;
   await api.restoreAnnotation(workspaceId,task.id,change.id,previousVersions.get(change.id)!,history[0].version);
  }
  stack!.pop();hiddenSponsors=cloneHidden(entry.hiddenBefore);
  backfillDrafts=backfillDrafts.filter(draft=>draft.taskId!==task.id);
  await loadWorkspace(workspaceId);
  notify(`Undid: ${entry.label}. Only that action's annotation IDs were restored.`);
 }catch(error){
  await loadWorkspace(workspaceId).catch(()=>{});
  notify('Undo stopped: '+(error instanceof Error?error.message:String(error))+'. Check the annotation history before retrying.');
 }finally{undoInProgress=false;refreshStudio();}
};
function preserveOpenAnnotationsOnRewind(task:TaskSummary, from:number) {
 let closed=0;
 const before=snapshotAnnotations(task);
 const close=<T extends {start:number;end:number|null;createdBy:string}>(rows:T[]):T[]=>{
  const result=preserveAnnotationsOnRewind(rows,logged,from);
  closed+=result.closed;return result.rows;
 };
 if(canEdit(task,'sponsors'))task.sponsors=close(task.sponsors);
 if(canEdit(task,'context')){task.events=close(task.events);task.cameras=close(task.cameras);}
 if(closed){recordAnnotationChange(task,before,'Close LIVE annotations before rewind');notify(`${closed} LIVE interval${closed===1?'':'s'} saved at ${fmt(from)} before rewinding. No labels were deleted.`)}
}
window.editRecordedAnnotation=(key,id)=>{
 const task=currentTask(),row=task?.[key].find(entry=>entry.id===id);
 if(!task||!row||row.end===null||!canEdit(task,key==='sponsors'?'sponsors':'context'))return;
 const name=labelFor(task,key,key==='sponsors'?(row as SponsorAnnotation).sponsorId:key==='events'?(row as EventAnnotation).eventId:(row as CameraAnnotation).cameraId);
 confirmInApp('Edit recorded interval',`You are about to change the saved ${name} interval (${fmt(row.start)}–${fmt(row.end!)}). Continue to the editor?`,()=>{
  editingInterval={key,id,start:row.start,end:row.end!};
  refreshStudio();notify('Drag either edge of the highlighted timeline segment, then Save.');
 },{actionLabel:'CONTINUE TO EDIT',danger:false});
};
window.retagRecordedSponsor=(id,at)=>{
 const task=currentTask(),row=task?.sponsors.find(entry=>entry.id===id);
 if(!task||!row||row.end===null||!canEdit(task,'sponsors')||!Number.isFinite(at)||at<row.start||at>=row.end)return;
 if(task.sponsors.some(entry=>entry.sponsorId===row.sponsorId&&entry.end===null))return notify('End the current LIVE sponsor tag before re-tagging saved footage.');
 const name=labelFor(task,'sponsors',row.sponsorId);
 videoEl?.pause();
 confirmInApp('Re-tag sponsor from here',`Start ${name} LIVE at ${fmt(at)}? The saved interval (${fmt(row.start)}–${fmt(row.end)}) will end at ${fmt(at)}. Earlier tags and later separate appearances are kept.`,()=>{
  const current=currentTask();
  if(!current||!canEdit(current,'sponsors'))return;
  const next=retagSponsorFromTimestamp(current.sponsors,id,at,logged,tstamp(),uid);
  if(!next)return notify('This saved interval changed. Seek to it and try again.');
  const before=snapshotAnnotations(current);
  current.sponsors=next;
  editingInterval=null;
  recordAnnotationChange(current,before,`Re-tag ${name}`);notify(`${name} LIVE from ${fmt(at)}.`);
 },{actionLabel:'RE-TAG FROM HERE',danger:false});
};
window.cancelTimelineEdit=()=>{editingInterval=null;refreshStudio()};
window.saveTimelineEdit=(key,id,start,end)=>{
 const task=currentTask(),row=task?.[key].find(entry=>entry.id===id);
 if(!task||!row||row.end===null||!canEdit(task,key==='sponsors'?'sponsors':'context'))return;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>videoDuration(task))return notify('The adjusted interval must remain within the video and have a positive duration.');
 const before=snapshotAnnotations(task);
 const result=key==='sponsors'
  ?editSingleInterval(task.sponsors,id,start,end,(a,b)=>a.sponsorId===b.sponsorId)
  :key==='events'
   ?editSingleInterval(task.events,id,start,end,(a,b)=>a.eventId===b.eventId)
   :editSingleInterval(task.cameras,id,start,end,()=>true);
 if(result==='overlap')return notify('This edit overlaps another interval in the same timeline. No annotations were changed.');
 if(result!=='updated')return notify('The selected interval no longer exists. Refresh before editing.');
 editingInterval=null;recordAnnotationChange(task,before,'Edit selected interval');notify('Annotation interval updated');
};
window.tagSponsor=id=>{
 const t=currentTask();if(!t||!canEdit(t,'sponsors'))return;
 if(hiddenSponsors?.taskId===t.id)return notify('Sponsors are hidden. Select UNHIDE ALL to resume tagging.');
 const at=seconds(t),draft=draftFor(t,'sponsors',id);
 if(draft){finishBackfill(t,draft,at);return;}
 const active=t.sponsors.find(x=>x.sponsorId===id&&x.end==null&&x.start<=at);
 if(!active){
  const recorded=recordedAt(t.sponsors.filter(row=>row.sponsorId===id),at);
  if(recorded)return window.retagRecordedSponsor?.(recorded.id,at);
  if(t.sponsors.some(row=>row.sponsorId===id&&row.end===null&&row.start>at)){
   beginBackfill(t,'sponsors',id,at);return;
  }
 }
 const before=snapshotAnnotations(t);
 if(active){
  if(sameVideoTimestamp(at,active.start)){
   t.sponsors=t.sponsors.filter(x=>x.id!==active.id);
   recordAnnotationChange(t,before,'Cancel new sponsor tag');notify('Sponsor event removed — same timestamp');return;
  }
  const nextStart=nextSavedSponsorStart(t.sponsors,id,active.start);
  active.end=nextStart!==null&&at>nextStart?nextStart:at;
  if(active.end!==at)notify(`Sponsor tag ended at ${fmt(active.end)} to preserve the next saved appearance.`);
 }else{
  t.sponsors.push({id:uid(),sponsorId:id,start:at,end:null,createdBy:logged,createdAt:tstamp()});
 }
 recordAnnotationChange(t,before,active?'End sponsor visibility':'Start sponsor visibility');
};
window.toggleHideAllSponsors=()=>{
 const task=currentTask();if(!task||!canEdit(task,'sponsors'))return;
 const at=seconds(task),before=snapshotAnnotations(task),hiddenBefore=cloneHidden(hiddenSponsors);
 if(hiddenSponsors?.taskId===task.id){
  const resumeIds=[...hiddenSponsors.resumeIds];
  hiddenSponsors=null;
  for(const id of resumeIds){
   // Existing recorded exposures and future LIVE tags must never be altered by UNHIDE.
   if(recordedAt(task.sponsors.filter(row=>row.sponsorId===id),at))continue;
   if(task.sponsors.some(row=>row.sponsorId===id&&row.end===null&&row.start<=at))continue;
   if(task.sponsors.some(row=>row.sponsorId===id&&row.end===null&&row.start>at)){
    beginBackfill(task,'sponsors',id,at);continue;
   }
   task.sponsors.push({id:uid(),sponsorId:id,start:at,end:null,createdBy:logged,createdAt:tstamp()});
  }
  recordAnnotationChange(task,before,'Unhide sponsors',hiddenBefore);
  notify(resumeIds.length?'Sponsor visibility resumed at the current timestamp.':'Sponsor tagging enabled. Select a visible sponsor to begin.');
 }else{
  const resumeIds=new Set(task.sponsors.filter(row=>row.end===null&&row.start<=at).map(row=>row.sponsorId));
  for(const draft of [...backfillDrafts.filter(row=>row.taskId===task.id&&row.track==='sponsors')]){
   resumeIds.add(draft.labelId);
   finishBackfill(task,draft,at,false);
  }
  for(const row of [...task.sponsors]){
   if(row.end!==null||row.start>at)continue;
   if(sameVideoTimestamp(row.start,at)){
    // A tiny positive interval avoids destructive bulk deletion when Hide All
    // follows simultaneous just-started sponsors in the same video frame.
    if(row.start+0.01<=videoDuration(task))row.end=row.start+0.01;
    else task.sponsors=task.sponsors.filter(item=>item.id!==row.id);
   }
   else row.end=at;
  }
  hiddenSponsors={taskId:task.id,resumeIds:[...resumeIds]};
  recordAnnotationChange(task,before,'Hide all sponsors',hiddenBefore);
  notify('All currently LIVE sponsors ended here. UNHIDE ALL starts new intervals for the same visible sponsors.');
 }
};
window.tagEvent=id=>{
 const t=currentTask();if(!t||!canEdit(t,'context'))return;
 if(!eventsFor(t).some(x=>x.id===id))return;
 const at=seconds(t),draft=draftFor(t,'events',id);
 if(draft){finishBackfill(t,draft,at);return;}
 const active=t.events.find(x=>x.eventId===id&&x.end==null&&x.start<=at);
 if(!active){
  const recorded=recordedAt(t.events.filter(row=>row.eventId===id),at);
  if(recorded)return window.editRecordedAnnotation?.('events',recorded.id);
  if(t.events.some(row=>row.eventId===id&&row.end===null&&row.start>at)){
   beginBackfill(t,'events',id,at);return;
  }
 }
 const before=snapshotAnnotations(t);
 if(active){
  if(sameVideoTimestamp(at,active.start)){
   t.events=t.events.filter(x=>x.id!==active.id);
   recordAnnotationChange(t,before,'Cancel new match event');notify('Key event removed — same timestamp');return;
  }
  const boundary=nextBoundary(t.events.filter(row=>row.eventId===id),active.start);
  active.end=Math.min(at,boundary??at);
 }else{
  t.events.push({id:uid(),eventId:id,kind:'range',start:at,end:null,createdBy:logged,createdAt:tstamp()});
 }
 recordAnnotationChange(t,before,active?'End match event':'Start match event');
};
window.tagCamera=id=>{
 const t=currentTask();if(!t||!canEdit(t,'context'))return;
 if(!camerasFor(t).some(x=>x.id===id))return;
 const at=seconds(t),draft=backfillDrafts.find(row=>row.taskId===t.id&&row.track==='cameras');
 if(draft){
  finishBackfill(t,draft,at);
  if(draft.labelId===id)return;
  if(t.cameras.some(row=>row.end===null&&row.start>at)){
   beginBackfill(t,'cameras',id,at);return;
  }
 }
 const active=t.cameras.find(x=>x.cameraId===id&&x.end==null&&x.start<=at);
 const futureLive=t.cameras.find(x=>x.end===null&&x.start>at);
 if(futureLive){beginBackfill(t,'cameras',id,at);return;}
 const otherLive=t.cameras.find(x=>x.end===null&&x.cameraId!==id);
 const currentLive=t.cameras.find(x=>x.end===null);
 const nextSaved=currentLive?nextSavedCameraStart(t.cameras,currentLive.start):null;
 if(currentLive&&nextSaved!==null&&at>nextSaved)return notify(`This camera tag reached another saved interval at ${fmt(nextSaved)}. Return there to edit that interval separately.`);
 if(!active&&hasRecordedCameraAfter(t.cameras,at)){
  if(otherLive)return notify('End the current LIVE camera interval before editing saved footage.');
  const crossing=t.cameras.find(row=>row.end!==null&&row.start<=at&&at<row.end);
  videoEl?.pause();
  confirmInApp('Resume camera tagging',`Start LIVE camera tagging from ${fmt(at)}? ${crossing?'Only the saved interval at this timestamp will be split.':'This timestamp is between saved intervals.'} Every other recorded camera interval is preserved.`,()=>{
   const current=currentTask();
   if(!current||!canEdit(current,'context'))return;
   if(current.cameras.some(row=>row.end===null))return notify('End the current LIVE camera interval first.');
   const before=snapshotAnnotations(current);
   current.cameras=resumeCameraFromTimestamp(current.cameras,id,at,logged,tstamp(),uid).rows;
   editingInterval=null;
   recordAnnotationChange(current,before,'Resume camera from saved footage');notify(`Camera LIVE from ${fmt(at)}. Other recorded intervals were preserved.`);
  },{actionLabel:'RE-TAG FROM HERE',danger:false});
  return;
 }
 const before=snapshotAnnotations(t);
 const result=selectCameraAngle(t.cameras,id,at,logged,tstamp(),uid);
 t.cameras=result.rows;
 recordAnnotationChange(t,before,'Switch camera angle');
 if(result.action==='switched')notify('Camera switched — previous interval ended automatically.');
 if(result.action==='cancelled')notify('Camera interval removed — same timestamp.');
};
window.deleteLog=(key,id)=>{const t=currentTask(),kind=key==='sponsors'?'sponsors':'context';if(!t||!canEdit(t,kind))return;confirmInApp('Remove annotation','Hide this recorded annotation? You can restore it from Annotation History.',()=>{
  const before=snapshotAnnotations(t);
  if(key==='sponsors')t.sponsors=t.sponsors.filter(x=>x.id!==id);
  else if(key==='events')t.events=t.events.filter(x=>x.id!==id);
  else t.cameras=t.cameras.filter(x=>x.id!==id);
  recordAnnotationChange(t,before,'Remove selected annotation');notify('Annotation removed');
 },{actionLabel:'REMOVE ANNOTATION'});};
window.restoreAnnotationRevision=async(id,version,expectedRevision)=>{
 const task=currentTask();
 if(!task||!workspaceId||syncRunning||syncDirty)throw new Error('Wait for pending annotation changes to finish before restoring.');
 const itemHistory=await api.annotationHistory(workspaceId,task.id,id);
 const latest=itemHistory[0];
 if(!latest||latest.version!==expectedRevision)throw new Error('This annotation changed. Refresh its history and try again.');
 await api.restoreAnnotation(workspaceId,task.id,id,version,expectedRevision);
 await loadWorkspace(workspaceId);
 window.dispatchEvent(new CustomEvent('annotation-history-updated',{detail:id}));
 notify('Only the selected annotation was restored. Other timelines were left unchanged.');
};
window.seekVideo=val=>{const t=currentTask();if(!t)return;const next=clamp(Number(val)||0,0,videoDuration(t));if(next<tick-0.2){preserveGapDraftsOnRewind(t,tick);preserveOpenAnnotationsOnRewind(t,tick)}tick=next;finishBoundaryDrafts(t,tick);protectFutureIntervals(t,tick);videoRecovery?.seek(tick);if(videoEl&&!videoRecovery?.isRecovering()&&Number.isFinite(videoEl.duration)){try{videoEl.currentTime=clamp(tick,0,videoEl.duration)}catch{}}recordTick();refreshStudio();};
window.skipVideo=(n:number)=>window.seekVideo?.((videoEl&&!videoRecovery?.isRecovering()&&Number.isFinite(videoEl.currentTime)?videoEl.currentTime:tick)+n);
window.skipByStep=direction=>window.skipVideo?.((Number(direction)||0)*seekStep);
window.setSeekStep=value=>{seekStep=value===10?10:5;refreshStudio();};
 window.togglePlay=()=>{if(!videoEl)return notify('Attach a video to play. You can still scrub timestamps to test tagging.');if(videoRecovery){videoRecovery.toggle();refreshStudio();return;}if(videoEl.paused){videoEl.play().catch(()=>notify('Video playback unavailable for this source.'))}else videoEl.pause()};
window.setPlaybackRate=value=>{if(!supportedPlaybackRate(value))return;playbackRate=value;if(videoEl)videoEl.playbackRate=value;refreshStudio();};
 let playbackRate=1,videoDimensions='',videoError='';
 let videoRecovery:ReturnType<typeof recoverVideo>|null=null;
function recordTick(){const t=currentTask();if(t)t.observedTime=Math.max(t.observedTime||0,tick);}
function protectFutureIntervals(task:TaskSummary,at:number){
 const before=snapshotAnnotations(task);
 let closed=0;
 const protect=<T extends AnnotationBase>(rows:T[],allowed:boolean,select:(row:T)=>T[])=>{
  if(!allowed)return;
  for(const row of rows){
   if(row.end!==null||row.start>at)continue;
   const boundary=nextBoundary(select(row),row.start);
   if(boundary!==null&&at>=boundary){row.end=boundary;closed++;}
  }
 };
 protect(task.sponsors,canEdit(task,'sponsors'),row=>task.sponsors.filter(item=>item.sponsorId===row.sponsorId));
 protect(task.events,canEdit(task,'context'),row=>task.events.filter(item=>item.eventId===row.eventId));
 protect(task.cameras,canEdit(task,'context'),()=>task.cameras);
 if(closed){recordAnnotationChange(task,before,'Stop LIVE tag at next saved interval');notify(`LIVE tag ended at the next recorded interval. Later annotations were preserved.`)}
}
function attachVideo(){
 const el=document.getElementById('matchVideo') as HTMLVideoElement|null;
  if(!el){videoRecovery?.dispose();videoRecovery=null;videoEl=null;return;}
  const t=currentTask();
  const needsRecovery=t?.videoType==='buildup'&&!localVideos[t.id];
  if(videoEl!==el||!needsRecovery){videoRecovery?.dispose();videoRecovery=null;}
  if(needsRecovery&&!videoRecovery)videoRecovery=recoverVideo(el,{position:()=>tick,status:message=>{videoError=message;refreshStudio();}});
  if(videoEl===el)return;
  videoEl=el;
  el.playbackRate=playbackRate;
  el.addEventListener('ratechange',()=>{if(videoEl!==el)return;playbackRate=el.playbackRate;refreshStudio()});
 el.addEventListener('timeupdate',()=>{if(videoEl!==el||videoRecovery?.isRecovering())return;const t=currentTask();if(t&&el.currentTime<tick-0.2){preserveGapDraftsOnRewind(t,tick);preserveOpenAnnotationsOnRewind(t,tick)}tick=el.currentTime;if(t){finishBoundaryDrafts(t,tick);protectFutureIntervals(t,tick)}recordTick();refreshStudio();});
 el.addEventListener('play',refreshStudio);
 el.addEventListener('pause',refreshStudio);
 el.addEventListener('loadedmetadata',()=>{
  const t=currentTask();if(!t)return;
  if(Number.isFinite(el.duration)&&el.duration>1){
   videoDurations[t.id]=el.duration;
   if(isManager()&&Math.round(el.duration)!==Math.round(t.duration)){
    t.duration=Math.round(el.duration);
    save();refreshStudio();
   }
   videoDimensions=el.videoWidth&&el.videoHeight?el.videoWidth+' × '+el.videoHeight:'';
   recordTick();refreshStudio();
  }
 });
  el.addEventListener('error',()=>{
   if(videoEl!==el||videoRecovery)return;
  const msg='This browser could not decode the video. Try H.264 MP4 or WebM, or check the HTTPS source.';
  videoError=msg;refreshStudio();
  notify(msg);
 });
 el.addEventListener('ended',refreshStudio);
}
window.chooseVideo=()=>{
 if(!currentTask())return notify('Open a match before selecting a video.');
 const picker=document.getElementById('videofile') as HTMLInputElement|null;
  if(!picker)return notify('Video picker is unavailable.');
 picker.value=''; // Allows selecting the same file again to reconnect it.
 picker.click();
};
window.attachLocalVideoFile=(file:File)=>{
 const t=currentTask();if(!t||!file)return false;
 if(!file.type.startsWith('video/')&&!/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name||'')){
  notify('Choose a video file, such as MP4 or WebM.');return false;
 }
  let url:string;
  try{url=URL.createObjectURL(file)}catch{return notify('Could not open the selected video.'),false}
  if(localVideos[t.id])URL.revokeObjectURL(localVideos[t.id].url);
  localVideos[t.id]={url,name:file.name};
  delete videoDurations[t.id];
  videoDimensions='';videoError='';tick=0;
  render();notify('Video opened locally. Select it again after refreshing.');
 return true;
};
const handleVideoFileChange=(e:Event)=>{
 const input=e.target as HTMLInputElement;
 const file=input.files&&input.files[0];
 if(file)window.attachLocalVideoFile?.(file);
};
document.getElementById('videofile')?.addEventListener('change',handleVideoFileChange);
function runPlaybackKey(e:KeyboardEvent){captureStudioSpacebar(e,view==='studio'&&!modalOpen,()=>window.togglePlay?.());}
function runKeydown(e:KeyboardEvent){if(e.key==='Escape'){window.closeTaskMenu?.();return;}if(view!=='studio'||modalOpen||(e.target instanceof Element&&e.target.matches('input,textarea,select,[contenteditable]')))return;if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();if(!e.repeat)void window.undoLastAnnotationChange?.();return;}if(e.key==='ArrowLeft'){e.preventDefault();window.skipByStep?.(-1)}else if(e.key==='ArrowRight'){e.preventDefault();window.skipByStep?.(1)}}
function runShortcut(e:KeyboardEvent){
 if(e.repeat||view!=='studio'||modalOpen||editingInterval||e.isComposing||(e.ctrlKey&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='z')||(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')))return;
 const shortcut=hotkeyFromKeyboard(e),task=currentTask();if(!shortcut||!task)return;
 const matches=[
  ...sponsorFor(task).filter(x=>x.hotkey===shortcut).map(x=>({kind:'sponsor',id:x.id})),
  ...eventsFor(task).filter(x=>x.hotkey===shortcut).map(x=>({kind:'event',id:x.id})),
  ...camerasFor(task).filter(x=>x.hotkey===shortcut).map(x=>({kind:'camera',id:x.id})),
 ];
 if(matches.length!==1)return;
 const chosen=matches[0];
 if(chosen.kind==='sponsor'&&!canEdit(task,'sponsors')||chosen.kind!=='sponsor'&&!canEdit(task,'context'))return;
 e.preventDefault();e.stopPropagation();
 if(chosen.kind==='sponsor')window.tagSponsor?.(chosen.id);
 else if(chosen.kind==='event')window.tagEvent?.(chosen.id);
 else window.tagCamera?.(chosen.id);
}
document.addEventListener('keydown',runPlaybackKey,true);
document.addEventListener('keypress',runPlaybackKey,true);
document.addEventListener('keyup',runPlaybackKey,true);
document.addEventListener('keydown',runShortcut,true);
document.addEventListener('keydown',runKeydown);
window.submitMyTask=()=>{
 let t=currentTask();if(!t)return;
 if(backfillDrafts.some(draft=>draft.taskId===t.id))return notify('Finish the currently open gap annotation before submitting.');
 let mineS=allowed(t,'sponsors')&&!t.submitted.sponsors,mineC=allowed(t,'context')&&!t.submitted.context;
 if(!mineS&&!mineC)return notify('No open assigned stream to submit.');
 if(mineS&&t.sponsors.some(x=>x.end==null))return notify('Close all active sponsor visibility tags before submitting.');
 if(mineC&&t.events.some(x=>x.end==null))return notify('Close all active duration events before submitting.');
 const parts=[mineS?'sponsor visibility':'',mineC?'events & camera':''].filter(Boolean).join(' and ');
 confirmInApp('Submit annotation streams',`Submit ${parts}? These streams will be locked until an administrator reopens them.`,()=>{
  if(mineS)t.submitted.sponsors=true;
  if(mineC){t.submitted.context=true;t.cameras.forEach(x=>{if(x.end==null)x.end=videoDuration(t)})}
  save();render();notify('Assigned work submitted.');
 },{actionLabel:'SUBMIT',danger:false});
};
window.reopenTask=()=>{
 const t=currentTask();if(!t||!isManager())return;
 confirmInApp('Reopen annotation streams','Reopen both annotation streams for editing?',()=>{
  t.submitted={sponsors:false,context:false};save();render();notify('Task streams reopened');
 },{actionLabel:'REOPEN STREAMS',danger:false});
};
window.assignTaskModal=id=>{
 if(!isManager())return;
 const task=db.tasks.find(x=>x.id===id);
 if(!task)return notify('Match task not found.');
 if(modalOpen)return notify('Close the current dialog before assigning workers.');
 openDialog({type:'assign',task,users:db.users});
 (document.getElementById('assignSponsorWorker') as HTMLSelectElement|null)?.focus();
};
window.saveTaskAssignment=id=>{
 if(!isManager())return;
 const t=db.tasks.find(x=>x.id===id);
 if(!t)return notify('Match task not found.');
 const sponsorId=formVal('assignSponsorWorker');
 const contextId=formVal('assignContextWorker');
 const valid=(id:string)=>id===''||db.users.some(u=>u.id===id&&u.role==='analyst');
 if(!valid(sponsorId)||!valid(contextId))return notify('Select a valid analyst or Unassigned.');
 const previousSponsor=t.sponsorAnalystId||'';
 const previousContext=t.contextAnalystId||'';
 t.sponsorAnalystId=sponsorId;
 t.contextAnalystId=contextId;
 save();
 window.closeModal?.();
 render();
 notify(previousSponsor===sponsorId&&previousContext===contextId?'Assignments unchanged':'Task assignments saved');
};

window.createTaskModal=(id='')=>{if(!isManager())return;openDialog({type:'task',task:db.tasks.find(t=>t.id===id),data:db,fixtures:OFFICIAL_FIXTURES,localVideoName:localVideos[id]?.name});};
window.deleteTask=id=>{
 if(!isManager())return;
 const task=db.tasks.find(row=>row.id===id);if(!task)return;
 confirmInApp('Delete task · confirmation 1 of 2',`Delete the created task ${task.number} — ${task.name}? The official match catalog remains unchanged, but its annotations, assignments and stored task videos will be removed.`,()=>{
  confirmInApp('Delete task · final confirmation',`FINAL WARNING: Permanently remove task ${task.number}, ALL recorded annotations, and task video files? This cannot be undone. The fixture remains in Match Catalog.`,()=>{
   const local=localVideos[id];if(local){URL.revokeObjectURL(local.url);delete localVideos[id];}
   delete videoDurations[id];if(videoEl)videoEl.pause();videoEl=null;
   db.tasks=db.tasks.filter(row=>row.id!==id);
   if(reportTaskId===id)reportTaskId='';selectedTaskId='';view='tasks';writeStudioRoute(view);save();render();notify(`Task ${task.number} deleted; match catalog retained.`);
  },{actionLabel:'PERMANENTLY DELETE TASK'});
 },{actionLabel:'CONTINUE TO FINAL CONFIRMATION'});
};
const checks=(name:string)=>[...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map(input=>input.value);
window.selectFixture=id=>{
 const fixture=fixtureById(id);if(!fixture)return;
 const fields:Record<string,string>={taskfixture:id,taskname:`${fixture.home} vs ${fixture.away}`,tasknumber:fixture.id,taskdate:fixture.date};
 for(const [key,value] of Object.entries(fields)){const input=document.getElementById(key) as HTMLInputElement|null;if(input)input.value=value;}
};
window.saveTask=id=>{
 if(!isManager())return;
 const name=formVal('taskname').trim(),number=formVal('tasknumber').trim(),minutes=Number(formVal('taskduration'));
 if(!name||!number||!Number.isFinite(minutes)||minutes<1)return notify('Add the task name, number and a valid footage duration.');
 if(db.tasks.some(task=>task.number.toLowerCase()===number.toLowerCase()&&task.id!==id))return notify('Task number must be unique.');
 let task=db.tasks.find(row=>row.id===id);
 const firstVal=formVal('periodFirstEnd'),secondVal=formVal('periodSecondStart');
 if((firstVal!=='')!==(secondVal!==''))return notify('Set both half boundaries, or leave both blank.');
 const firstEnd=Number(firstVal),secondStart=Number(secondVal);
 if(firstVal!==''&&(!Number.isFinite(firstEnd)||!Number.isFinite(secondStart)||firstEnd<=0||secondStart<firstEnd||secondStart>=minutes))return notify('Period mapping must satisfy 0 < first-half end ≤ second-half start < video duration.');
 const videoType=formVal('taskvideosrc') as TaskSummary['videoType'];
  const videoUrl=formVal('taskurl').trim();
  const buildupMatchId=formVal('taskbuildupid').trim();
 if(task?.videoAssetId&&videoType!=='s3')return notify('Private S3 videos cannot be detached without a server-side delete operation.');
 if(videoType==='https'&&videoUrl&&!/^https:\/\//i.test(videoUrl))return notify('Direct video links must start with https://');
  if(videoType==='ftp'&&videoUrl&&!/^(ftp|sftp):\/\//i.test(videoUrl))return notify('FTP links must start with ftp:// or sftp://');
  if(videoType==='buildup'&&!/^[1-9]\d{0,14}$/.test(buildupMatchId))return notify('Enter a valid BuildUp match ID.');
 const fixtureId=formVal('taskfixture')||task?.fixtureId||'';
 if(!task&&fixtureId&&taskForFixture(fixtureId))return notify('This fixture already has a task. Open its existing entry in the Match Catalog.');
 const data={name,number,date:formVal('taskdate'),duration:Math.round(minutes*60*100)/100,
  periods:firstVal!==''?{firstEnd,secondStart}:null,sponsorGroupIds:checks('sgroups'),eventGroupIds:checks('egroups'),cameraGroupIds:checks('cgroups'),
   sponsorAnalystId:formVal('tsponsor'),contextAnalystId:formVal('tcontext'),videoType,videoUrl:videoType==='none'||videoType==='buildup'?'':videoUrl,buildupMatchId:videoType==='buildup'?buildupMatchId:'',fixtureId};
 if(task&&formVal('taskremovevideo')==='yes'){
  const local=localVideos[task.id];if(local){URL.revokeObjectURL(local.url);delete localVideos[task.id];}
  delete videoDurations[task.id];videoDimensions='';videoError='';
  if(videoEl)videoEl.pause();videoEl=null;
 }
 if(task)Object.assign(task,data);
  else db.tasks.push({id:uid(),...data,sponsors:[],events:[],cameras:[],submitted:{sponsors:false,context:false},createdAt:tstamp()});
 save();window.closeModal?.();view='tasks';selectedTaskId='';writeStudioRoute(view);render();notify(id?'Task updated':'Task created');
};
window.groupModal=(kind,id='')=>{const groups=kind==='sponsor'?db.sponsorGroups:kind==='event'?db.eventGroups:db.cameraGroups;openDialog({type:'group',kind,group:groups.find(g=>g.id===id)});};
window.saveGroup=(kind,id)=>{
 if(!isManager())return;
 const name=formVal('gname').trim();if(!name)return notify('List name is required.');
 if(kind==='sponsor'){
  const group=db.sponsorGroups.find(row=>row.id===id);
  if(group){group.name=name;group.description=formVal('gdesc');}
  else db.sponsorGroups.push({id:uid(),name,description:formVal('gdesc'),sponsors:[]});
 }else{
  const groups=kind==='event'?db.eventGroups:db.cameraGroups;
  const group=groups.find(row=>row.id===id);
  if(group)group.name=name;
  else groups.push({id:uid(),name,items:[]});
 }
 save();window.closeModal?.();render();notify('Attribute list saved');
};
let catalogClipboard:{kind:CatalogKind;groupId:string;itemId:string}|null=null;
const catalogGroupItems=(kind:CatalogKind,groupId:string)=>kind==='sponsor'
 ?db.sponsorGroups.find(group=>group.id===groupId)?.sponsors
 :(kind==='event'?db.eventGroups:db.cameraGroups).find(group=>group.id===groupId)?.items;
const catalogFits=()=>new TextEncoder().encode(JSON.stringify({sponsorGroups:db.sponsorGroups,eventGroups:db.eventGroups,cameraGroups:db.cameraGroups})).byteLength<=MAX_CATALOG_BYTES;
window.copyCatalogItem=(kind,gid,id)=>{
 if(!isManager())return;
 const item=catalogGroupItems(kind,gid)?.find(row=>row.id===id);
 if(!item)return notify('This catalog item is no longer available.');
 catalogClipboard={kind,groupId:gid,itemId:id};notify(`${item.name} copied. Use Paste in a list, or drag its handle into another list.`);
};
function duplicateCatalogItem(kind:CatalogKind,sourceGroupId:string,sourceItemId:string,targetGroupId:string,targetId='',placement:DropPlacement='after'){
 if(kind==='sponsor'){
  const source=db.sponsorGroups.find(group=>group.id===sourceGroupId)?.sponsors.find(item=>item.id===sourceItemId);
  const dest=db.sponsorGroups.find(group=>group.id===targetGroupId)?.sponsors;
  if(!source||!dest)return notify('Sponsor or destination list no longer exists.');
  if(dest.length>=300)return notify('A sponsor list can contain at most 300 entries.');
  const clone=copyCatalogEntry(source,uid(),sourceGroupId===targetGroupId);
  const target=dest.findIndex(item=>item.id===targetId);
  dest.splice(target<0?dest.length:target+(placement==='after'?1:0),0,clone);
  if(!catalogFits()){dest.splice(dest.findIndex(item=>item.id===clone.id),1);return notify('Sponsor catalog is over the 8 MB limit. Remove some logos before copying.');}
  save();render();notify(`${source.name} copied to the destination list. Its shortcut was cleared.`);
 }else{
  const source=(kind==='event'?db.eventGroups:db.cameraGroups).find(group=>group.id===sourceGroupId)?.items.find(item=>item.id===sourceItemId);
  const dest=(kind==='event'?db.eventGroups:db.cameraGroups).find(group=>group.id===targetGroupId)?.items;
  if(!source||!dest)return notify('Attribute or destination list no longer exists.');
  if(dest.length>=300)return notify('An attribute list can contain at most 300 entries.');
  const clone=copyCatalogEntry(source,uid(),sourceGroupId===targetGroupId);
  const target=dest.findIndex(item=>item.id===targetId);
  dest.splice(target<0?dest.length:target+(placement==='after'?1:0),0,clone);
  if(!catalogFits()){dest.splice(dest.findIndex(item=>item.id===clone.id),1);return notify('Catalog is over the 8 MB limit.');}
  save();render();notify(`${source.name} copied. Its shortcut was cleared.`);
 }
}
window.pasteCatalogItem=(kind,gid)=>{
 if(!isManager())return;
 if(!catalogClipboard)return notify('Select Copy on a sponsor or attribute first.');
 if(catalogClipboard.kind!==kind)return notify('Paste into a list of the same type (sponsor, event or camera).');
 duplicateCatalogItem(kind,catalogClipboard.groupId,catalogClipboard.itemId,gid);
};
window.moveCatalogItem=(kind,sourceGroupId,itemId,targetGroupId,targetId='',placement='before')=>{
 if(!isManager())return;
 if(sourceGroupId!==targetGroupId){duplicateCatalogItem(kind,sourceGroupId,itemId,targetGroupId,targetId,placement);return;}
 if(!targetId)return;
 if(kind==='sponsor'){
  const group=db.sponsorGroups.find(row=>row.id===sourceGroupId);if(!group)return;
  const next=reorderById(group.sponsors,itemId,targetId,placement);if(next===group.sponsors)return;
  group.sponsors=next;
 }else{
  const group=(kind==='event'?db.eventGroups:db.cameraGroups).find(row=>row.id===sourceGroupId);if(!group)return;
  const next=reorderById(group.items,itemId,targetId,placement);if(next===group.items)return;
  group.items=next;
 }
 save();render();
};
window.moveCatalogGroup=(kind,id,targetId,placement='before')=>{
 if(!isManager())return;
 if(kind==='sponsor'){
  const next=reorderById(db.sponsorGroups,id,targetId,placement);if(next===db.sponsorGroups)return;
  db.sponsorGroups=next;
 }else if(kind==='event'){
  const next=reorderById(db.eventGroups,id,targetId,placement);if(next===db.eventGroups)return;
  db.eventGroups=next;
 }else{
  const next=reorderById(db.cameraGroups,id,targetId,placement);if(next===db.cameraGroups)return;
  db.cameraGroups=next;
 }
 save();render();
};
window.addSponsorToCurrentTask=()=>{const task=currentTask();if(!task||!isManager())return;const group=db.sponsorGroups.find(row=>task.sponsorGroupIds.includes(row.id));if(!group){notify('Assign a sponsor list to the task first.');return}window.sponsorModal?.(group.id)};
window.sponsorModal=(gid,sid='')=>{const group=db.sponsorGroups.find(g=>g.id===gid);if(!group)return;openDialog({type:'sponsor',group,sponsor:group.sponsors.find(s=>s.id===sid)});};
window.saveSponsor=async(gid,sid)=>{
 if(!isManager())return;
 const group=db.sponsorGroups.find(row=>row.id===gid),name=formVal('sname').trim();
 const file=(document.getElementById('simage') as HTMLInputElement|null)?.files?.[0];
 if(!group||!name)return notify('Sponsor name required');
 const shortcut=normalizeHotkey(formVal('shotkey'));
 if(shortcut&&shortcutTaken(shortcut,sid))return notify('This shortcut is already assigned to another sponsor, event, or camera.');
 let logoData:string|undefined;
 try{if(file)logoData=await readOriginalPng(file)}catch(error){return notify(error instanceof Error?error.message:'Could not read this PNG image.');}
 let sponsor=group.sponsors.find(row=>row.id===sid);
 const before=sponsor?{...sponsor}:null;
 if(!sponsor){sponsor={id:uid(),name};group.sponsors.push(sponsor)}
 sponsor.name=name;sponsor.color=formVal('scolor');sponsor.hotkey=shortcut;
 if(logoData){sponsor.logo=logoData;sponsor.logoTrimmed=false;}
 if(!catalogFits()){
  if(before){const index=group.sponsors.findIndex(item=>item.id===sponsor!.id);if(index>=0)group.sponsors[index]=before;}
  else group.sponsors=group.sponsors.filter(item=>item.id!==sponsor!.id);
  return notify('Sponsor catalog exceeds the 8 MB storage limit. Remove oversized existing logos before adding more.');
 }
 save();window.closeModal?.();render();notify('Sponsor saved');
};
window.deleteSponsor=(gid,sid)=>{let g=db.sponsorGroups.find(x=>x.id===gid);if(!g)return;let used=db.tasks.some(t=>t.sponsors.some(v=>v.sponsorId===sid));if(used)return notify('This brand has recorded annotations. Preserve the history; create a new list instead.');const sponsor=g.sponsors.find(x=>x.id===sid);confirmInApp('Delete sponsor',`Delete ${sponsor?.name||'this sponsor'} and its uploaded brand image from the list?`,()=>{g.sponsors=g.sponsors.filter(x=>x.id!==sid);save();render();notify('Sponsor removed')},{actionLabel:'DELETE SPONSOR'})};
function shortcutTaken(key:string,exceptId=''){
 return [...db.sponsorGroups.flatMap(group=>group.sponsors),...db.eventGroups.flatMap(group=>group.items),...db.cameraGroups.flatMap(group=>group.items)]
  .some(item=>item.id!==exceptId&&normalizeHotkey(item.hotkey)===key);
}
window.attrItemModal=(kind,gid,id='')=>{const group=(kind==='event'?db.eventGroups:db.cameraGroups).find(row=>row.id===gid);if(group)openDialog({type:'item',kind,groupId:gid,item:group.items.find(row=>row.id===id)});};
window.saveAttrItem=(kind,gid,id='')=>{if(!isManager())return;const gs=kind==='event'?db.eventGroups:db.cameraGroups,g=gs.find(x=>x.id===gid),name=formVal('iname').trim();if(!g||!name)return notify('Attribute name required');const shortcut=normalizeHotkey(formVal('ihotkey'));if(shortcut&&shortcutTaken(shortcut,id))return notify('This shortcut is already assigned to another sponsor, event, or camera.');let item=g.items.find(row=>row.id===id);if(!item){item={id:uid(),name};g.items.push(item)}item.name=name;item.hotkey=shortcut;if(kind==='event'){item.kind='range';item.highValue=!!(document.getElementById('ihigh') as HTMLInputElement|null)?.checked;}save();window.closeModal?.();render();};
window.removeItem=(kind,gid,id)=>{let gs=kind==='event'?db.eventGroups:db.cameraGroups,g=gs.find(x=>x.id===gid);if(!g)return;const item=g.items.find(x=>x.id===id);if(!item)return;confirmInApp('Remove attribute',`Remove "${item.name}" from this list? Historical annotations may lose the display label.`,()=>{g.items=g.items.filter(x=>x.id!==id);save();render();notify('Attribute removed')},{actionLabel:'REMOVE ATTRIBUTE'})};
window.userModal=(id='')=>{if(isManager())openDialog({type:'user',user:db.users.find(u=>u.id===id)});};
window.resetMemberPassword=id=>{
 const user=db.users.find(u=>u.id===id);
 if(!isManager()||!user||user.role==='owner'||(user.role==='admin'&&me()?.role!=='owner'))return;
 confirmInApp('Reset worker password',`Reset ${user.name}'s password? Their existing sessions will be revoked. You must share the new temporary password yourself.`,()=>{
  void api.resetMemberPassword(workspaceId,id).then(async result=>{
   await loadWorkspace(workspaceId);
   openDialog({type:'credentials',name:result.user.name,email:result.user.email,
    temporaryPassword:result.temporaryPassword,purpose:'reset'});
  }).catch(error=>notify('Could not reset password: '+error.message));
 },{actionLabel:'RESET PASSWORD'});
};
window.removeWorkspaceMember=id=>{
 const member=db.users.find(u=>u.id===id);
 if(me()?.role!=='owner'||!member||member.role==='owner'||member.id===logged)return notify('Only the workspace owner can remove other members.');
 const count=db.tasks.reduce((n,t)=>n+(t.sponsorAnalystId===id?1:0)+(t.contextAnalystId===id?1:0),0);
 confirmInApp('Remove team member',`Remove ${member.name} (${member.role}) from this workspace?${count?` Their ${count} assigned match stream${count===1?'':'s'} will become unassigned.`:''} Existing annotations and match history will be preserved.`,()=>{
  if(me()?.role!=='owner')return notify('Only the workspace owner can remove other members.');
  void api.removeMember(workspaceId,id).then(async result=>{
   await loadWorkspace(workspaceId);
   notify(`${member.name} removed from this workspace.${result.unassignedStreams?` ${result.unassignedStreams} match streams unassigned.`:''}`);
  }).catch(error=>notify('Could not remove member: '+(error instanceof Error?error.message:String(error))));
 },{actionLabel:'REMOVE MEMBER'});
};
window.saveUser=id=>{
 if(!isManager())return;
  if(id)return notify('Member details are managed by the account owner.');
  const name=formVal('uname').trim(),email=formVal('uemail').trim().toLowerCase();
  if(!name||!email)return notify('Name and email are required.');
   const role=formVal('urole');
   if(role!=='ANALYST'&&role!=='ADMIN'&&role!=='VIEWER')return notify('Select a valid role.');
   if(role==='ADMIN'&&me()?.role!=='owner')return notify('Only the workspace owner can add admins.');
   void api.provisionMember(workspaceId,{name,email,role}).then(async result=>{
   window.closeModal?.();
   await loadWorkspace(workspaceId);
   openDialog({type:'credentials',name:result.user.name,email:result.user.email,
    temporaryPassword:result.temporaryPassword,purpose:'created'});
  }).catch(error=>notify('Could not add member: '+error.message));return;
};
/* Analytics computed strictly from annotated intervals; no inferred impressions or valuations. */
 window.selectInsightSponsor=id=>{insightFocusId=id;render();};
window.goToAnnotatedTime=(id,time)=>{window.openTask?.(id);window.seekVideo?.(time)};
 window.chooseReport=id=>{reportTaskId=id;writeStudioRoute('reports',id);render()};
window.showReport=id=>{reportTaskId=id;view='reports';writeStudioRoute(view,id);render();window.scrollTo(0,0)};
function insightExport(d:ReturnType<typeof insightData>){
 const pct=(n:number)=>Number(n.toFixed(4));
 return {
  schemaVersion:1,
  matchSeconds:d.videoSeconds,
  annotatedThroughSeconds:d.endpoint,
  anySponsorVisibleSeconds:pct(d.coveredSeconds),
  noSponsorVisibleSeconds:pct(Math.max(0,d.videoSeconds-d.coveredSeconds)),
  broadcastCoveragePercent:pct(d.pct(d.coveredSeconds,d.videoSeconds)),
  combinedBrandSeconds:pct(d.sumSeconds),
  brands:d.active.map(b=>({sponsorId:b.id,name:b.name,visibleSeconds:pct(b.seconds),
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
  cameraViews:d.cameras.filter(c=>c.seconds>0).map(c=>({id:c.id,name:c.name,cameraDurationSeconds:c.seconds,
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
function exportObject(t:TaskSummary){let spo=sponsorFor(t),evt=eventsFor(t),cam=camerasFor(t),d=insightData(t);return {schema:'seebot.sponsor_visibility.v1',exportedAt:tstamp(),task:{id:t.id,number:t.number,name:t.name,date:t.date,videoDurationSeconds:t.duration,videoSourceType:t.videoType,videoSourceUrl:me()?.role==='viewer'?null:t.videoUrl||null,videoFileName:t.videoName||null,matchPeriods:t.periods||null},assignment:{sponsorAnalyst:{id:t.sponsorAnalystId,name:nameUser(t.sponsorAnalystId)},eventAndCameraAnalyst:{id:t.contextAnalystId,name:nameUser(t.contextAnalystId)}},status:{label:taskStatus(t),...t.submitted},definition:{visibility:'Sponsor is visible anywhere in frame; simultaneous placements of the same sponsor are counted once.',timebase:'Seconds from beginning of video',eventOverlap:'Sponsors and event intervals are matched by positive duration overlap. Legacy point annotations (if present) are checked at their original timestamps.'},attributes:{sponsors:spo.map(s=>({id:s.id,name:s.name,list:s.groupName})),keyEvents:evt,cameraAngles:cam},annotations:{sponsorVisibility:t.sponsors.map(x=>({...x,durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null})),keyEvents:t.events.map(x=>({...x,name:labelFor(t,'events',x.eventId),durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null})),cameraAngles:t.cameras.map(x=>({...x,name:labelFor(t,'cameras',x.cameraId),durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null}))},analytics:{uniqueSponsorsSeen:d.active.length,combinedBrandExposureSeconds:d.sumSeconds,sponsors:d.active.map(s=>({id:s.id,name:s.name,exposureSeconds:s.seconds,percentageOfVideo:Math.round(10000*s.seconds/t.duration)/100,visibilityIntervals:s.entries,keyEventOverlaps:s.eventHits})),eventSponsorAssociations:t.events.map(e=>({eventId:e.id,tag:e.eventId,startSeconds:e.start,endSeconds:e.end,durationSeconds:e.end==null?null:e.end-e.start,sponsorIds:spo.filter(s=>d.active.some(b=>b.id===s.id&&d.eventRows.some(event=>event.id===e.id&&event.brands.some(match=>match.id===s.id)))).map(s=>s.id)})),advanced:insightExport(d)}}}
window.exportTask=id=>{let t=db.tasks.find(x=>x.id===id);if(!t||!visibleTasks().some(x=>x.id===id))return;let s=JSON.stringify(exportObject(t),null,2),a=document.createElement('a'),url=URL.createObjectURL(new Blob([s],{type:'application/json'}));a.href=url;a.download=(t.number||'match')+'_sponsor_annotations.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('JSON exported — '+t.number)};
 function render(){
 if(view!=='studio'||!workspaceId||!logged){videoRecovery?.dispose();videoRecovery=null;}
 if(sessionPending){mount('loading',{});return}
 const user=me();
 if(passwordChangeRequired){
  mount('login',{changeRequired:true});
  return;
 }
 if(!user){
  mount('login',{});
  return;
 }
 if(!workspaceId){mount('workspace',{workspaces:liveWorkspaces.map(x=>x.workspace)});return}
 if(user.role==='viewer'&&view!=='reports'){view='reports';selectedTaskId='';writeStudioRoute(view,'',true)}
 else if(!['owner','admin'].includes(user.role)&&['users','sponsors','attributes'].includes(view)){view='dashboard';writeStudioRoute(view,'',true)}
 if(view==='studio'&&!visibleTasks().some(task=>task.id===selectedTaskId)){view='tasks';selectedTaskId='';writeStudioRoute(view,'',true)}
 const t=view==='studio'?currentTask():null;
 const localVideo=t?localVideos[t.id]:undefined;
 const videoSrc=localVideo?.url||(t?.videoType==='buildup'&&workspaceId?buildupVideoUrl(workspaceId,t.id):t&&((t.videoType==='https'||t.videoType==='s3')&&t.videoUrl)?t.videoUrl:null);
 const heading=t?studioSidebarHeading():null;
 const currentCamera=t?.cameras.find(x=>x.end==null);
 const displayTask=t?{
  ...t,
  sponsors:[...t.sponsors,...backfillDrafts.filter(d=>d.taskId===t.id&&d.track==='sponsors').map(d=>({id:d.id,sponsorId:d.labelId,start:d.start,end:null,createdBy:logged,createdAt:tstamp()}))],
  events:[...t.events,...backfillDrafts.filter(d=>d.taskId===t.id&&d.track==='events').map(d=>({id:d.id,eventId:d.labelId,kind:'range' as const,start:d.start,end:null,createdBy:logged,createdAt:tstamp()}))],
  cameras:[...t.cameras,...backfillDrafts.filter(d=>d.taskId===t.id&&d.track==='cameras').map(d=>({id:d.id,cameraId:d.labelId,start:d.start,end:null,createdBy:logged,createdAt:tstamp()}))],
 }:undefined;
 const studioModel=t?{
  id:t.id,workspaceId,number:t.number,name:t.name,date:t.date,duration:videoDuration(t),
  videoName:localVideo?.name||t.videoName,videoType:t.videoType,videoSrc,isLocalVideo:!!localVideo,
  status:taskStatus(t),sponsorAnalyst:nameUser(t.sponsorAnalystId),contextAnalyst:nameUser(t.contextAnalystId),
  canSponsor:canEdit(t,'sponsors'),canContext:canEdit(t,'context'),
  selectedTab:studioTab,tick,sponsorCount:t.sponsors.filter(x=>x.end==null).length,
  logCount:t.sponsors.length+t.events.length+t.cameras.length,
  cameraLabel:currentCamera?labelFor(t,'cameras',currentCamera.cameraId):'CAMERA NOT SELECTED',
  railTitle:heading!.title,railHint:heading!.hint,submitted:t.submitted||{sponsors:false,context:false},
  task:displayTask!,sponsors:sponsorFor(t),events:eventsFor(t),cameras:camerasFor(t),editingInterval:editingInterval||undefined,
  seekStep,playbackRate,undoCount:undoStacks.get(t.id)?.length||0,sponsorsHidden:hiddenSponsors?.taskId===t.id,
  pendingBackfillIds:backfillDrafts.filter(d=>d.taskId===t.id).map(d=>d.id),
  lastAnnotatedAt:lastAnnotatedTimestamp(t),videoDimensions,videoError,playing:videoRecovery?videoRecovery.isPlaying():!!videoEl&&!videoEl.paused
 }:undefined;
 const reportsTasks=view==='reports'?visibleTasks():[];
 const selectedReport=reportsTasks.find(x=>x.id===reportTaskId)||reportsTasks[0];
 if(view==='reports'&&selectedReport)reportTaskId=selectedReport.id;
 const reportsModel=view==='reports'?{
  tasks:reportsTasks.map(task=>({id:task.id,number:task.number,name:task.name})),
  selectedId:selectedReport?.id,
  selectedTask:selectedReport,
  data:db,focusId:insightFocusId,fixtures:OFFICIAL_FIXTURES,badges:BADGES,visibleTasks:reportsTasks
 }:undefined;
 mount(view,{user:{name:user.name,role:user.role},taskId:selectedTaskId,data:db,viewerId:logged,fixtures:OFFICIAL_FIXTURES,badges:BADGES,fixtureSyncLabel,fixtureRefreshing,fixtureDay,taskFilter,studio:studioModel,reports:reportsModel,workspaceName:liveWorkspaces.find(x=>x.workspace.id===workspaceId)?.workspace.name,workspaces:liveWorkspaces.map(x=>x.workspace)},()=>{
  if(view==='studio')attachVideo();else{videoRecovery?.dispose();videoRecovery=null;videoEl=null;}
 });
}
refreshFixtureFeed();
const fixtureRefreshId=setInterval(refreshFixtureFeed,5*60*1000);
render();
void loadLiveSession().catch(()=>{logged='';remoteUser=null;passwordChangeRequired=false;sessionPending=false;render()});
 return ()=>{
  videoRecovery?.dispose();videoRecovery=null;
 clearInterval(fixtureRefreshId);
 document.removeEventListener('keydown',runPlaybackKey,true);
 document.removeEventListener('keypress',runPlaybackKey,true);
 document.removeEventListener('keyup',runPlaybackKey,true);
 document.removeEventListener('keydown',runShortcut,true);
 document.removeEventListener('keydown',runKeydown);
 document.removeEventListener('pointerdown',dismissActionMenu);
 window.removeEventListener('beforeunload',warnOnGapDraftUnload);
 window.removeEventListener('popstate',restoreRoute);
 window.removeEventListener('hashchange',restoreRoute);
 document.getElementById('videofile')?.removeEventListener('change',handleVideoFileChange);
 clearLocalVideos();
};
}

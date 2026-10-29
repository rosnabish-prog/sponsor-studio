import type { StudioMount } from '../types/screen';
import type { CameraAnnotation, EventAnnotation, Fixture, Sponsor, SponsorAnnotation, StudioData, TaskSummary, TeamMember } from '../types/models';
import type { DialogModel } from '../components/StudioModals';
import { computeInsights } from '../domain/analytics';
import { PLACEMENT_TYPES, VISIBILITY_QUALITIES } from '../domain/classifications';
import { formatTimestamp as fmt, clampNumber as clamp, mergeIntervals as merged, intervalOverlap as overlap } from '../domain/intervals';
import { api, fromApiTask, type ApiMembership, type ApiUser } from '../api/client';
import { persistStudio } from '../api/sync';

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
async function refreshFixtureFeed(){
  try{
    const response=await fetch('data/fixtures.json',{cache:'no-store'});
    if(!response.ok)throw Error('Feed unavailable: '+response.status);
    const payload=await response.json();
    if(!Array.isArray(payload.matches)||payload.matches.length<10)throw Error('Incomplete feed');
    const safe=payload.matches.filter((f:Fixture)=>f&&typeof f.id==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(f.date)&&typeof f.home==='string'&&typeof f.away==='string');
    if(safe.length<10)throw Error('Invalid feed');
    OFFICIAL_FIXTURES=safe;
    for(const team of payload.clubs||[]){
      if(team.name&&typeof team.logo==='string'&&/^https:\/\//.test(team.logo))BADGES[team.name]=team.logo;
    }
    fixtureSyncLabel='BuildUp public fixture feed · auto-synced';
    if(me()&&!modalOpen&&['tasks','dashboard'].includes(view))render();
  }catch(err){console.warn('Using bundled fixture snapshot:',err instanceof Error ? err.message : String(err))}
}
window.chooseFixtureDay=day=>{fixtureDay=day;render()};
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
 if(me()?.role!=='admin')return;
 const existing=taskForFixture(id);
 if(existing){window.openTask?.(existing.id);return}
 window.createTaskModal?.();
 const sel=document.getElementById('taskfixture') as HTMLSelectElement|null;
 if(sel){sel.value=id;window.selectFixture?.(id)}
};
let db:StudioData={users:[],sponsorGroups:[],eventGroups:[],cameraGroups:[],tasks:[]};
let fixtureDay='all';
let remoteUser:ApiUser|null=null,liveWorkspaces:ApiMembership[]=[],workspaceId='',catalogVersion=0;
let passwordChangeRequired=false;
const cloneStudio=(value:StudioData):StudioData=>JSON.parse(JSON.stringify(value)) as StudioData;
let shadow:StudioData=cloneStudio(db),syncDirty=false,syncRunning=false;
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
    }
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
 const definitions=catalog.payload;
 db={
  users:members.map(m=>({id:m.user.id,name:m.user.name,email:m.user.email,role:m.role==='OWNER'||m.role==='ADMIN'?'admin':'analyst',password:''})),
  sponsorGroups:definitions.sponsorGroups||[],eventGroups:definitions.eventGroups||[],cameraGroups:definitions.cameraGroups||[],
  tasks:tasks.map(fromApiTask),
 };
 for(const group of db.eventGroups)for(const item of group.items)item.kind='range';
 workspaceId=id;catalogVersion=catalog.version;shadow=cloneStudio(db);
 syncDirty=false;view='dashboard';render();
}
async function loadLiveSession() {
 const sessionInfo=await api.me();remoteUser=sessionInfo.user;logged=remoteUser.id;
 passwordChangeRequired=!!remoteUser.passwordChangeRequired;
 if(passwordChangeRequired){workspaceId='';liveWorkspaces=[];render();return;}
 liveWorkspaces=await api.workspaces();
 if(liveWorkspaces.length)await loadWorkspace(liveWorkspaces[0].workspace.id);
 else{workspaceId='';render()}
}
let view: 'dashboard'|'tasks'|'studio'|'sponsors'|'attributes'|'users'|'reports'='dashboard';
let selectedTaskId='',reportTaskId='',taskFilter='all',insightFocusId='',fixtureSyncLabel='Bundled schedule';
let studioTab:'all'|'sponsors'|'events'|'cameras'='all';
let tick=0,seekStep=5,videoEl:HTMLVideoElement|null=null,modalOpen=false;
const localVideos:Record<string,{url:string;name:string}>={};
function clearLocalVideos(){for(const video of Object.values(localVideos))URL.revokeObjectURL(video.url);for(const id of Object.keys(localVideos))delete localVideos[id];}
const me=()=>db.users.find(x=>x.id===logged)||(remoteUser&&logged?{...remoteUser,password:'',role:'admin' as const}:undefined);const currentTask=()=>db.tasks.find(x=>x.id===selectedTaskId);const reportTask=()=>db.tasks.find(x=>x.id===reportTaskId)||db.tasks[0];const visibleTasks=()=>me()?.role==='admin'?db.tasks:db.tasks.filter(t=>t.sponsorAnalystId===logged||t.contextAnalystId===logged);
const taskStatus=(t:TaskSummary):'ready'|'progress'|'done'=>t.submitted?.sponsors&&t.submitted?.context?'done':t.sponsors.length||t.events.length||t.cameras.length||t.submitted?.sponsors||t.submitted?.context?'progress':'ready';
const foundUser=(id:string)=>db.users.find(u=>u.id===id);const nameUser=(id:string)=>foundUser(id)?.name||'Unassigned';
const allowed=(t:TaskSummary,kind:'sponsors'|'context')=>me()?.role==='admin'||((kind==='sponsors'?t.sponsorAnalystId:t.contextAnalystId)===logged);
const canEdit=(t:TaskSummary,kind:'sponsors'|'context')=>allowed(t,kind)&&!(t.submitted?.[kind]);
const sponsorFor=(t:TaskSummary)=>db.sponsorGroups.filter(g=>t.sponsorGroupIds.includes(g.id)).flatMap(g=>g.sponsors.map(s=>({...s,groupName:g.name}))).filter((s,i,a)=>a.findIndex(v=>v.id===s.id)===i);
const eventsFor=(t:TaskSummary)=>db.eventGroups.filter(g=>t.eventGroupIds.includes(g.id)).flatMap(g=>g.items);
const camerasFor=(t:TaskSummary)=>db.cameraGroups.filter(g=>t.cameraGroupIds.includes(g.id)).flatMap(g=>g.items);
const labelFor=(t:TaskSummary,type:'sponsors'|'events'|'cameras',id:string)=>({sponsors:sponsorFor(t),events:eventsFor(t),cameras:camerasFor(t)})[type].find(i=>i.id===id)?.name||id;
// Each presence interval has one optional primary placement and one optional visibility-quality rating.
// Unclassified intervals stay unclassified; do not infer placement or readability from sponsor identity.
const seconds=(t:TaskSummary)=>clamp(tick,0,t.duration||3600);
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
window.selectWorkspace=id=>{if(liveWorkspaces.some(w=>w.workspace.id===id))void loadWorkspace(id).catch(error=>notify('Workspace load failed: '+error.message))};
window.createWorkspace=async e=>{e.preventDefault();try{const created=await api.createWorkspace(formVal('newWorkspaceName').trim());liveWorkspaces=await api.workspaces();await loadWorkspace(created.id)}catch(error){notify('Workspace creation failed: '+(error instanceof Error?error.message:'Unknown error'))}};
window.logout=()=>{void api.logout().catch(()=>{});logged='';remoteUser=null;passwordChangeRequired=false;workspaceId='';liveWorkspaces=[];selectedTaskId='';if(videoEl){videoEl.pause()}clearLocalVideos();render()};
window.showWorkspaceSwitcher=()=>{workspaceId='';render()};
window.navigate=(v)=>{if(v==='workspace'){window.showWorkspaceSwitcher?.();return}view=v==='login'?'dashboard':v;if(videoEl){videoEl.pause()}selectedTaskId='';render();window.scrollTo(0,0)};
window.closeTaskMenu=()=>{const menu=document.getElementById('taskActionMenu') as HTMLDetailsElement|null;if(menu)menu.open=false};
window.openTask=id=>{
 selectedTaskId=id;view='studio';tick=0;studioTab='all';render();window.scrollTo(0,0);
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
 if(studioTab==='cameras')return {title:'CAMERA ANGLES',hint:'Tap to begin a view. Switching angles ends the previous one.'};
 return {title:'SPONSORS',hint:'Tap a sponsor to switch between OFF and LIVE.'};
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
window.setStudioTab=k=>{if(!['all','sponsors','events','cameras'].includes(k))return;studioTab=k;refreshStudio();};
function refreshStudio(){if(currentTask()&&view==='studio')render();}
// Actions tagged at the same video timestamp are corrections, not zero-duration annotations.
const SAME_TIME_TOLERANCE=0.2;
const sameVideoTimestamp=(a:number,b:number)=>Math.abs(Number(a)-Number(b))<=SAME_TIME_TOLERANCE;
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
window.deleteLog=(key,id)=>{const t=currentTask(),kind=key==='sponsors'?'sponsors':'context';if(!t||!canEdit(t,kind))return;confirmInApp('Remove annotation','Remove this recorded annotation? This action cannot be undone.',()=>{
  if(key==='sponsors')t.sponsors=t.sponsors.filter(x=>x.id!==id);
  else if(key==='events')t.events=t.events.filter(x=>x.id!==id);
  else t.cameras=t.cameras.filter(x=>x.id!==id);
  save();refreshStudio();notify('Annotation removed');
 },{actionLabel:'REMOVE ANNOTATION'});};
window.seekVideo=val=>{const t=currentTask();if(!t)return;tick=clamp(Number(val)||0,0,t.duration||3600);if(videoEl&&Number.isFinite(videoEl.duration)){try{videoEl.currentTime=clamp(tick,0,videoEl.duration)}catch{}}recordTick();save();refreshStudio();};
window.skipVideo=(n:number)=>window.seekVideo?.((videoEl&&Number.isFinite(videoEl.currentTime)?videoEl.currentTime:tick)+n);
window.skipByStep=direction=>window.skipVideo?.((Number(direction)||0)*seekStep);
window.setSeekStep=value=>{seekStep=value===10?10:5;refreshStudio();};
window.togglePlay=()=>{if(!videoEl)return notify('Attach a video to play. You can still scrub timestamps to test tagging.');if(videoEl.paused){videoEl.play().catch(()=>notify('Video playback unavailable for this source.'))}else videoEl.pause()};
window.cycleRate=()=>{const values=[1,1.25,1.5,2];const next=values[(values.indexOf(playbackRate)+1)%values.length];playbackRate=next;if(videoEl)videoEl.playbackRate=next;refreshStudio();};
let playbackRate=1,videoDimensions='',videoError='';
function recordTick(){const t=currentTask();if(t)t.observedTime=Math.max(t.observedTime||0,tick);}
function attachVideo(){
 const el=document.getElementById('matchVideo') as HTMLVideoElement|null;
 if(!el){videoEl=null;return;}
  if(videoEl===el)return;
  videoEl=el;
  el.playbackRate=playbackRate;
  el.addEventListener('ratechange',()=>{if(videoEl!==el)return;playbackRate=el.playbackRate;refreshStudio()});
 el.addEventListener('timeupdate',()=>{if(videoEl!==el)return;tick=el.currentTime;recordTick();refreshStudio();if(Math.floor(tick)%4===0)save()});
 el.addEventListener('play',refreshStudio);
 el.addEventListener('pause',refreshStudio);
 el.addEventListener('loadedmetadata',()=>{
  const t=currentTask();if(!t)return;
  if(Number.isFinite(el.duration)&&el.duration>1){
   if(!localVideos[t.id]&&Math.abs(el.duration-t.duration)>2){
    t.duration=Math.round(el.duration*100)/100;
    save();refreshStudio();
   }
   videoDimensions=el.videoWidth&&el.videoHeight?el.videoWidth+' × '+el.videoHeight:'';
   recordTick();refreshStudio();
  }
 });
 el.addEventListener('error',()=>{
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
function runKeydown(e:KeyboardEvent){if(view!=='studio'||modalOpen||(e.target instanceof Element&&e.target.matches('input,textarea,select,[contenteditable]')))return;if(e.code==='Space'){e.preventDefault();window.togglePlay?.()}else if(e.key==='ArrowLeft'){e.preventDefault();window.skipByStep?.(-1)}else if(e.key==='ArrowRight'){e.preventDefault();window.skipByStep?.(1)}}
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
 const t=currentTask();if(!t||me()?.role!=='admin')return;
 confirmInApp('Reopen annotation streams','Reopen both annotation streams for editing?',()=>{
  t.submitted={sponsors:false,context:false};save();render();notify('Task streams reopened');
 },{actionLabel:'REOPEN STREAMS',danger:false});
};
window.assignTaskModal=id=>{
 if(me()?.role!=='admin')return;
 const task=db.tasks.find(x=>x.id===id);
 if(!task)return notify('Match task not found.');
 if(modalOpen)return notify('Close the current dialog before assigning workers.');
 openDialog({type:'assign',task,users:db.users});
 (document.getElementById('assignSponsorWorker') as HTMLSelectElement|null)?.focus();
};
window.saveTaskAssignment=id=>{
 if(me()?.role!=='admin')return;
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

window.createTaskModal=(id='')=>{if(me()?.role!=='admin')return;openDialog({type:'task',task:db.tasks.find(t=>t.id===id),data:db,fixtures:OFFICIAL_FIXTURES});};
const checks=(name:string)=>[...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map(input=>input.value);
window.selectFixture=id=>{
 const fixture=fixtureById(id);if(!fixture)return;
 const fields:Record<string,string>={taskfixture:id,taskname:`${fixture.home} vs ${fixture.away}`,tasknumber:fixture.id,taskdate:fixture.date};
 for(const [key,value] of Object.entries(fields)){const input=document.getElementById(key) as HTMLInputElement|null;if(input)input.value=value;}
};
window.saveTask=id=>{
 if(me()?.role!=='admin')return;
 const name=formVal('taskname').trim(),number=formVal('tasknumber').trim(),minutes=Number(formVal('taskduration'));
 if(!name||!number||!Number.isFinite(minutes)||minutes<1)return notify('Add the task name, number and a valid footage duration.');
 if(db.tasks.some(task=>task.number.toLowerCase()===number.toLowerCase()&&task.id!==id))return notify('Task number must be unique.');
 let task=db.tasks.find(row=>row.id===id);
 const firstVal=formVal('periodFirstEnd'),secondVal=formVal('periodSecondStart');
 if((firstVal!=='')!==(secondVal!==''))return notify('Set both half boundaries, or leave both blank.');
 const firstEnd=Number(firstVal),secondStart=Number(secondVal);
 if(firstVal!==''&&(!Number.isFinite(firstEnd)||!Number.isFinite(secondStart)||firstEnd<=0||secondStart<firstEnd||secondStart>=minutes))return notify('Period mapping must satisfy 0 < first-half end ≤ second-half start < video duration.');
 const videoType=formVal('taskvideosrc') as 'none'|'https'|'ftp';
 const videoUrl=formVal('taskurl').trim();
 if(videoType==='https'&&videoUrl&&!/^https:\/\//i.test(videoUrl))return notify('Direct video links must start with https://');
 if(videoType==='ftp'&&videoUrl&&!/^(ftp|sftp):\/\//i.test(videoUrl))return notify('FTP links must start with ftp:// or sftp://');
 const fixtureId=formVal('taskfixture')||task?.fixtureId||'';
 if(!task&&fixtureId&&taskForFixture(fixtureId))return notify('This fixture already has a task. Open its existing entry in the Match Catalog.');
 const data={name,number,date:formVal('taskdate'),duration:Math.round(minutes*60*100)/100,
  periods:firstVal!==''?{firstEnd,secondStart}:null,sponsorGroupIds:checks('sgroups'),eventGroupIds:checks('egroups'),cameraGroupIds:checks('cgroups'),
  sponsorAnalystId:formVal('tsponsor'),contextAnalystId:formVal('tcontext'),videoType,videoUrl,fixtureId};
 if(task)Object.assign(task,data);
  else db.tasks.push({id:uid(),...data,sponsors:[],events:[],cameras:[],submitted:{sponsors:false,context:false},createdAt:tstamp()});
 save();window.closeModal?.();view='tasks';render();notify(id?'Task updated':'Task created');
};
window.groupModal=(kind,id='')=>{const groups=kind==='sponsor'?db.sponsorGroups:kind==='event'?db.eventGroups:db.cameraGroups;openDialog({type:'group',kind,group:groups.find(g=>g.id===id)});};
window.saveGroup=(kind,id)=>{
 if(me()?.role!=='admin')return;
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
window.addSponsorToCurrentTask=()=>{const task=currentTask();if(!task||me()?.role!=='admin')return;const group=db.sponsorGroups.find(row=>task.sponsorGroupIds.includes(row.id));if(!group){notify('Assign a sponsor list to the task first.');return}window.sponsorModal?.(group.id)};
window.sponsorModal=(gid,sid='')=>{const group=db.sponsorGroups.find(g=>g.id===gid);if(!group)return;openDialog({type:'sponsor',group,sponsor:group.sponsors.find(s=>s.id===sid)});};
// Trim transparent image margins before thumbnailing. A fixed 220 × 140
// thumbnail with transparent padding makes horizontal brand marks appear tiny.
function logoAlphaBounds(pixels:Uint8ClampedArray,width:number,height:number){
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
function cropLogoDataUrl(source:string):Promise<string>{
 return new Promise<string>((resolve,reject)=>{
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
function thumbnail(file:File):Promise<string>{
 return new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('Unable to read logo'));
  reader.onload=()=>cropLogoDataUrl(String(reader.result)).then(resolve,reject);
  reader.readAsDataURL(file);
 });
}
window.saveSponsor=async(gid,sid)=>{
 if(me()?.role!=='admin')return;
 const group=db.sponsorGroups.find(row=>row.id===gid),name=formVal('sname').trim();
 const file=(document.getElementById('simage') as HTMLInputElement|null)?.files?.[0];
 if(!group||!name)return notify('Sponsor name required');
 if(file&&file.size>6*1024*1024)return notify('Sponsor image must be under 6 MB');
 let logoData:string|undefined;
 try{if(file)logoData=await thumbnail(file)}catch{return notify('Could not read this logo image.')}
 let sponsor=group.sponsors.find(row=>row.id===sid);
 if(!sponsor){sponsor={id:uid(),name};group.sponsors.push(sponsor)}
 sponsor.name=name;sponsor.color=formVal('scolor');
 if(logoData){sponsor.logo=logoData;sponsor.logoTrimmed=true;}
 save();window.closeModal?.();render();notify('Sponsor saved');
};
window.deleteSponsor=(gid,sid)=>{let g=db.sponsorGroups.find(x=>x.id===gid);if(!g)return;let used=db.tasks.some(t=>t.sponsors.some(v=>v.sponsorId===sid));if(used)return notify('This brand has recorded annotations. Preserve the history; create a new list instead.');const sponsor=g.sponsors.find(x=>x.id===sid);confirmInApp('Delete sponsor',`Delete ${sponsor?.name||'this sponsor'} and its uploaded brand image from the list?`,()=>{g.sponsors=g.sponsors.filter(x=>x.id!==sid);save();render();notify('Sponsor removed')},{actionLabel:'DELETE SPONSOR'})};
window.attrItemModal=(kind,gid)=>openDialog({type:'item',kind,groupId:gid});
window.saveAttrItem=(kind,gid)=>{if(me()?.role!=='admin')return;const gs=kind==='event'?db.eventGroups:db.cameraGroups,g=gs.find(x=>x.id===gid),name=formVal('iname').trim();if(!g||!name)return notify('Attribute name required');g.items.push({id:uid(),name,...(kind==='event'?{kind:'range',highValue:!!(document.getElementById('ihigh') as HTMLInputElement|null)?.checked}: {})});save();window.closeModal?.();render()};
window.removeItem=(kind,gid,id)=>{let gs=kind==='event'?db.eventGroups:db.cameraGroups,g=gs.find(x=>x.id===gid);if(!g)return;const item=g.items.find(x=>x.id===id);if(!item)return;confirmInApp('Remove attribute',`Remove "${item.name}" from this list? Historical annotations may lose the display label.`,()=>{g.items=g.items.filter(x=>x.id!==id);save();render();notify('Attribute removed')},{actionLabel:'REMOVE ATTRIBUTE'})};
window.userModal=(id='')=>openDialog({type:'user',user:db.users.find(u=>u.id===id)});
window.resetMemberPassword=id=>{
  if(me()?.role!=='admin'||!db.users.some(u=>u.id===id&&u.role==='analyst'))return;
 const user=db.users.find(u=>u.id===id)!;
 confirmInApp('Reset worker password',`Reset ${user.name}'s password? Their existing sessions will be revoked. You must share the new temporary password yourself.`,()=>{
  void api.resetMemberPassword(workspaceId,id).then(async result=>{
   await loadWorkspace(workspaceId);
   openDialog({type:'credentials',name:result.user.name,email:result.user.email,
    temporaryPassword:result.temporaryPassword,purpose:'reset'});
  }).catch(error=>notify('Could not reset password: '+error.message));
 },{actionLabel:'RESET PASSWORD'});
};
window.saveUser=id=>{
 if(me()?.role!=='admin')return;
  if(id)return notify('Member details are managed by the account owner.');
  const name=formVal('uname').trim(),email=formVal('uemail').trim().toLowerCase();
  if(!name||!email)return notify('Name and email are required.');
   const role=formVal('urole');
   if(role!=='ANALYST'&&role!=='ADMIN')return notify('Select a valid role.');
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
 window.chooseReport=id=>{reportTaskId=id;render()};
window.showReport=id=>{reportTaskId=id;view='reports';render();window.scrollTo(0,0)};
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
function exportObject(t:TaskSummary){let spo=sponsorFor(t),evt=eventsFor(t),cam=camerasFor(t),d=insightData(t);return {schema:'seebot.sponsor_visibility.v1',exportedAt:tstamp(),task:{id:t.id,number:t.number,name:t.name,date:t.date,videoDurationSeconds:t.duration,videoSourceType:t.videoType,videoSourceUrl:t.videoUrl||null,videoFileName:t.videoName||null,matchPeriods:t.periods||null},assignment:{sponsorAnalyst:{id:t.sponsorAnalystId,name:nameUser(t.sponsorAnalystId)},eventAndCameraAnalyst:{id:t.contextAnalystId,name:nameUser(t.contextAnalystId)}},status:{label:taskStatus(t),...t.submitted},definition:{visibility:'Sponsor is visible anywhere in frame; simultaneous placements of the same sponsor are counted once.',timebase:'Seconds from beginning of video',eventOverlap:'Sponsors and event intervals are matched by positive duration overlap. Legacy point annotations (if present) are checked at their original timestamps.'},attributes:{sponsors:spo.map(s=>({id:s.id,name:s.name,list:s.groupName})),keyEvents:evt,cameraAngles:cam},annotations:{sponsorVisibility:t.sponsors.map(x=>({...x,durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null})),keyEvents:t.events.map(x=>({...x,name:labelFor(t,'events',x.eventId),durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null})),cameraAngles:t.cameras.map(x=>({...x,name:labelFor(t,'cameras',x.cameraId),durationSeconds:x.end==null?null:x.end-x.start,open:x.end==null}))},analytics:{uniqueSponsorsSeen:d.active.length,combinedBrandExposureSeconds:d.sumSeconds,sponsors:d.brands.map(s=>({id:s.id,name:s.name,exposureSeconds:s.seconds,percentageOfVideo:Math.round(10000*s.seconds/t.duration)/100,visibilityIntervals:s.entries,keyEventOverlaps:s.eventHits})),eventSponsorAssociations:t.events.map(e=>({eventId:e.id,tag:e.eventId,startSeconds:e.start,endSeconds:e.end,durationSeconds:e.end==null?null:e.end-e.start,sponsorIds:spo.filter(s=>d.brands.some(b=>b.id===s.id&&d.eventRows.some(event=>event.id===e.id&&event.brands.some(match=>match.id===s.id)))).map(s=>s.id)})),advanced:insightExport(d)}}}
window.exportTask=id=>{let t=db.tasks.find(x=>x.id===id);if(!t||!visibleTasks().some(x=>x.id===id))return;let s=JSON.stringify(exportObject(t),null,2),a=document.createElement('a'),url=URL.createObjectURL(new Blob([s],{type:'application/json'}));a.href=url;a.download=(t.number||'match')+'_sponsor_annotations.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('JSON exported — '+t.number)};
function render(){
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
 if(user.role!=='admin'&&['users','sponsors','attributes'].includes(view))view='dashboard';
 if(!['dashboard','tasks','studio','sponsors','attributes','users','reports'].includes(view))view='dashboard';
 const t=view==='studio'?currentTask():null;
 const localVideo=t?localVideos[t.id]:undefined;
 const videoSrc=localVideo?.url||(t&&((t.videoType==='https'||t.videoType==='s3')&&t.videoUrl)?t.videoUrl:null);
 const heading=t?studioSidebarHeading():null;
 const currentCamera=t?.cameras.find(x=>x.end==null);
 const studioModel=t?{
  id:t.id,number:t.number,name:t.name,date:t.date,duration:t.duration,
  videoName:localVideo?.name||t.videoName,videoType:t.videoType,videoSrc,isLocalVideo:!!localVideo,
  status:taskStatus(t),sponsorAnalyst:nameUser(t.sponsorAnalystId),contextAnalyst:nameUser(t.contextAnalystId),
  canSponsor:canEdit(t,'sponsors'),canContext:canEdit(t,'context'),
  selectedTab:studioTab,tick,sponsorCount:t.sponsors.filter(x=>x.end==null).length,
  logCount:t.sponsors.length+t.events.length+t.cameras.length,
  cameraLabel:currentCamera?labelFor(t,'cameras',currentCamera.cameraId):'CAMERA NOT SELECTED',
  railTitle:heading!.title,railHint:heading!.hint,submitted:t.submitted||{sponsors:false,context:false},
  task:t,sponsors:sponsorFor(t),events:eventsFor(t),cameras:camerasFor(t),
  seekStep,playbackRate,videoDimensions,videoError,playing:!!videoEl&&!videoEl.paused
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
 mount(view,{user:{name:user.name,role:user.role},taskId:selectedTaskId,data:db,viewerId:logged,fixtures:OFFICIAL_FIXTURES,badges:BADGES,fixtureSyncLabel,fixtureDay,taskFilter,studio:studioModel,reports:reportsModel,workspaceName:liveWorkspaces.find(x=>x.workspace.id===workspaceId)?.workspace.name,workspaces:liveWorkspaces.map(x=>x.workspace)},()=>{
  if(view==='studio')attachVideo();
 });
}
refreshFixtureFeed();
const fixtureRefreshId=setInterval(refreshFixtureFeed,5*60*1000);
render();
void loadLiveSession().catch(()=>{logged='';remoteUser=null;passwordChangeRequired=false;render()});
return ()=>{
 clearInterval(fixtureRefreshId);
 document.removeEventListener('keydown',runKeydown);
 document.getElementById('videofile')?.removeEventListener('change',handleVideoFileChange);
 clearLocalVideos();
};
}

const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const errors=[];
const virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',e=>errors.push(String(e)));
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',virtualConsole,
 beforeParse(window){
  window.confirm=()=>true;
  window.fetch=async()=>({ok:false,status:404});
  window.scrollTo=()=>{};
  window.HTMLMediaElement.prototype.play=()=>Promise.resolve();
  window.HTMLMediaElement.prototype.pause=()=>{};
 }});
const {window}=dom,document=window.document;
function db(){
 const key=Object.keys(window.localStorage).find(k=>k.includes('sponsor')||k.includes('messi'));
 const matches=Object.keys(window.localStorage).map(k=>{try{return JSON.parse(window.localStorage.getItem(k))}catch{return null}});
 return matches.find(v=>v&&Array.isArray(v.tasks));
}
function expect(expr,message){assert.ok(expr,message)}
(async()=>{
 await new Promise(resolve=>setImmediate(resolve));
 expect(document.querySelector('#loginemail'),'login screen');
 window.fillDemo('admin@demo.seebot.ai');
 window.login({preventDefault(){}});
 expect(document.querySelector('.ops-nav'),'admin dashboard');
 window.openTask('task_demo1');
 expect(document.querySelector('.studio-grid'),'studio rendered');
 expect(document.querySelector('.sponsor-rail'),'sponsor sidebar rendered');
 expect(document.querySelector('.video-box'),'video player rendered');
 expect(document.querySelectorAll('.rail-brand').length>=3,'sponsor cards present');
 expect(document.querySelectorAll('.event-chip:not(.camera-chip)').length>=3,'compact event chips present');
 expect(document.querySelectorAll('.camera-chip').length>=2,'camera chips present');
 let sponsor=document.querySelector('.rail-brand');
 sponsor.click();
 assert.equal(document.querySelector('.rail-brand').getAttribute('aria-pressed'),'true');
 window.setSeekStep(10);
 window.skipByStep(1);
 assert.equal(document.getElementById('skipForward').textContent,'+10s');
 expect(document.getElementById('vidtime').textContent.startsWith('00:10'),'seek at 10s');
 document.querySelector('.rail-brand').click();
 assert.equal(document.querySelector('.rail-brand').getAttribute('aria-pressed'),'false');
 const eventId=db().tasks.find(t=>t.id==='task_demo1').events.length;
 const eventButton=document.querySelector('.event-chip:not(.camera-chip)');
 eventButton.click();
 window.skipByStep(1);
 document.querySelector('.event-chip:not(.camera-chip)').click();
 let task=db().tasks.find(t=>t.id==='task_demo1');
 assert.equal(task.events.length,eventId+1,'event created');
 assert.equal(task.events.at(-1).kind,'range','all key events are intervals');
 assert.equal(task.events.at(-1).start,10,'event started at 10s');
 assert.equal(task.events.at(-1).end,20,'event ended at 20s');
 document.querySelector('.camera-chip').click();
 window.skipByStep(1);
 document.querySelectorAll('.camera-chip')[1].click();
 window.skipByStep(1);
 document.querySelectorAll('.camera-chip')[1].click();
 task=db().tasks.find(t=>t.id==='task_demo1');
 assert.equal(task.cameras.length,2,'camera switch creates second interval');
 assert.deepEqual(task.cameras.map(c=>[c.start,c.end]),[[20,30],[30,40]],'camera intervals close correctly');
 expect(document.querySelector('#logBody').textContent.includes('00:20'),'event ending present in log');
 expect(!document.querySelector('#sponsorRail').textContent.includes('No sponsors assigned'),'sponsor list still rendered');
 expect(html.includes('position:sticky;top:0;z-index:10'),'video pinned to workspace');
 assert.deepEqual(errors,[],'no uncaught DOM errors');
 console.log('PASS login, sponsor sidebar, sponsor start/stop, adjustable seeking, event interval, camera interval and switching, log timestamps');
 dom.window.close();
})().catch(err=>{console.error(err);dom.window.close();process.exit(1)});

import React from 'react';
import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../src/components/AppShell';
import { InsightsScreen } from '../src/components/InsightsScreen';
import type { ReportsScreenModel } from '../src/types/screen';
import type { CameraAnnotation, EventAnnotation, SponsorAnnotation, TaskSummary } from '../src/types/models';

// Screenshot-only fixture. No customer or production data is used.
const author = { createdAt: '2026-11-01', createdBy: 'preview-analyst' };
const duration = 4200;
const brandNames = ['MESSI CUP', 'PANINI', 'ADIDAS', 'GATORADE', 'MASTERCARD', 'BMO', 'VISA', 'NIKE'];
const brands = brandNames.map((name, i) => ({ id: `s${i}`, name, color: ['#ff982b','#e76b78','#ffb46c','#77cfac','#a2a8ff','#ffe2b4','#d58dea','#8fd1e7'][i] }));
const sponsorAnnotations: SponsorAnnotation[] = brands.flatMap((sponsor, i) => {
  const rows: SponsorAnnotation[] = [];
  for (let j = 0; j < 33 - i * 2; j++) {
    const start = (j * (121 + i * 3) + i * 41 + (j % 5) * 23) % (duration - 150);
    const end = Math.min(duration, start + 5 + (j * 13 + i * 7) % 31);
    rows.push({ id: `s-${i}-${j}`, sponsorId: sponsor.id, start, end, ...author,
      placement: ['led','static_board','jersey','stadium_screen'][j%4],
      quality: j%7 === 0 ? 'partially_readable' : 'readable',
      properties: j%9 === 0 ? { clarity:'unclear' } : {},
    });
  }
  return rows;
});
const eventNames = [
  { id: 'goal', name: 'Goal', highValue: true },
  { id: 'celebration', name: 'Goal celebration', highValue: true },
  { id: 'corner', name: 'Corner' },
  { id: 'foul', name: 'Foul play' },
  { id: 'substitution', name: 'Substitution' },
  { id: 'free', name: 'Free kick' },
];
const eventRows: EventAnnotation[] = [
  ['goal', 215, 231], ['celebration', 231, 255], ['corner', 460, 482], ['foul', 690, 712],
  ['goal', 1195, 1213], ['celebration', 1214, 1245], ['free', 1550, 1582], ['corner', 1810, 1840],
  ['goal', 2510, 2527], ['celebration', 2528, 2551], ['substitution', 2830, 2864],
  ['foul', 3130, 3150], ['goal', 3440, 3466], ['celebration', 3467, 3491], ['corner', 3890, 3915],
].map(([eventId, start, end], i) => ({ id:`e-${i}`, eventId:String(eventId), kind:'range', start:Number(start), end:Number(end), ...author }));

const cameraNames = [
  { id:'center', name:'Wide - Center' },
  { id:'goal', name:'Wide - Left goal' },
  { id:'zoom', name:'Close-up / zoomed' },
  { id:'replay', name:'Replay angle' },
  { id:'sideline', name:'Bench / sideline' },
  { id:'netcam', name:'Right netcam' },
];
const cameraRows: CameraAnnotation[] = [];
let position = 0, shot = 0;
while (position < duration) {
  const cameraId = cameraNames[[0,0,1,2,0,4,0,3,0,5,0,2][shot % 12]].id;
  const length = cameraId==='replay'?9:cameraId==='zoom'?13:20+(shot*7)%19;
  const end = Math.min(duration,position + length);
  cameraRows.push({ id:`c-${shot}`,cameraId,start:position,end,...author });
  position=end;shot++;
}

const task:TaskSummary = {
  id:'screenshot-preview',number:'MC26 · DEMO',name:'Sample match — annotated broadcast',
  date:'2026-11-01',duration,observedTime:duration,fixtureId:'preview-match',
  sponsorGroupIds:['sponsors'],eventGroupIds:['events'],cameraGroupIds:['cameras'],
  sponsorAnalystId:'preview-analyst',contextAnalystId:'preview-analyst',
  sponsors:sponsorAnnotations,events:eventRows,cameras:cameraRows,periods:{firstEnd:1980,secondStart:2160},
  submitted:{sponsors:true,context:true},createdAt:'2026-11-01',
};
const model:ReportsScreenModel = {
  tasks:[{id:task.id,name:task.name,number:task.number}],selectedId:task.id,selectedTask:task,focusId:'',
  fixtures:[{id:'preview-match',date:'2026-11-01',home:'Team A',away:'Team B',group:'ILLUSTRATIVE MATCH',score:'2–2',venue:'Sample stadium'}],
  badges:{},visibleTasks:[task],data:{tasks:[task],users:[],sponsorGroups:[{id:'sponsors',name:'Sample brands',sponsors:brands}],
    eventGroups:[{id:'events',name:'Sample events',items:eventNames.map(event=>({...event,kind:'range'}))}],
    cameraGroups:[{id:'cameras',name:'Sample cameras',items:cameraNames}],
  },
};
const html = renderToStaticMarkup(<AppShell screen="reports" context={{user:{name:'Preview Analyst',role:'admin'},workspaceName:'Messi Cup · Preview'}}>
  <InsightsScreen model={model}/>
</AppShell>);
writeFileSync('preview-insights.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sponsor Studio — Insights development screenshot</title><link rel="stylesheet" href="/src/styles/original.css"/><link rel="stylesheet" href="/src/styles/workspace-theme.css"/><link rel="stylesheet" href="/src/styles/context-intelligence.css"/>
<style>.preview-label{position:fixed;z-index:200;right:18px;bottom:18px;background:#1f2022;border:1px solid #f99a42;color:#ffbf80;padding:11px 16px;border-radius:9px;font:800 11px 'Manrope',sans-serif;box-shadow:0 6px 25px #000a}.preview-label strong{display:block;color:white;font-size:12px;margin-bottom:3px}</style>
</head><body>${html}<div class="preview-label"><strong>DEVELOPMENT LAYOUT PREVIEW</strong>Representative data · not match results</div></body></html>`);

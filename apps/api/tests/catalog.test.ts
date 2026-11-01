import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCatalog } from '../src/modules/workspaces';

test('server accepts a larger original PNG catalog and preserves custom list order',()=>{
  const originalPng='data:image/png;base64,'+'A'.repeat(600_000);
  const payload={sponsorGroups:[{id:'new',name:'New list',sponsors:[
    {id:'second',name:'Second',logo:originalPng,color:'#ffaa44',hotkey:''},
    {id:'first',name:'First',hotkey:'ctrl+1'},
  ]},{id:'old',name:'Old list',sponsors:[]}],eventGroups:[{id:'events',name:'Events',items:[
    {id:'goal',name:'Goal',hotkey:'q'},{id:'pass',name:'Pass',hotkey:'w'},
  ]}],cameraGroups:[]};
  const output=validateCatalog(payload) as typeof payload;
  assert.deepEqual(output.sponsorGroups.map(group=>group.id),['new','old']);
  assert.deepEqual(output.sponsorGroups[0].sponsors.map(item=>item.id),['second','first']);
  assert.equal(output.sponsorGroups[0].sponsors[0].logo,originalPng);
  assert.deepEqual(output.eventGroups[0].items.map(item=>item.id),['goal','pass']);
});

test('server enforces its bounded 8 MB catalog cap',()=>{
  const payload={sponsorGroups:[{id:'g',name:'Sponsors',sponsors:[
    {id:'s',name:'Oversized',logo:'data:image/png;base64,'+'A'.repeat(8*1024*1024)},
  ]}],eventGroups:[],cameraGroups:[]};
  assert.throws(()=>validateCatalog(payload),/8 MB/);
});

test('server preserves nested sponsor properties and rejects invalid defaults',()=>{
  const sponsor={id:'sponsor',name:'Gatorade',properties:[{
    id:'clarity',name:'Clarity',defaultOptionId:'clearly-visible',
    options:[{id:'clearly-visible',label:'Clearly visible'},{id:'unclear',label:'Unclear'}],
  }]};
  const payload={sponsorGroups:[{id:'brands',name:'Brands',sponsors:[sponsor]}],eventGroups:[],cameraGroups:[]};
  const saved=validateCatalog(payload) as typeof payload;
  assert.deepEqual(saved.sponsorGroups[0].sponsors[0].properties,sponsor.properties);
  assert.throws(()=>validateCatalog({...payload,sponsorGroups:[{id:'brands',name:'Brands',sponsors:[
    {...sponsor,properties:[{...sponsor.properties[0],defaultOptionId:'not-an-option'}]},
  ]}]}),/default sponsor property value/);
});

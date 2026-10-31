import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {FixtureController,mergeFixtureSnapshots,type PublicFixture} from '../src/modules/fixtures';
import type {DatabaseService} from '../src/modules/database';

const fixture=(id:string,date:string,status:string,score:string):PublicFixture=>
  ({id,date,home:'Home',away:'Away',status,score});

test('full catalog merge adds future matches, updates unfinished matches on any date and locks finals',()=>{
  const current=[fixture('M1','2026-10-25','finished','2 : 1'),fixture('M2','2026-10-26','scheduled','')];
  const incoming=[fixture('M1','2026-10-25','finished','9 : 9'),fixture('M2','2026-10-26','finished','0 : 0'),fixture('M3','2026-11-01','scheduled','')];
  const result=mergeFixtureSnapshots(current,incoming);
  assert.deepEqual({added:result.added,updated:result.updated},{added:1,updated:1});
  assert.equal(result.matches.find(f=>f.id==='M1')?.score,'2 : 1');
  assert.equal(result.matches.find(f=>f.id==='M2')?.score,'0 : 0');
  assert.equal(result.matches.find(f=>f.id==='M3')?.date,'2026-11-01');
});

function fakeDatabase(seed:PublicFixture[]=[]){
  const snapshots=new Map(seed.map(f=>[f.id,{id:f.id,payload:f,finalized:f.status==='finished'}]));
  const fixtureSnapshot={
    findMany:async()=>[...snapshots.values()],
    createMany:async({data}:{data:{id:string;payload:PublicFixture;finalized:boolean}[]})=>{
      for(const row of data)if(!snapshots.has(row.id))snapshots.set(row.id,row);
    },
    updateMany:async({where,data}:{where:{id:string;finalized:boolean};data:{payload:PublicFixture;finalized:boolean}})=>{
      const row=snapshots.get(where.id);
      if(row&&row.finalized===where.finalized)snapshots.set(where.id,{...row,...data});
    },
  };
  const db={fixtureSnapshot,$transaction:async(fn:(tx:{fixtureSnapshot:typeof fixtureSnapshot})=>Promise<unknown>)=>fn({fixtureSnapshot})};
  return {db:db as unknown as DatabaseService,snapshots};
}

test('sync persists new match records, resolves team names, and never overwrites final scores',async()=>{
  const previousFetch=globalThis.fetch;
  const {db}=fakeDatabase([fixture('M1','2026-10-25','finished','2 : 1'),fixture('M2','2026-10-26','scheduled','')]);
  const matches=[
    {id:'source1',code:'M1',date:'2026-10-25',status:'finished',home_score:9,away_score:9,home_id:'h',away_id:'a'},
    {id:'source2',code:'M2',date:'2026-10-26',status:'finished',home_score:0,away_score:0,home_id:'h',away_id:'a'},
    {id:'source3',code:'M3',date:'2026-11-01',status:'scheduled',home_id:'h',away_id:'a',time:'12:30'},
  ];
  globalThis.fetch=async(input)=>({ok:true,json:async()=>String(input).includes('/Team?')?
    {items:[{id:'h',name:'Home FC',logo:'https://example.com/home.png'},{id:'a',name:'Away FC'}]}:{items:matches}}) as Response;
  try{
    const controller=new FixtureController(db);
    const result=await controller.sync();
    assert.equal(result.added,1);
    assert.equal(result.updated,1);
    assert.equal(result.matches.length,3);
    assert.equal(result.matches.find(f=>f.id==='M1')?.score,'2 : 1');
    assert.equal(result.matches.find(f=>f.id==='M2')?.score,'0 : 0');
    assert.equal(result.matches.find(f=>f.id==='M3')?.home,'Home FC');
    assert.equal((await new FixtureController(db).catalog()).matches.length,3,'new session reads saved catalog');

    matches[1].home_score=8;matches[1].away_score=7;
    const again=await new FixtureController(db).sync();
    assert.equal(again.matches.find(f=>f.id==='M2')?.score,'0 : 0','second sync cannot change a published final');
  }finally{globalThis.fetch=previousFetch;}
});

test('failed upstream request preserves the stored catalog',async()=>{
  const previousFetch=globalThis.fetch;
  const {db,snapshots}=fakeDatabase([fixture('M1','2026-10-25','finished','2 : 1')]);
  globalThis.fetch=async()=>{throw Error('upstream outage');};
  try{
    await assert.rejects(()=>new FixtureController(db).sync(),{name:'BadGatewayException'});
    assert.equal(snapshots.size,1);
    assert.equal((await new FixtureController(db).catalog()).matches[0].score,'2 : 1');
  }finally{globalThis.fetch=previousFetch;}
});

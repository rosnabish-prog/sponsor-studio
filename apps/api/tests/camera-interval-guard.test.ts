import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnnotationService, type CreateAnnotationDto } from '../src/modules/annotations';
import { planCameraRepairs } from '../src/modules/camera-integrity';

test('closed camera annotations overlapping saved footage are rejected before insertion',async()=>{
  let created=false;
  const task={durationSeconds:3600,contextAnalystId:'admin',contextSubmittedAt:null};
  const transaction={
    $queryRaw:async()=>[],task:{findUnique:async()=>task},
    annotation:{findFirst:async()=>({id:'existing',start:10,end:45}),create:async()=>{created=true;return {};},count:async()=>0},
    auditLog:{create:async()=>({})},
  };
  const database={$transaction:async<T>(operation:(tx:typeof transaction)=>Promise<T>)=>operation(transaction)};
  const tasks={find:async()=>({task,role:'ADMIN'})};
  const service=new AnnotationService(database as never,tasks as never);
  await assert.rejects(()=>service.create('workspace','task','admin',{
    kind:'CAMERA',labelId:'wide',start:20,end:30,
  } as CreateAnnotationDto),/overlaps another saved or LIVE angle/);
  assert.equal(created,false);
});

test('camera repair is deterministic and clips old angles without touching nonconflicting rows',()=>{
  const date=(n:number)=>new Date(`2026-11-04T00:00:0${n}.000Z`);
  const rows=[
    {id:'a',start:0,end:100,createdAt:date(0)},
    {id:'b',start:20,end:45,createdAt:date(1)},
    {id:'c',start:20,end:90,createdAt:date(2)},
    {id:'d',start:60,end:70,createdAt:date(3)},
    {id:'e',start:75,end:null,createdAt:date(4)},
  ];
  assert.deepEqual(planCameraRepairs(rows),[
    {id:'a',end:20},{id:'b',remove:true},{id:'c',end:60},
  ]);
  assert.deepEqual(planCameraRepairs([
    {id:'one',start:0,end:10,createdAt:date(0)},
    {id:'two',start:10,end:null,createdAt:date(1)},
  ]),[]);
});

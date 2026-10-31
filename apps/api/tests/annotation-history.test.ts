import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnnotationService, annotationSnapshot } from '../src/modules/annotations';

test('API edits, soft-deletes, and restores exactly one camera interval with immutable history',async()=>{
  const now=new Date('2026-10-30T12:00:00.000Z');
  const first={id:'a',taskId:'task',kind:'CAMERA' as const,labelId:'wide',start:10,end:20,
    placement:null,quality:null,createdBy:'admin',createdAt:now,updatedAt:now,revision:1,deletedAt:null as Date|null,deletedBy:null as string|null};
  const later={...first,id:'b',labelId:'bench',start:20,end:40};
  const rows=[first,later];
  const laterBefore=JSON.stringify(later);
  const revisions=[{id:'v1',taskId:'task',annotationId:'a',version:1,action:'BASELINE',
    snapshot:annotationSnapshot(first),actorId:'admin',createdAt:now}];
  const match=(where:Record<string,unknown>)=>rows.find(row=>
    (where.id===undefined||row.id===where.id)&&
    (where.taskId===undefined||row.taskId===where.taskId)&&
    (where.deletedAt===undefined||row.deletedAt===where.deletedAt));
  const tx={
    $queryRaw:async()=>[],task:{findUnique:async()=>({id:'task',contextSubmittedAt:null})},
    annotation:{
      findFirst:async({where}:{where:Record<string,unknown>})=>match(where),
      update:async({where,data}:{where:{id:string};data:Record<string,unknown>})=>{
        const row=rows.find(entry=>entry.id===where.id)!;
        const {revision,...rest}=data;
        Object.assign(row,rest);
        if(revision)row.revision++;
        return {...row};
      },
      count:async()=>0,
    },
    annotationRevision:{
      create:async({data}:{data:Record<string,unknown>})=>{
        revisions.push({id:`v${revisions.length+1}`,createdAt:now,...data} as typeof revisions[number]);
      },
      findUnique:async({where}:{where:{annotationId_version:{annotationId:string;version:number}}})=>
        revisions.find(row=>row.annotationId===where.annotationId_version.annotationId&&row.version===where.annotationId_version.version),
    },
    auditLog:{create:async()=>({})},
  };
  const db={annotation:tx.annotation,annotationRevision:{findMany:async()=>revisions},
    $transaction:async<T>(fn:(transaction:typeof tx)=>Promise<T>)=>fn(tx)};
  const tasks={find:async()=>({role:'ADMIN',task:{id:'task',durationSeconds:100,contextAnalystId:'admin',contextSubmittedAt:null}})};
  const service=new AnnotationService(db as never,tasks as never);

  const updated=await service.update('workspace','task','a','admin',{expectedRevision:1,start:9,end:19});
  assert.equal(updated.revision,2);
  assert.equal(revisions.length,2);
  assert.equal(revisions[1].action,'UPDATED');
  assert.equal(JSON.stringify(later),laterBefore,'second camera untouched after edit');

  await assert.rejects(()=>service.update('workspace','task','a','admin',{
    expectedRevision:1,start:6,
  }),/annotation changed/);
  assert.equal(first.start,9,'stale update does not mutate first camera');

  const removed=await service.remove('workspace','task','a','admin',{expectedRevision:2});
  assert.equal(removed.ok,true);
  assert.ok(first.deletedAt,'soft delete retains the row');
  assert.equal(revisions.at(-1)?.action,'SOFT_DELETED');
  assert.equal(JSON.stringify(later),laterBefore,'second camera untouched after delete');

  const restored=await service.restore('workspace','task','a','admin',{
    version:1,expectedRevision:3,
  });
  assert.equal(restored.revision,4);
  assert.equal(restored.start,10);
  assert.equal(restored.end,20);
  assert.equal(restored.deletedAt,null);
  assert.equal(revisions.at(-1)?.action,'RESTORED');
  assert.equal(JSON.stringify(later),laterBefore,'second camera untouched after restore');
  assert.equal(revisions.length,4,'history keeps all four states');
});

import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnnotationService, type CreateAnnotationDto } from '../src/modules/annotations';

test('API rejects a second live camera even when its label differs',async()=>{
  let created=false;
  const task={durationSeconds:3600,contextAnalystId:'admin',contextSubmittedAt:null};
  const transaction={
    $queryRaw:async()=>[],
    task:{findUnique:async()=>task},
    annotation:{
      findFirst:async()=>null,
      count:async()=>1,
      create:async()=>{created=true;return {id:'created'};},
    },
    auditLog:{create:async()=>({})},
  };
  const database={$transaction:async<T>(operation:(tx:typeof transaction)=>Promise<T>)=>operation(transaction)};
  const tasks={find:async()=>({task,role:'ADMIN'})};
  const service=new AnnotationService(database as never,tasks as never);
  await assert.rejects(
    ()=>service.create('workspace','task','admin',{
      kind:'CAMERA',labelId:'close-up',start:35,
    } as CreateAnnotationDto),
    /Only one camera angle can be live/,
  );
  assert.equal(created,false);
});

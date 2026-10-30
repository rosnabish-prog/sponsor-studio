import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkspaceService } from '../src/modules/workspaces';
import type { DatabaseService } from '../src/modules/database';

type Role = 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';
type Member = { workspaceId:string; userId:string; role:Role };
type AssignedTask = { workspaceId:string; sponsorAnalystId:string|null; contextAnalystId:string|null; annotations:{id:string}[] };

function fixture() {
  const workspaceId='workspace-a', otherWorkspace='workspace-b', ownerId='owner', adminId='admin', analystId='analyst';
  const memberships:Member[]=[
    {workspaceId,userId:ownerId,role:'OWNER'},
    {workspaceId,userId:adminId,role:'ADMIN'},
    {workspaceId,userId:analystId,role:'ANALYST'},
    {workspaceId:otherWorkspace,userId:analystId,role:'ANALYST'},
  ];
  const tasks:AssignedTask[]=[
    {workspaceId,sponsorAnalystId:analystId,contextAnalystId:analystId,annotations:[{id:'recorded-sponsor'}]},
    {workspaceId,sponsorAnalystId:adminId,contextAnalystId:null,annotations:[{id:'recorded-event'}]},
    {workspaceId:otherWorkspace,sponsorAnalystId:analystId,contextAnalystId:analystId,annotations:[{id:'other-workspace'}]},
  ];
  const audit:{workspaceId:string;actorId:string;action:string;subjectId:string;details:unknown}[]=[];
  const tx={
    membership:{
      findUnique:async({where}:{where:{workspaceId_userId:{workspaceId:string;userId:string}}})=>
        memberships.find(x=>x.workspaceId===where.workspaceId_userId.workspaceId&&x.userId===where.workspaceId_userId.userId)||null,
      delete:async({where}:{where:{workspaceId_userId:{workspaceId:string;userId:string}}})=>{
        const index=memberships.findIndex(x=>x.workspaceId===where.workspaceId_userId.workspaceId&&x.userId===where.workspaceId_userId.userId);
        if(index<0)throw Error('Member not found');
        return memberships.splice(index,1)[0];
      },
    },
    task:{updateMany:async({where,data}:{where:{workspaceId:string;sponsorAnalystId?:string;contextAnalystId?:string};data:{sponsorAnalystId?:null;contextAnalystId?:null}})=>{
      let count=0;
      for(const task of tasks){
        if(task.workspaceId!==where.workspaceId)continue;
        if(where.sponsorAnalystId&&task.sponsorAnalystId===where.sponsorAnalystId){task.sponsorAnalystId=data.sponsorAnalystId??null;count++;}
        if(where.contextAnalystId&&task.contextAnalystId===where.contextAnalystId){task.contextAnalystId=data.contextAnalystId??null;count++;}
      }
      return {count};
    }},
    auditLog:{create:async({data}:{data:typeof audit[number]})=>{audit.push(data);return data;}},
  };
  const service=new WorkspaceService({$transaction:async(fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)} as unknown as DatabaseService);
  return {service,workspaceId,otherWorkspace,ownerId,adminId,analystId,memberships,tasks,audit};
}

test('only owners can remove other admins and analysts; tasks and annotations are preserved',async()=>{
  const f=fixture();
  await assert.rejects(f.service.removeMember(f.workspaceId,f.adminId,f.analystId),{status:403});
  await assert.rejects(f.service.removeMember(f.workspaceId,f.analystId,f.adminId),{status:403});
  await assert.rejects(f.service.removeMember(f.workspaceId,f.ownerId,f.ownerId),{status:403});
  assert.equal(f.memberships.length,4,'forbidden requests leave memberships unchanged');
  const result=await f.service.removeMember(f.workspaceId,f.ownerId,f.analystId);
  assert.deepEqual(result,{ok:true,unassignedStreams:2});
  assert.equal(f.tasks[0].sponsorAnalystId,null);
  assert.equal(f.tasks[0].contextAnalystId,null);
  assert.deepEqual(f.tasks[0].annotations,[{id:'recorded-sponsor'}]);
  assert.equal(f.tasks[2].sponsorAnalystId,f.analystId,'other workspace assignment preserved');
  assert.ok(f.memberships.some(m=>m.workspaceId===f.otherWorkspace&&m.userId===f.analystId),'other workspace membership preserved');
  assert.ok(!f.memberships.some(m=>m.workspaceId===f.workspaceId&&m.userId===f.analystId));
  assert.deepEqual(f.audit[0],{workspaceId:f.workspaceId,actorId:f.ownerId,action:'MEMBER_REMOVED',subjectId:f.analystId,details:{previousRole:'ANALYST',unassignedStreams:2}});
  assert.deepEqual(await f.service.removeMember(f.workspaceId,f.ownerId,f.adminId),{ok:true,unassignedStreams:1});
  assert.deepEqual(f.tasks[1].annotations,[{id:'recorded-event'}]);
  await assert.rejects(f.service.removeMember(f.workspaceId,f.ownerId,f.adminId),{status:404});
});

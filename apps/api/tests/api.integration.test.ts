import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('registration, workspace isolation, assignments, annotation lifecycle and submission', {
  skip: !process.env.TEST_DATABASE_URL && 'Requires TEST_DATABASE_URL pointing at an isolated PostgreSQL test database',
}, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { NestFactory } = await import('@nestjs/core');
  const { ValidationPipe } = await import('@nestjs/common');
  const { default: cookieParser } = await import('cookie-parser');
  // Integration tests run against the compiled NestJS output. esbuild/tsx does not
  // emit the decorator metadata that NestJS dependency injection requires.
  const { AppModule } = await import('../dist/modules/app.module.js');
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as { port: number };
  const url = `http://127.0.0.1:${port}/api`;
  const run = async (path: string, method = 'GET', body?: unknown, cookie?: string) => {
    const result = await fetch(url + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await result.json() as Record<string, any>;
    return { status: result.status, json, cookie: result.headers.get('set-cookie')?.split(';')[0] };
  };
  try {
    const suffix = Math.random().toString(36).slice(2, 12);
    const alice = await run('/auth/register', 'POST', { name: 'Alice', email: `alice-${suffix}@example.org`, password: 'safe-test-password-A1' });
    const bob = await run('/auth/register', 'POST', { name: 'Bob', email: `bob-${suffix}@example.org`, password: 'safe-test-password-B1' });
    assert.equal(alice.status, 201, JSON.stringify(alice.json));
    assert.equal(bob.status, 201, JSON.stringify(bob.json));
    assert.ok(alice.cookie);
    assert.ok(bob.cookie);
    const me = await run('/auth/me', 'GET', undefined, alice.cookie);
    assert.equal(me.json.user.name, 'Alice');
    const workspace = await run('/workspaces', 'POST', { name: 'Integration Test' }, alice.cookie);
    assert.equal(workspace.status, 201, JSON.stringify(workspace.json));
    const workspaceId: string = workspace.json.id;
    const emptyCatalog=await run(`/workspaces/${workspaceId}/catalog`,'GET',undefined,alice.cookie);
    assert.equal(emptyCatalog.json.version,0);
    const definitions={sponsorGroups:[{id:'sg_main',name:'Main',sponsors:[{id:'s_test',name:'Test sponsor'}]}],eventGroups:[],cameraGroups:[]};
    const savedCatalog=await run(`/workspaces/${workspaceId}/catalog`,'PUT',{payload:definitions,version:0},alice.cookie);
    assert.equal(savedCatalog.status,200,JSON.stringify(savedCatalog.json));
    assert.equal(savedCatalog.json.version,1);
    assert.equal((await run(`/workspaces/${workspaceId}/catalog`,'PUT',{payload:definitions,version:0},alice.cookie)).status,409);
    assert.equal((await run(`/workspaces/${workspaceId}/tasks`, 'GET', undefined, bob.cookie)).status, 404);
    assert.equal((await run(`/workspaces/${workspaceId}/members`, 'POST', { email: `bob-${suffix}@example.org`, role: 'ANALYST' }, alice.cookie)).status, 201);
    const task = await run(`/workspaces/${workspaceId}/tasks`, 'POST', {
      number: `M-${suffix}`, name: 'Test match', durationSeconds: 100, sponsorAnalystId: bob.json.user.id,
      metadata:{sponsorGroupIds:['sg_main'],eventGroupIds:[],cameraGroupIds:[],videoType:'none',videoUrl:''},
    }, alice.cookie);
    assert.equal(task.status, 201, JSON.stringify(task.json));
    assert.deepEqual(task.json.metadata.sponsorGroupIds,['sg_main']);
    const path = `/workspaces/${workspaceId}/tasks/${task.json.id}`;
    assert.equal((await run(path, 'GET', undefined, bob.cookie)).status, 200);
    assert.equal((await run(path+'/videos','POST',{filename:'video.mp4',mimeType:'video/mp4',sizeBytes:10_000_000},bob.cookie)).status,503);
    assert.equal((await run(`/workspaces/${workspaceId}/tasks`, 'POST', { number: 'NO', name: 'No' }, bob.cookie)).status, 403);
    const annotation = await run(path + '/annotations', 'POST', { kind: 'SPONSOR', labelId: 's_test', start: 20 }, bob.cookie);
    assert.equal(annotation.status, 201, JSON.stringify(annotation.json));
    assert.equal((await run(path + '/submit', 'POST', { stream: 'sponsors' }, bob.cookie)).status, 409);
    assert.equal((await run(path + `/annotations/${annotation.json.id}`, 'PATCH', { end: 25,expectedRevision:1 }, bob.cookie)).status, 200);
    assert.equal((await run(path + '/submit', 'POST', { stream: 'sponsors' }, bob.cookie)).status, 201);
    assert.equal((await run(path + `/annotations/${annotation.json.id}`, 'PATCH', { quality: 'clear',expectedRevision:2 }, bob.cookie)).status, 403);
    assert.equal((await run(path + '/reopen', 'POST', { stream: 'sponsors' }, bob.cookie)).status, 403);
    assert.equal((await run(path + '/reopen', 'POST', { stream: 'sponsors' }, alice.cookie)).status, 201);
    assert.equal((await run(path + `/annotations/${annotation.json.id}`, 'PATCH', { quality: 'clear',expectedRevision:2 }, bob.cookie)).status, 200);
    // The server allows only one live camera; the UI closes it before switching.
    const firstCamera=await run(path+'/annotations','POST',{kind:'CAMERA',labelId:'wide',start:10},alice.cookie);
    assert.equal(firstCamera.status,201,JSON.stringify(firstCamera.json));
    assert.equal((await run(path+'/annotations','POST',{kind:'CAMERA',labelId:'close',start:11},alice.cookie)).status,409);
    assert.equal((await run(path+`/annotations/${firstCamera.json.id}`,'PATCH',{end:11,expectedRevision:1},alice.cookie)).status,200);
    const secondCamera=await run(path+'/annotations','POST',{kind:'CAMERA',labelId:'close',start:11},alice.cookie);
    assert.equal(secondCamera.status,201,JSON.stringify(secondCamera.json));
    assert.equal((await run(path+'/annotations','POST',{kind:'CAMERA',labelId:'bench',start:12},alice.cookie)).status,409);
    assert.equal((await run(path+`/annotations/${secondCamera.json.id}`,'PATCH',{end:20,expectedRevision:1},alice.cookie)).status,200);
    assert.equal((await run(path+'/annotations','POST',{kind:'CAMERA',labelId:'bench',start:20},alice.cookie)).status,201);
    // Single-annotation edits and soft-deletes never change other camera intervals.
    const preEdit=(await run(path+'/annotations','GET',undefined,alice.cookie)).json as any[];
    const laterCamera=preEdit.find(row=>row.labelId==='bench');
    assert.equal((await run(path+`/annotations/${firstCamera.json.id}`,'PATCH',{
      start:9,end:11,expectedRevision:2,
    },alice.cookie)).status,200);
    assert.equal((await run(path+`/annotations/${firstCamera.json.id}`,'PATCH',{
      start:8,expectedRevision:2,
    },alice.cookie)).status,409,'stale revision is rejected');
    let afterEdit=(await run(path+'/annotations','GET',undefined,alice.cookie)).json as any[];
    assert.deepEqual(afterEdit.find(row=>row.id===laterCamera.id),laterCamera,'later camera unchanged');
    assert.equal((await run(path+`/annotations/${firstCamera.json.id}`,'DELETE',{
      expectedRevision:3,
    },alice.cookie)).status,200);
    afterEdit=(await run(path+'/annotations','GET',undefined,alice.cookie)).json as any[];
    assert.equal(afterEdit.some(row=>row.id===firstCamera.json.id),false,'soft-deleted item hidden');
    assert.deepEqual(afterEdit.find(row=>row.id===laterCamera.id),laterCamera,'other camera survives delete');
    const history=(await run(path+`/annotations/${firstCamera.json.id}/history`,'GET',undefined,alice.cookie)).json as any[];
    assert.deepEqual(history.map(row=>row.action),['SOFT_DELETED','UPDATED','UPDATED','CREATED']);
    const restored=await run(path+`/annotations/${firstCamera.json.id}/restore`,'POST',{
      version:2,expectedRevision:4,
    },alice.cookie);
    assert.equal(restored.status,201,JSON.stringify(restored.json));
    assert.equal(restored.json.end,11);
    afterEdit=(await run(path+'/annotations','GET',undefined,alice.cookie)).json as any[];
    assert.deepEqual(afterEdit.find(row=>row.id===laterCamera.id),laterCamera,'restore affects target only');
    assert.equal((await run('/auth/logout', 'POST', undefined, bob.cookie)).status, 201);
    assert.equal((await run('/auth/me', 'GET', undefined, bob.cookie)).status, 401);

    // Admins provision accounts without email. Passwords are shown once and
    // first-login accounts cannot access workspace data until they change them.
    assert.equal((await run('/auth/password-reset/request','POST',{email:alice.json.user.email})).status,404);
    const managedEmail = `worker-${suffix}@example.org`;
    const provision=await run(`/workspaces/${workspaceId}/members/provision`,'POST',{
      name:'Managed Worker',email:managedEmail,role:'ANALYST',
    },alice.cookie);
    assert.equal(provision.status,201,JSON.stringify(provision.json));
    const temporaryPassword=provision.json.temporaryPassword as string;
    assert.ok(temporaryPassword.length>=24,'Temporary password returned once to administrator');
    assert.equal((await run(`/workspaces/${workspaceId}/members/provision`,'POST',{
      name:'Managed Worker',email:managedEmail,role:'ANALYST',
    },alice.cookie)).json.temporaryPassword,null,'Existing users do not receive new passwords');
    const firstLogin=await run('/auth/login','POST',{email:managedEmail,password:temporaryPassword});
    assert.equal(firstLogin.status,201,JSON.stringify(firstLogin.json));
    assert.equal(firstLogin.json.user.passwordChangeRequired,true);
    assert.equal((await run('/auth/me','GET',undefined,firstLogin.cookie)).json.user.passwordChangeRequired,true);
    assert.equal((await run('/workspaces','GET',undefined,firstLogin.cookie)).status,403);
    assert.equal((await run(`/workspaces/${workspaceId}/members/${provision.json.user.id}/reset-password`,'POST',undefined,firstLogin.cookie)).status,403);
    assert.equal((await run('/auth/change-password','POST',{
      currentPassword:temporaryPassword,password:'managed-strong-password-123',
    },firstLogin.cookie)).status,201);
    assert.equal((await run('/auth/me','GET',undefined,firstLogin.cookie)).status,401,'Password change revokes old session');
    assert.equal((await run('/auth/login','POST',{email:managedEmail,password:temporaryPassword})).status,401);
    const newLogin=await run('/auth/login','POST',{email:managedEmail,password:'managed-strong-password-123'});
    assert.equal(newLogin.json.user.passwordChangeRequired,false);
    assert.equal((await run('/workspaces','GET',undefined,newLogin.cookie)).status,200);
    assert.equal((await run(`/workspaces/${workspaceId}/members/${provision.json.user.id}/reset-password`,'POST',undefined,newLogin.cookie)).status,403);
    const reset=await run(`/workspaces/${workspaceId}/members/${provision.json.user.id}/reset-password`,'POST',undefined,alice.cookie);
    assert.equal(reset.status,201,JSON.stringify(reset.json));
    assert.notEqual(reset.json.temporaryPassword,temporaryPassword);
    assert.equal((await run('/auth/me','GET',undefined,newLogin.cookie)).status,401,'Admin reset invalidates active worker sessions');
    assert.equal((await run('/auth/login','POST',{email:managedEmail,password:'managed-strong-password-123'})).status,401);
    const afterReset=await run('/auth/login','POST',{email:managedEmail,password:reset.json.temporaryPassword});
    assert.equal(afterReset.json.user.passwordChangeRequired,true);
    // Viewer may inspect reports and export source data, but cannot edit or play media.
    const viewerEmail=`viewer-${suffix}@example.org`;
    const viewer=await run(`/workspaces/${workspaceId}/members/provision`,'POST',{
      name:'Report Viewer',email:viewerEmail,role:'VIEWER',
    },alice.cookie);
    assert.equal(viewer.status,201,JSON.stringify(viewer.json));
    const firstViewerLogin=await run('/auth/login','POST',{email:viewerEmail,password:viewer.json.temporaryPassword});
    assert.equal((await run('/auth/change-password','POST',{
      currentPassword:viewer.json.temporaryPassword,password:'viewer-strong-password-123',
    },firstViewerLogin.cookie)).status,201);
    const viewerLogin=await run('/auth/login','POST',{email:viewerEmail,password:'viewer-strong-password-123'});
    assert.equal((await run(`/workspaces/${workspaceId}/tasks`,'GET',undefined,viewerLogin.cookie)).status,200);
    assert.equal((await run(path,'GET',undefined,viewerLogin.cookie)).status,200);
    assert.equal((await run(path+'/annotations','GET',undefined,viewerLogin.cookie)).status,200);
    assert.equal((await run(path+'/annotations','POST',{kind:'SPONSOR',labelId:'s_test',start:51,end:52},viewerLogin.cookie)).status,403);
    assert.equal((await run(path+'/videos/'+task.json.id+'/playback','GET',undefined,viewerLogin.cookie)).status,403);
    assert.equal((await run(path,'DELETE',undefined,viewerLogin.cookie)).status,403);
    const removed=await run(path,'DELETE',undefined,alice.cookie);
    assert.equal(removed.status,409,JSON.stringify(removed.json));
    assert.equal((await run(path,'GET',undefined,alice.cookie)).status,200,'tasks with annotation history cannot be deleted');
    assert.equal((await run(`/workspaces/${workspaceId}/catalog`,'GET',undefined,alice.cookie)).status,200,'Catalog survives task deletion');
    // Workspace membership removal is owner-only and does not delete the user's account.
    const memberPath=`/workspaces/${workspaceId}/members/${viewer.json.user.id}`;
    assert.equal((await run(memberPath,'DELETE',undefined,viewerLogin.cookie)).status,403,'viewer cannot remove themselves');
    assert.equal((await run(`/workspaces/${workspaceId}/members/${alice.json.user.id}`,'DELETE',undefined,alice.cookie)).status,403,'owner cannot remove themselves');
    const removedMember=await run(memberPath,'DELETE',undefined,alice.cookie);
    assert.equal(removedMember.status,200,JSON.stringify(removedMember.json));
    assert.equal(removedMember.json.ok,true);
    assert.equal((await run(`/workspaces/${workspaceId}/members`,'GET',undefined,viewerLogin.cookie)).status,404,'removed member immediately loses workspace API access');
    assert.equal((await run('/auth/me','GET',undefined,viewerLogin.cookie)).status,200,'removal does not invalidate unrelated user sessions');
  } finally {
    await app.close();
  }
});

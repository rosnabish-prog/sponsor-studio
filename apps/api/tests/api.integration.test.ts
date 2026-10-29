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
    assert.equal((await run(path + `/annotations/${annotation.json.id}`, 'PATCH', { end: 25 }, bob.cookie)).status, 200);
    assert.equal((await run(path + '/submit', 'POST', { stream: 'sponsors' }, bob.cookie)).status, 201);
    assert.equal((await run(path + `/annotations/${annotation.json.id}`, 'PATCH', { quality: 'clear' }, bob.cookie)).status, 403);
    assert.equal((await run(path + '/reopen', 'POST', { stream: 'sponsors' }, bob.cookie)).status, 403);
    assert.equal((await run(path + '/reopen', 'POST', { stream: 'sponsors' }, alice.cookie)).status, 201);
    assert.equal((await run(path + `/annotations/${annotation.json.id}`, 'PATCH', { quality: 'clear' }, bob.cookie)).status, 200);
    assert.equal((await run('/auth/logout', 'POST', undefined, bob.cookie)).status, 201);
    assert.equal((await run('/auth/me', 'GET', undefined, bob.cookie)).status, 401);

    // SES delivery is mocked at the SDK boundary; the token is never returned
    // by the API, is single-use, and invalidates existing login sessions.
    const { SESv2Client } = await import('@aws-sdk/client-sesv2');
    const originalSend = SESv2Client.prototype.send;
    const senderBefore = process.env.PASSWORD_RESET_SENDER;
    const regionBefore = process.env.AWS_REGION;
    const originBefore = process.env.APP_ORIGIN;
    let resetEmail = '';
    try {
      process.env.PASSWORD_RESET_SENDER = 'recovery@example.org';
      process.env.AWS_REGION = 'us-east-1';
      process.env.APP_ORIGIN = 'http://127.0.0.1:4173';
      SESv2Client.prototype.send = (async command => {
        const body = command.input as { Content: { Simple: { Body: { Text: { Data: string } } } } };
        resetEmail = body.Content.Simple.Body.Text.Data;
        return { MessageId: 'mocked-ses-mail-id' };
      }) as typeof SESv2Client.prototype.send;
      const resetRequest = await run('/auth/password-reset/request','POST',{email:alice.json.user.email});
      assert.equal(resetRequest.status,201,JSON.stringify(resetRequest.json));
      assert.deepEqual(resetRequest.json,{ok:true});
      const link=resetEmail.match(/https?:\/\/[^\s]+/)?.[0];
      assert.ok(link,'SES should receive a recovery link');
      const token=new URLSearchParams(new URL(link).hash.slice(1)).get('reset');
      assert.ok(token);
      const confirmed=await run('/auth/password-reset/confirm','POST',{token,password:'replacement-safe-password-A2'});
      assert.equal(confirmed.status,201,JSON.stringify(confirmed.json));
      assert.equal((await run('/auth/me','GET',undefined,alice.cookie)).status,401);
      assert.equal((await run('/auth/password-reset/confirm','POST',{token,password:'replacement-safe-password-A3'})).status,400);
      assert.equal((await run('/auth/login','POST',{email:alice.json.user.email,password:'safe-test-password-A1'})).status,401);
      assert.equal((await run('/auth/login','POST',{email:alice.json.user.email,password:'replacement-safe-password-A2'})).status,201);
    } finally {
      SESv2Client.prototype.send=originalSend;
      if(senderBefore===undefined)delete process.env.PASSWORD_RESET_SENDER;else process.env.PASSWORD_RESET_SENDER=senderBefore;
      if(regionBefore===undefined)delete process.env.AWS_REGION;else process.env.AWS_REGION=regionBefore;
      if(originBefore===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=originBefore;
    }
  } finally {
    await app.close();
  }
});

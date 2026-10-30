import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canAccessTask, checkAnnotationTimes, mayEditStream } from '../src/modules/permissions';

test('tenants: analysts see assigned tasks only', () => {
  assert.equal(canAccessTask('ANALYST', 'alice', 'bob', 'charlie'), false);
  assert.equal(canAccessTask('ANALYST', 'alice', 'alice', 'charlie'), true);
  assert.equal(canAccessTask('REVIEWER', 'reviewer', 'bob', 'charlie'), true);
  assert.equal(canAccessTask('ADMIN', 'admin', null, null), true);
  assert.equal(canAccessTask('VIEWER', 'viewer', null, null), true);
});

test('submitted streams cannot be edited, even by admins', () => {
  assert.equal(mayEditStream('OWNER', 'owner', null, new Date()), false);
  assert.equal(mayEditStream('ANALYST', 'alice', 'alice', null), true);
  assert.equal(mayEditStream('ANALYST', 'alice', 'bob', null), false);
  assert.equal(mayEditStream('REVIEWER', 'reviewer', 'reviewer', null), false);
  assert.equal(mayEditStream('VIEWER', 'viewer', 'viewer', null), false);
});

test('annotation bounds reject invalid or zero-length intervals', () => {
  checkAnnotationTimes(0, null, 3600);
  checkAnnotationTimes(10, 11, 3600);
  assert.throws(() => checkAnnotationTimes(-1, 1, 3600));
  assert.throws(() => checkAnnotationTimes(10, 10, 3600));
  assert.throws(() => checkAnnotationTimes(10, 9, 3600));
  assert.throws(() => checkAnnotationTimes(3601, null, 3600));
  assert.throws(() => checkAnnotationTimes(20, 3601, 3600));
});

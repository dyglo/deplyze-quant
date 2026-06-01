/**
 * Unit tests for requireFullAccount — blocks anonymous (guest) sessions.
 *
 * Run after a build (imports the compiled JS):
 *   npm run build && node --test src/middleware/requireFullAccount.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireFullAccount } from '../../dist/middleware/requireFullAccount.js';

function mockRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('anonymous request → 403 GUEST_FORBIDDEN, next not called', () => {
  const req = { isAnonymous: true };
  const res = mockRes();
  let nextCalled = false;
  requireFullAccount(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'GUEST_FORBIDDEN');
  assert.equal(nextCalled, false);
});

test('full-account request → next() called, no response written', () => {
  const req = { isAnonymous: false };
  const res = mockRes();
  let nextCalled = false;
  requireFullAccount(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, undefined);
});

test('missing flag (undefined) is treated as not-anonymous → next()', () => {
  const req = {};
  const res = mockRes();
  let nextCalled = false;
  requireFullAccount(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

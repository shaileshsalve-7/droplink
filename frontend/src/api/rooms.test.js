import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, inspectRoom, RoomApiError, validMembership } from './rooms.js';

test('rejects successful responses that do not contain a real room contract', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"ok":true}'));
  await assert.rejects(createRoom(), error => error.code === 'INVALID_RESPONSE');
  assert.equal(Boolean(validMembership({ memberToken: 'x'.repeat(43) })), false);
});
test('rate limit maps to an actionable message and does not retry POST', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{"code":"RATE_LIMITED"}', { status: 429 }));
  await assert.rejects(createRoom(), error => error instanceof RoomApiError && /one minute/.test(error.message));
  assert.equal(mock.mock.callCount(), 1);
});
test('does not reflect arbitrary error messages from the server', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"message":"secret stack trace"}', { status: 500 }));
  await assert.rejects(createRoom(), error => !error.message.includes('secret'));
});
test('access token goes in the header, never in the URL', async (t) => {
  const room = { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7bd', code: 'ABCD2345', expiresAt: '2026-09-22T12:30:00Z', serverTime: '2026-09-22T12:00:00Z', memberCount: 1, maxMembers: 8 };
  const memberToken = 'x'.repeat(43);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `/api/rooms/${room.id}`);
    assert.equal(options.headers.Authorization, `Bearer ${memberToken}`);
    assert.equal(options.cache, 'no-store');
    return new Response(JSON.stringify(room));
  });
  assert.equal((await inspectRoom({ room, memberToken })).id, room.id);
});

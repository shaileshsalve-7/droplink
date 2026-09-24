import test from 'node:test';
import assert from 'node:assert/strict';
import { connectRoom } from './live.js';
const room = { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7bd', code: 'ABCD2345', expiresAt: '2026-09-25T12:30:00Z', serverTime: '2026-09-25T12:00:00Z', memberCount: 1, maxMembers: 8 };
const member = { room, memberToken: 'a'.repeat(43) };
function setup() {
  let time = 0, sequence = 0;
  const tasks = new Map(), sockets = [], states = [], rooms = [];
  const counts = { files: 0, unavailable: 0 };
  class Socket {
    sent = []; closed = false;
    constructor(url) { this.url = url; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close(code = 1000) { if (this.closed) return; this.closed = true; this.onclose?.({ code }); }
    receive(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  }
  const document = new EventTarget(); document.visibilityState = 'visible';
  const window = new EventTarget();
  const stop = connectRoom(member, {
    onStatus: value => states.push(value), onFiles: () => counts.files++, onRoom: value => rooms.push(value), onUnavailable: () => counts.unavailable++,
  }, { WebSocket: Socket, location: { href: 'https://droplink.example/?q=1#join=ABCD2345' }, document, window,
    now: () => time, random: () => 0,
    setTimeout: (fn, delay) => { const id = ++sequence; tasks.set(id, { fn, at: time + delay }); return id; },
    clearTimeout: id => tasks.delete(id),
  });
  function advance(ms) {
    const end = time + ms;
    while (true) {
      const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      tasks.delete(next[0]); time = next[1].at; next[1].fn();
    }
    time = end;
  }
  return { stop, sockets, states, rooms, counts, advance, document, window, tasks };
}
test('auth is first frame and never appears in the URL; ready reconciles HTTP data', () => {
  const h = setup(); const socket = h.sockets[0];
  assert.equal(socket.url, 'wss://droplink.example/api/live');
  socket.onopen(); assert.deepEqual(socket.sent[0], { type: 'auth', roomId: room.id, token: member.memberToken });
  socket.receive({ type: 'files_changed' }); assert.equal(h.counts.files, 0);
  socket.receive({ type: 'ready', room });
  assert.equal(h.states.at(-1), 'live'); assert.equal(h.counts.files, 1);
  socket.receive({ type: 'files_changed' }); assert.equal(h.counts.files, 2);
  socket.receive({ type: 'ping' }); assert.deepEqual(socket.sent.at(-1), { type: 'pong' }); h.stop();
});
test('reconnect waits with backoff and refreshes after every ready', () => {
  const h = setup(); h.sockets[0].receive({ type: 'ready', room });
  h.sockets[0].close(1006); h.advance(999); assert.equal(h.sockets.length, 1);
  h.advance(1); assert.equal(h.sockets.length, 2);
  h.sockets[1].close(1006); h.advance(1999); assert.equal(h.sockets.length, 2);
  h.advance(1); assert.equal(h.sockets.length, 3);
  h.sockets[2].receive({ type: 'ready', room }); assert.equal(h.counts.files, 2); h.stop();
});
test('revoked access stops reconnects and notifies the parent', () => {
  const h = setup(); h.sockets[0].close(4404); h.advance(60000);
  assert.equal(h.counts.unavailable, 1); assert.equal(h.sockets.length, 1); h.stop();
});
test('cleanup stops timers, sockets, and late callbacks', () => {
  const h = setup(); const old = h.sockets[0]; h.stop();
  old.receive({ type: 'ready', room }); h.advance(60000); h.window.dispatchEvent(new Event('online'));
  assert.equal(h.counts.files, 0); assert.equal(h.sockets.length, 1); assert.equal(h.tasks.size, 0);
});
test('missing ready or heartbeat reconnects instead of remaining falsely live', () => {
  const h = setup(); h.advance(8000); assert.equal(h.sockets.length, 2);
  h.sockets[1].receive({ type: 'ready', room }); h.advance(48000);
  assert.equal(h.sockets.length, 3); assert.notEqual(h.states.at(-1), 'live'); h.stop();
});
test('returning to the visible page reconnects; old socket messages are ignored', () => {
  const h = setup(); const old = h.sockets[0]; old.receive({ type: 'ready', room });
  h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange'));
  h.document.visibilityState = 'visible'; h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.sockets.length, 2);
  old.receive({ type: 'files_changed' }); assert.equal(h.counts.files, 1);
  h.sockets[1].receive({ type: 'ready', room }); assert.equal(h.counts.files, 2); h.stop();
});
test('a room mismatch is rejected without exposing another room in the UI', () => {
  const h = setup(); h.sockets[0].receive({ type: 'ready', room: { ...room, id: 'ea013e60-fb65-4717-bb0c-a1a500edb7be' } });
  assert.equal(h.rooms.length, 0); assert.equal(h.counts.files, 0); assert.equal(h.sockets[0].closed, true); h.stop();
});
test('null and non-object frames close and reconnect without throwing or updating room data', () => {
  const h = setup();
  for (const value of [null, [], 'ready', 1, {}, { type: 'unknown' }]) {
    const socket = h.sockets.at(-1);
    assert.doesNotThrow(() => socket.receive(value));
    assert.equal(socket.closed, true);
    h.advance(31000);
  }
  assert.equal(h.rooms.length, 0); assert.equal(h.counts.files, 0); h.stop();
});

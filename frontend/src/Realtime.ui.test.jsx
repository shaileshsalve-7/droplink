import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import RoomWorkspace from './RoomWorkspace.jsx';
import { saveSession } from './roomSession.js';
const room = { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7bd', code: 'ABCD2345', expiresAt: '2026-09-25T12:30:00Z', serverTime: '2026-09-25T12:00:00Z', memberCount: 1, maxMembers: 8 };
const member = { room, memberToken: 'a'.repeat(43) };
const file = { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7b1', name: 'phone.pdf', size: 3, uploadedAt: room.serverTime, expiresAt: room.expiresAt };
let sockets, files;
beforeEach(() => {
  sockets = []; files = []; sessionStorage.clear(); saveSession(member);
  vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(url.endsWith('/files') ? files : room))));
  vi.stubGlobal('WebSocket', class {
    sent = []; closed = false;
    constructor(url) { this.url = url; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { if (!this.closed) { this.closed = true; this.onclose?.({ code: 1000 }); } }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function open() {
  render(<StrictMode><RoomWorkspace /></StrictMode>);
  await screen.findByText(/No files yet/);
  await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
  const socket = sockets.at(-1);
  await act(async () => { socket.onopen(); socket.message({ type: 'ready', room }); });
  await screen.findByText('Live updates connected');
  return socket;
}
test('the full room workspace receives a notification and displays the file without a click', async () => {
  const socket = await open();
  expect(socket.sent[0].token).toBe(member.memberToken); expect(socket.url).not.toContain(member.memberToken);
  files = [file];
  await act(async () => socket.message({ type: 'files_changed' }));
  await screen.findByText('phone.pdf');
});
test('room count changes update the workspace without reconnecting its membership', async () => {
  const socket = await open(); const before = sockets.length;
  await act(async () => socket.message({ type: 'room_changed', room: { ...room, memberCount: 2 } }));
  await screen.findByText('2 / 8'); expect(sockets.length).toBe(before);
});
test('a revoked socket clears tab credentials and the file panel', async () => {
  const socket = await open();
  await act(async () => socket.onclose({ code: 4404 }));
  await screen.findByRole('button', { name: /Create room/ });
  expect(sessionStorage.getItem('droplink.room.v1')).toBeNull();
  expect(screen.queryByText('Room files')).toBeNull();
});

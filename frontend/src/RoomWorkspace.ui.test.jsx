import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import RoomWorkspace from './RoomWorkspace.jsx';
import { saveSession } from './roomSession.js';

const room = { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7bd', code: 'ABCD2345', expiresAt: '2026-09-22T12:30:00Z', serverTime: '2026-09-22T12:00:00Z', memberCount: 1, maxMembers: 8 };
const member = { room, memberToken: 'a'.repeat(43) };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

test('create disables duplicate submission, shows code, and persists membership', async () => {
  let resolve;
  fetch.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<RoomWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: /Create room/ }));
  expect(screen.getByRole('button', { name: /Creating/ }).disabled).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => resolve(reply(member, 201)));
  expect(screen.getByText('ABCD-2345')).toBeTruthy();
  expect(screen.getByText('30:00')).toBeTruthy();
  expect(sessionStorage.getItem('droplink.room.v1')).toContain(member.memberToken);
});

test('invalid code stays local; formatted code is normalized before joining', async () => {
  fetch.mockResolvedValue(reply({ ...member, room: { ...room, memberCount: 2 } }));
  render(<RoomWorkspace />);
  fireEvent.change(screen.getByLabelText('Have a room code?'), { target: { value: 'bad' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
  expect(screen.getByRole('alert').textContent).toMatch(/eight-character/);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Have a room code?'), { target: { value: 'abcd-2345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
  await screen.findByText('2 / 8');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ code: 'ABCD2345' });
});

test('network error offers a working retry without losing the code', async () => {
  fetch.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(reply(member));
  render(<RoomWorkspace />);
  fireEvent.change(screen.getByLabelText('Have a room code?'), { target: { value: 'ABCD2345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Have a room code?').value).toBe('ABCD2345');
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
  await screen.findByText('ABCD-2345');
});

test('restore checks membership under StrictMode; leave clears storage', async () => {
  saveSession(member);
  fetch.mockImplementation((_url, options) => Promise.resolve(options.method === 'DELETE' ? new Response(null, { status: 204 }) : reply(room)));
  render(<StrictMode><RoomWorkspace /></StrictMode>);
  await screen.findByText('1 / 8');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${member.memberToken}`);
  fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
  await screen.findByRole('button', { name: /Create room/ });
  expect(sessionStorage.getItem('droplink.room.v1')).toBeNull();
});

test('expired restored membership is removed instead of showing a ready room', async () => {
  saveSession(member);
  fetch.mockResolvedValue(reply({ code: 'ROOM_UNAVAILABLE' }, 404));
  render(<RoomWorkspace />);
  await screen.findByText(/This room has expired or/);
  expect(screen.queryByText('ABCD-2345')).toBeNull();
  expect(sessionStorage.getItem('droplink.room.v1')).toBeNull();
});

test('failed leave preserves membership so the user can retry', async () => {
  saveSession(member);
  fetch.mockResolvedValueOnce(reply(room)).mockRejectedValueOnce(new TypeError('offline'));
  render(<RoomWorkspace />);
  await screen.findByText('1 / 8');
  fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
  await screen.findByRole('alert');
  expect(screen.getByText('ABCD-2345')).toBeTruthy();
  expect(sessionStorage.getItem('droplink.room.v1')).not.toBeNull();
});

test('countdown uses server time and clears expired membership', async () => {
  vi.useFakeTimers();
  fetch.mockResolvedValue(reply({ ...member, room: { ...room, expiresAt: '2026-09-22T12:00:02Z' } }, 201));
  render(<RoomWorkspace />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Create room/ })));
  expect(screen.getByText('0:02')).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(2200));
  expect(screen.getByText('This room has expired. Create or join another room.')).toBeTruthy();
  expect(sessionStorage.getItem('droplink.room.v1')).toBeNull();
});

test('corrupt saved state does not prevent a new room', () => {
  sessionStorage.setItem('droplink.room.v1', '{broken');
  render(<RoomWorkspace />);
  expect(screen.getByRole('button', { name: /Create room/ })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

test('copy failure gives a manual fallback', async () => {
  fetch.mockResolvedValue(reply(member, 201));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Unavailable')) } });
  render(<RoomWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: /Create room/ }));
  await screen.findByText('ABCD-2345');
  fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
  await screen.findByText(/Select the room code and copy it manually/);
});

test('refresh reflects another joined session', async () => {
  saveSession(member);
  fetch.mockResolvedValueOnce(reply(room)).mockResolvedValueOnce(reply({ ...room, memberCount: 2 }));
  render(<RoomWorkspace />);
  await screen.findByText('1 / 8');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
  await screen.findByText('2 / 8');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh status' }).disabled).toBe(false));
});

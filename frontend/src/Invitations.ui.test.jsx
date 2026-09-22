import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import RoomWorkspace from './RoomWorkspace.jsx';
import RoomInvite from './RoomInvite.jsx';
import { saveSession } from './roomSession.js';

const room = { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7bd', code: 'ABCD2345', expiresAt: '2026-09-23T12:30:00Z', serverTime: '2026-09-23T12:00:00Z', memberCount: 1, maxMembers: 8 };
const member = { room, memberToken: 'a'.repeat(43) };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => {
  sessionStorage.clear(); window.history.replaceState({}, '', '/');
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

test('opening a valid invitation fills the form and clears the URL without auto-joining', async () => {
  window.history.replaceState({}, '', '/#join=ABCD2345');
  fetch.mockResolvedValue(reply(member));
  render(<StrictMode><RoomWorkspace /></StrictMode>);
  expect(screen.getByLabelText('Have a room code?').value).toBe('ABCD2345');
  expect(window.location.hash).toBe('');
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
  await screen.findByText('ABCD-2345');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/api/rooms/join');
});
test('malformed invitation shows an error without an API request', () => {
  window.history.replaceState({}, '', '/#join=%ZZ');
  render(<RoomWorkspace />);
  expect(screen.getByRole('alert').textContent).toContain('invitation link is invalid');
  expect(window.location.hash).toBe('');
  expect(fetch).not.toHaveBeenCalled();
});
test('hash changes are consumed while the app stays open', async () => {
  render(<RoomWorkspace />);
  await act(async () => {
    window.history.replaceState({}, '', '/#join=WXYZ6789');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(screen.getByLabelText('Have a room code?').value).toBe('WXYZ6789');
  expect(fetch).not.toHaveBeenCalled();
});
test('a new invitation never silently leaves an existing room', async () => {
  saveSession(member);
  window.history.replaceState({}, '', '/#join=WXYZ6789');
  fetch.mockImplementation((_url, options) => Promise.resolve(options.method === 'DELETE' ? new Response(null, { status: 204 }) : reply(room)));
  render(<RoomWorkspace />);
  await screen.findByText('1 / 8');
  expect(screen.getByText(/Leave your current room first/)).toBeTruthy();
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
  await screen.findByRole('button', { name: 'Join room' });
  expect(screen.getByLabelText('Have a room code?').value).toBe('WXYZ6789');
});
test('the same invitation reuses a saved membership without creating another', async () => {
  saveSession(member);
  window.history.replaceState({}, '', '/#join=ABCD2345');
  fetch.mockImplementation(() => Promise.resolve(reply(room)));
  render(<StrictMode><RoomWorkspace /></StrictMode>);
  await screen.findByText('1 / 8');
  expect(screen.getByText(/already have a session/)).toBeTruthy();
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});
test('expired invitation gives a recoverable error', async () => {
  window.history.replaceState({}, '', '/#join=ABCD2345');
  fetch.mockResolvedValue(reply({ code: 'ROOM_UNAVAILABLE' }, 404));
  render(<RoomWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
  expect((await screen.findByRole('alert')).textContent).toContain('may have expired');
  expect(screen.getByLabelText('Have a room code?').value).toBe('ABCD2345');
});
test('QR and copy action use only the sanitized invitation URL', async () => {
  render(<RoomInvite code="ABCD2345" pageAddress="http://192.168.1.20:5173/?debug=1#old" />);
  expect(screen.getByRole('img', { name: /Scan to open/ })).toBeTruthy();
  expect(screen.getByLabelText('JOIN LINK').value).toBe('http://192.168.1.20:5173/#join=ABCD2345');
  fireEvent.click(screen.getByRole('button', { name: 'Copy join link' }));
  await screen.findByText('Join link copied.');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://192.168.1.20:5173/#join=ABCD2345');
});
test('blocked clipboard leaves a selectable link and instructions', async () => {
  navigator.clipboard.writeText.mockRejectedValue(new Error('blocked'));
  render(<RoomInvite code="ABCD2345" pageAddress="https://droplink.example/" />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy join link' }));
  await screen.findByText(/Select the join link and copy it manually/);
  expect(screen.getByLabelText('JOIN LINK').readOnly).toBe(true);
});
test('localhost displays guidance instead of a misleading QR or copy link', () => {
  render(<RoomInvite code="ABCD2345" pageAddress="http://localhost:5173/" />);
  expect(screen.getByText(/laptop’s Wi-Fi address/)).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Copy join link' })).toBeNull();
});
test('dismiss invitation clears the prefilled code without a network mutation', () => {
  window.history.replaceState({}, '', '/#join=ABCD2345');
  render(<RoomWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss invitation' }));
  expect(screen.getByLabelText('Have a room code?').value).toBe('');
  expect(fetch).not.toHaveBeenCalled();
});

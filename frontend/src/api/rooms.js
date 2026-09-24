import { apiUrl } from './config.js';

export class RoomApiError extends Error {
  constructor(message, code = 'NETWORK_ERROR') { super(message); this.code = code; }
}

export const normalizeCode = (value) => value.trim().toUpperCase().replace(/[ -]/g, '');
export const validCode = (value) => /^[A-HJ-NP-Z2-9]{8}$/.test(value);

// Validate responses before storing credentials or showing room details.
export function validRoom(room) {
  return room && /^[a-f0-9-]{36}$/i.test(room.id) && validCode(room.code)
    && Number.isFinite(Date.parse(room.expiresAt)) && Number.isFinite(Date.parse(room.serverTime))
    && Number.isInteger(room.memberCount) && room.memberCount >= 1
    && Number.isInteger(room.maxMembers) && room.memberCount <= room.maxMembers;
}
export function validMembership(value) {
  return validRoom(value?.room) && /^[A-Za-z0-9_-]{43}$/.test(value?.memberToken);
}

async function request(path, { method = 'GET', body, membership, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (membership) headers.Authorization = `Bearer ${membership.memberToken}`;
  let response;
  try {
    response = await fetch(apiUrl(`/api/rooms${path}`), {
      method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
      // No automatic POST retries: a lost response may already have created a member.
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RoomApiError('Could not reach the server. Check your connection, then try again.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const messages = {
      ROOM_UNAVAILABLE: 'Room unavailable. Check the code; the room may have expired.',
      ROOM_FULL: 'This room is full. Leave on another device or create a new room.',
      ROOM_CAPACITY: 'The server is full. Try again after a room expires.',
      RATE_LIMITED: 'Too many attempts. Wait one minute and try again.',
      INVALID_CODE: 'Enter a valid eight-character room code.',
      INVALID_REQUEST: 'Check the room code and try again.',
    };
    const code = typeof data?.code === 'string' && Object.hasOwn(messages, data.code) ? data.code : 'REQUEST_FAILED';
    throw new RoomApiError(messages[code] || 'The request failed. Please try again.', code);
  }
  if (response.status === 204) return null;
  try { return await response.json(); }
  catch { throw new RoomApiError('Unexpected response from the sharing server.', 'INVALID_RESPONSE'); }
}

async function admit(path, body, signal) {
  const data = await request(path, { method: 'POST', body, signal });
  if (!validMembership(data)) throw new RoomApiError('Unexpected room response.', 'INVALID_RESPONSE');
  return data;
}
export const createRoom = (signal) => admit('', undefined, signal);
export const joinRoom = (code, signal) => admit('/join', { code: normalizeCode(code) }, signal);
export async function inspectRoom(membership, signal) {
  const room = await request(`/${membership.room.id}`, { membership, signal });
  if (!validRoom(room) || room.id !== membership.room.id) throw new RoomApiError('Unexpected room response.', 'INVALID_RESPONSE');
  return room;
}
export const leaveRoom = (membership, signal) => request(`/${membership.room.id}/members/me`, { method: 'DELETE', membership, signal });

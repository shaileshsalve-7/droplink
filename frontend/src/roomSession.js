import { validMembership } from './api/rooms.js';
const KEY = 'droplink.room.v1';

// sessionStorage keeps reloads in this tab working. It is not a secure vault:
// same-origin JavaScript can read it, so do not add untrusted scripts.
export function loadSession() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY));
    if (validMembership(stored)) return stored;
    sessionStorage.removeItem(KEY);
  } catch { /* Storage may be blocked or contain an old/corrupt entry. */ }
  return null;
}
export function saveSession(membership) {
  try {
    if (membership) sessionStorage.setItem(KEY, JSON.stringify(membership));
    else sessionStorage.removeItem(KEY);
    return true;
  } catch { return false; }
}

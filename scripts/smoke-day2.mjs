// Run from the repository root after backend packaging and npm ci.
// Starts isolated local servers, checks real HTTP behavior, then stops them.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createRoom, joinRoom, inspectRoom, leaveRoom } from '../frontend/src/api/rooms.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const backendPort = Number(process.env.SMOKE_BACKEND_PORT || 18080);
const frontendPort = Number(process.env.SMOKE_FRONTEND_PORT || 15173);
const backendBase = `http://127.0.0.1:${backendPort}`;
const base = `http://127.0.0.1:${frontendPort}`;
const nativeFetch = globalThis.fetch;
let backend;
let frontend;
const children = [];
function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.output = '';
  child.stdout.on('data', bytes => { child.output = (child.output + bytes).slice(-6000); });
  child.stderr.on('data', bytes => { child.output = (child.output + bytes).slice(-6000); });
  child.on('error', error => { child.startError = error; });
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let i = 0; i < 200; i++) {
    if (child.startError) throw child.startError;
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.output}`);
    try { if ((await nativeFetch(url, { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* Still starting. */ }
    await delay(100);
  }
  throw new Error(`Server not ready: ${child.output}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  const force = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(force);
}
function startBackend() {
  return start('java', ['-jar', 'target/droplink-0.1.0-SNAPSHOT.jar'], `${root}/backend`,
    { PORT: String(backendPort), SERVER_ADDRESS: '127.0.0.1', ROOM_TTL: 'PT4S' });
}
try {
  // Refuse to reuse unrelated servers already running on the chosen ports.
  for (const address of [backendBase, base]) {
    let occupied = false;
    try { await nativeFetch(address, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
    if (occupied) throw new Error(`Port already in use: ${address}. Set alternate SMOKE ports.`);
  }
  backend = startBackend();
  await ready(`${backendBase}/api/health`, backend);
  frontend = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort)], `${root}/frontend`, { API_PROXY_TARGET: backendBase });
  await ready(`${base}/api/health`, frontend);
  // The real frontend API functions now use the running Vite proxy.
  globalThis.fetch = (path, options) => nativeFetch(new URL(path, base), options);
  const host = await createRoom();
  const guest = await joinRoom(host.room.code.toLowerCase());
  assert.equal(guest.room.id, host.room.id);
  assert.notEqual(host.memberToken, guest.memberToken);
  assert.equal((await inspectRoom(host)).memberCount, 2);
  const anonymous = await fetch(`/api/rooms/${host.room.id}`);
  assert.equal(anonymous.status, 404);
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  await leaveRoom(guest);
  await assert.rejects(inspectRoom(guest), error => error.code === 'ROOM_UNAVAILABLE');
  assert.equal((await inspectRoom(host)).memberCount, 1);
  console.log('PASS: real frontend client -> Vite -> Spring create/join/status/leave; distinct member tokens.');

  await delay(4200);
  await assert.rejects(inspectRoom(host), error => error.code === 'ROOM_UNAVAILABLE');
  await assert.rejects(joinRoom(host.room.code), error => error.code === 'ROOM_UNAVAILABLE');
  console.log('PASS: expired rooms reject both member access and new joins.');

  const beforeRestart = await createRoom();
  await stop(backend);
  await assert.rejects(inspectRoom(beforeRestart));
  backend = startBackend();
  await ready(`${backendBase}/api/health`, backend);
  await assert.rejects(inspectRoom(beforeRestart), error => error.code === 'ROOM_UNAVAILABLE');
  console.log('PASS: server outage is reported; restart invalidates the old membership.');

  // Invalid JSON attempts are counted before controller validation. A forged
  // forwarding header must not turn each request into a fresh peer budget.
  for (let i = 0; i < 30; i++) {
    const response = await fetch('/api/rooms/join', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${i}` }, body: '{' });
    assert.equal(response.status, 400);
  }
  const limited = await fetch('/api/rooms', { method: 'POST' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(limited.headers.get('cache-control'), 'no-store');
  console.log('PASS: malformed requests consume quota; spoofed forwarding headers do not bypass throttling.');
} finally {
  globalThis.fetch = nativeFetch;
  for (const child of children.reverse()) await stop(child);
}

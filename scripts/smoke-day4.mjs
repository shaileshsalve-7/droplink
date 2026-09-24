// Run from the repository root after backend packaging and npm ci.
// Starts isolated local servers, checks real HTTP behavior, then stops them.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createRoom, joinRoom, inspectRoom, leaveRoom } from '../frontend/src/api/rooms.js';
import { readInvitation } from '../frontend/src/api/invitations.js';
import { uploadFile, listFiles, downloadFile } from '../frontend/src/api/files.js';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const backendPort = Number(process.env.SMOKE_BACKEND_PORT || 18080);
const frontendPort = Number(process.env.SMOKE_FRONTEND_PORT || 15173);
const backendBase = `http://127.0.0.1:${backendPort}`;
const base = `http://127.0.0.1:${frontendPort}`;
const nativeFetch = globalThis.fetch;
const storage = await mkdtemp(join(tmpdir(), 'droplink-smoke-files-'));
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
async function stop(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  const force = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(force);
}
function startBackend() {
  return start('java', ['-jar', 'target/droplink-0.1.0-SNAPSHOT.jar'], `${root}/backend`,
    { PORT: String(backendPort), SERVER_ADDRESS: '127.0.0.1', ROOM_TTL: 'PT6S', DROPLINK_STORAGE_DIR: storage });
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
  const guest = await joinRoom(readInvitation(`#join=${host.room.code}`).code);
  const outsider = await createRoom();
  const bytes = new Uint8Array([0, 255, 17, 13, 10, 0, 90]);
  for (const [index, name] of ['report.pdf', 'notes.docx', 'photo.png', 'archive.zip', 'Main.java', 'page.html'].entries()) {
    const sender = index % 2 === 0 ? host : guest;
    const receiver = index % 2 === 0 ? guest : host;
    const uploaded = await uploadFile(sender, new File([bytes], name));
    assert.equal(uploaded.expiresAt, host.room.expiresAt);
    const listed = await listFiles(receiver);
    assert.ok(listed.some(file => file.id === uploaded.id));
    const downloaded = await downloadFile(receiver, uploaded);
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), bytes);
    await assert.rejects(downloadFile(outsider, uploaded), error => error.code === 'FILE_UNAVAILABLE');
  }
  assert.equal((await readdir(storage)).filter(name => name.endsWith('.blob')).length, 6);
  const anonymous = await fetch(`/api/rooms/${host.room.id}/files`);
  assert.equal(anonymous.status, 404);
  await leaveRoom(guest);
  await assert.rejects(listFiles(guest), error => error.code === 'ROOM_UNAVAILABLE');
  console.log('PASS: both directions through real frontend API -> Vite -> Spring; six file extensions, byte equality, room isolation and revoked access.');

  await delay(6200);
  await assert.rejects(listFiles(host), error => error.code === 'ROOM_UNAVAILABLE');
  const deadline = Date.now() + 35000;
  while ((await readdir(storage)).some(name => name.endsWith('.blob'))) {
    assert.ok(Date.now() < deadline, 'Scheduled cleanup did not remove expired blobs');
    await delay(250);
  }
  console.log('PASS: expiry immediately blocks access and the scheduled cleaner removes actual disk files.');

  const beforeRestart = await createRoom();
  await uploadFile(beforeRestart, new File([bytes], 'restart.zip'));
  await stop(backend, 'SIGKILL');
  assert.ok((await readdir(storage)).some(name => name.endsWith('.blob')), 'Crash should leave an orphan for startup cleanup');
  backend = startBackend();
  await ready(`${backendBase}/api/health`, backend);
  assert.equal((await readdir(storage)).filter(name => name.endsWith('.blob')).length, 0);
  await assert.rejects(listFiles(beforeRestart), error => error.code === 'ROOM_UNAVAILABLE');
  console.log('PASS: hard restart removes orphaned files and invalidates old membership.');
} finally {
  globalThis.fetch = nativeFetch;
  for (const child of children.reverse()) await stop(child);
  await rm(storage, { recursive: true, force: true });
}

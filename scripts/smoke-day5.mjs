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
import { connectRoom } from '../frontend/src/api/live.js';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const backendPort = Number(process.env.SMOKE_BACKEND_PORT || 18080);
const production = process.env.SMOKE_PRODUCTION === '1';
const frontendPort = Number(process.env.SMOKE_FRONTEND_PORT || 15173);
const backendBase = `http://127.0.0.1:${backendPort}`;
const base = production ? backendBase : `http://127.0.0.1:${frontendPort}`;
const nativeFetch = globalThis.fetch;
const storage = await mkdtemp(join(tmpdir(), 'droplink-smoke-files-'));
let backend;
let frontend;
const children = [];
const disconnect = [];
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
    { PORT: String(backendPort), SERVER_ADDRESS: '127.0.0.1', ROOM_TTL: 'PT15S', DROPLINK_STORAGE_DIR: storage,
      ...(production ? { SPRING_PROFILES_ACTIVE: 'production', DROPLINK_PUBLIC_ORIGIN: 'https://droplink.example' } : {}) });
}
try {
  // Refuse to reuse unrelated servers already running on the chosen ports.
  for (const address of new Set([backendBase, base])) {
    let occupied = false;
    try { await nativeFetch(address, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
    if (occupied) throw new Error(`Port already in use: ${address}. Set alternate SMOKE ports.`);
  }
  backend = startBackend();
  await ready(`${backendBase}/api/health`, backend);
  if (production) {
    const page = await nativeFetch(base);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes('<div id="root">'), 'React entry point missing from JAR');
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
    assert.ok(assets.some(path => path.endsWith('.js')) && assets.some(path => path.endsWith('.css')));
    for (const asset of assets) {
      const response = await nativeFetch(base + asset);
      assert.equal(response.status, 200, `Missing bundled asset: ${asset}`);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    assert.equal((await nativeFetch(base + '/api/not-a-route')).status, 404);
    console.log('PASS: production JAR serves React HTML, JS and CSS on the API origin; assets are not cached; unknown API stays 404.');
  } else {
    frontend = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort)], `${root}/frontend`, { API_PROXY_TARGET: backendBase });
    await ready(`${base}/api/health`, frontend);
  }
  // The real frontend API functions use the selected running server origin.
  globalThis.fetch = (path, options) => nativeFetch(new URL(path, base), options);
  async function until(check, message, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (!check()) { assert.ok(Date.now() < deadline, message); await delay(50); }
  }
  function observe(member) {
    const state = { status: '', files: [], count: 0, unavailable: false, failures: [] };
    const stop = connectRoom(member, {
      onStatus: status => { state.status = status; },
      onRoom: room => { state.count = room.memberCount; },
      onUnavailable: () => { state.unavailable = true; },
      onFiles: () => { listFiles(member).then(files => { state.files = files; }).catch(error => state.failures.push(error.code)); },
    }, { location: { href: base }, document: undefined, window: undefined });
    disconnect.push(stop); state.stop = stop; return state;
  }
  const host = await createRoom();
  const a = observe(host);
  await until(() => a.status === 'live', 'Host socket did not authenticate through Vite');
  const guest = await joinRoom(host.room.code);
  const b = observe(guest);
  const outsider = await createRoom(); const c = observe(outsider);
  await until(() => b.status === 'live' && c.status === 'live' && a.count === 2, 'Join/count notification missing');
  const first = await uploadFile(host, new File(['from laptop'], 'laptop.txt'));
  await until(() => b.files.some(file => file.id === first.id), 'Receiver did not auto-fetch uploaded file');
  assert.equal(await (await downloadFile(guest, first)).text(), 'from laptop');
  const second = await uploadFile(guest, new File(['from phone'], 'phone.java'));
  await until(() => a.files.some(file => file.id === second.id), 'Reverse direction notification missing');
  assert.equal(await (await downloadFile(host, second)).text(), 'from phone');
  assert.equal(c.files.length, 0);
  console.log(`PASS: authenticated notifications through ${production ? 'production JAR' : 'Vite'}; auto-list and exact downloads both directions; another room sees nothing.`);

  b.stop();
  const missed = await uploadFile(host, new File(['while offline'], 'missed.pdf'));
  const returning = observe(guest);
  await until(() => returning.files.some(file => file.id === missed.id), 'Reconnect failed to reconcile missed files');
  await leaveRoom(guest);
  await until(() => returning.unavailable && a.count === 1, 'Leave failed to revoke socket or update count');
  console.log('PASS: reconnection reconciles missed uploads; leaving revokes the socket and updates joined sessions.');

  await until(() => a.unavailable, 'Room expiry failed to close socket', 17000);
  await assert.rejects(listFiles(host), error => error.code === 'ROOM_UNAVAILABLE');
  console.log('PASS: expiry closes the authenticated socket and rejects further HTTP access.');

  const restarting = await createRoom(); const reconnecting = observe(restarting);
  await until(() => reconnecting.status === 'live', 'Restart observer not ready');
  await stop(backend, 'SIGKILL');
  await until(() => reconnecting.status === 'reconnecting', 'Lost server was not detected');
  backend = startBackend(); await ready(`${backendBase}/api/health`, backend);
  await until(() => reconnecting.unavailable, 'Restarted server did not reject old credentials', 10000);
  console.log('PASS: server restart triggers reconnect and then rejects the stale membership.');
} finally {
  for (const close of disconnect) close();
  globalThis.fetch = nativeFetch;
  for (const child of children.reverse()) await stop(child);
  await rm(storage, { recursive: true, force: true });
}

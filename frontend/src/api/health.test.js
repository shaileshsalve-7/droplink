import test from 'node:test';
import assert from 'node:assert/strict';
import { getHealth } from './health.js';

test('requests the relative endpoint and accepts the DropLink contract', async () => {
  const controller = new AbortController();
  const data = await getHealth({ signal: controller.signal, fetchImpl: async (url, options) => {
    assert.equal(url, '/api/health');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.cache, 'no-store');
    return new Response(JSON.stringify({ service: 'droplink', status: 'UP' }));
  } });
  assert.equal(data.status, 'UP');
});

test('does not treat an HTTP failure as success', async () => {
  await assert.rejects(getHealth({ fetchImpl: async () => new Response('', { status: 503 }) }), /HTTP 503/);
});

test('rejects an unrelated service returning HTTP 200', async () => {
  await assert.rejects(getHealth({ fetchImpl: async () => new Response('{"status":"UP"}') }), /Unexpected response/);
});

test('propagates network failure so the screen can offer retry', async () => {
  await assert.rejects(getHealth({ fetchImpl: async () => { throw new TypeError('Network unavailable'); } }), /Network unavailable/);
});

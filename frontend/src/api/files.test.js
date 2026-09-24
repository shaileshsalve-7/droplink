import test from 'node:test';
import assert from 'node:assert/strict';
import { listFiles, uploadFile, downloadFile, validateFile, MAX_FILE_BYTES } from './files.js';
const member = { room: { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7bd' }, memberToken: 'a'.repeat(43) };
const file = { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7b1', name: 'notes.java', size: 3, uploadedAt: '2026-09-23T00:00:00Z', expiresAt: '2026-09-23T00:30:00Z' };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
test('file validation accepts arbitrary types and rejects empty or oversized files', () => {
  assert.equal(validateFile({ size: MAX_FILE_BYTES, name: 'archive.zip' }), '');
  assert.match(validateFile({ size: 0 }), /not empty/);
  assert.match(validateFile({ size: MAX_FILE_BYTES + 1 }), /10 MiB/);
});
test('upload uses FormData with a header credential and browser boundary', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `/api/rooms/${member.room.id}/files`);
    assert.equal(options.headers.Authorization, `Bearer ${member.memberToken}`);
    assert.equal(options.headers['Content-Type'], undefined);
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get('file').name, 'notes.java');
    return reply(file, 201);
  });
  assert.deepEqual(await uploadFile(member, new File(['abc'], 'notes.java')), file);
});
test('file list validates responses before rendering', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => reply([file]));
  assert.deepEqual(await listFiles(member), [file]);
  fetch.mock.mockImplementation(async () => reply([{ ...file, size: -1 }]));
  await assert.rejects(listFiles(member), e => e.code === 'INVALID_RESPONSE');
});
test('errors stay actionable and interrupted uploads are never retried automatically', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
  await assert.rejects(uploadFile(member, new File(['abc'], 'notes.java')), /Refresh files before retrying/);
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => reply({ code: 'ROOM_STORAGE_FULL' }, 409));
  await assert.rejects(uploadFile(member, new File(['abc'], 'notes.java')), /20 files or 50 MiB/);
});
test('download preserves bytes and rejects incomplete bodies', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([0, 1, 255])));
  assert.deepEqual(new Uint8Array(await (await downloadFile(member, file)).arrayBuffer()), new Uint8Array([0, 1, 255]));
  fetch.mock.mockImplementation(async () => new Response('a'));
  await assert.rejects(downloadFile(member, file), /Download interrupted/);
});
test('a truncated successful upload response keeps the warning and never repeats the POST', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{"id":', { status: 201 }));
  await assert.rejects(uploadFile(member, new File(['abc'], 'notes.java')),
    error => error.code === 'INVALID_RESPONSE' && /Refresh files before retrying/.test(error.message));
  assert.equal(fetch.mock.callCount(), 1);
});
test('null or unknown file errors fall back to a safe API error', async t => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const data of [null, { code: '__proto__' }, { code: 'toString' }, { code: {}, message: 'private details' }]) {
    fetch.mock.mockImplementation(async () => reply(data, 503));
    await assert.rejects(listFiles(member), error => error.code === 'REQUEST_FAILED' && error.message === 'File request failed. Try again.');
  }
});

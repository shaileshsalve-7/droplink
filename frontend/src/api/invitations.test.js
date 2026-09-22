import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import { readInvitation, buildJoinLink } from './invitations.js';

test('invitation accepts a formatted code but rejects ambiguous or malformed fragments', () => {
  assert.deepEqual(readInvitation('#join=abcd-2345'), { kind: 'valid', code: 'ABCD2345' });
  assert.deepEqual(readInvitation('#join=ABCD%202345'), { kind: 'valid', code: 'ABCD2345' });
  for (const hash of ['#join=', '#join', '#join=%ZZ', '#join=ABCD2345&join=WXYZ6789', '#join=<script>', '#join=ABCD2345?extra', '#join=' + 'A'.repeat(100)]) {
    assert.equal(readInvitation(hash).kind, 'invalid');
  }
});
test('unrelated anchors and no fragment are left alone', () => {
  for (const hash of ['', '#features', '#joining']) assert.equal(readInvitation(hash).kind, 'none');
});
test('link preserves app path and port but strips unrelated query and fragment', () => {
  assert.deepEqual(buildJoinLink('ABCD2345', 'http://192.168.1.20:5173/app/?debug=1#old'), { url: 'http://192.168.1.20:5173/app/#join=ABCD2345' });
});
test('device-local and wildcard addresses cannot be offered as phone invitations', () => {
  for (const host of ['localhost', 'localhost.', 'test.localhost', '127.0.0.1', '127.0.0.2', '2130706433', '[::1]', '[::]', '0.0.0.0', '[::ffff:127.0.0.1]']) {
    assert.ok(buildJoinLink('ABCD2345', `http://${host}:5173/`).error, host);
  }
});
test('rejects invalid codes, credentials, dangerous schemes, and overly long addresses', () => {
  for (const url of ['not a url', 'javascript:alert(1)', 'file:///tmp/app', 'https://user:pass@example.com', 'https://example.com/' + 'a'.repeat(520)]) {
    assert.ok(buildJoinLink('ABCD2345', url).error);
  }
  assert.ok(buildJoinLink('bad', 'https://example.com').error);
});
test('real rendered QR pixels decode to exactly the join link', () => {
  // This checks scannable payload integrity; physical camera behavior is separate.
  for (const address of ['http://192.168.1.20:5173/', 'https://droplink.example/app/']) {
    const { url } = buildJoinLink('ABCD2345', address);
    const svg = renderToStaticMarkup(createElement(QRCodeSVG, { xmlns: 'http://www.w3.org/2000/svg', value: url, size: 224, marginSize: 4, level: 'M' }));
    const pixels = new Resvg(svg).render();
    const decoded = jsQR(new Uint8ClampedArray(pixels.pixels), pixels.width, pixels.height);
    assert.equal(decoded?.data, url);
    assert.deepEqual(readInvitation(new URL(decoded.data).hash), { kind: 'valid', code: 'ABCD2345' });
  }
});

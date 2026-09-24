import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApiOrigin, apiUrl, socketBase } from './config.js';

test('local API requests and sockets retain the current origin', () => {
  assert.equal(validateApiOrigin(''), '');
  assert.equal(apiUrl('/api/health'), '/api/health');
  assert.equal(socketBase('http://localhost:5173'), 'http://localhost:5173');
});
test('hosted backend accepts only a public HTTPS origin without credentials or paths', () => {
  assert.equal(validateApiOrigin('https://api.example.com'), 'https://api.example.com');
  for (const value of ['http://api.example.com', 'https://api.example.com/',
    'https://api.example.com/path', 'https://user:secret@api.example.com',
    'https://api.example.com?token=secret', 'https://api.example.com#token']) {
    assert.throws(() => validateApiOrigin(value));
  }
});

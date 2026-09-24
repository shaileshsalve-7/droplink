import { apiUrl } from './config.js';
// Keeping HTTP code outside components makes failures easier to test and debug.
export async function getHealth({ signal, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(apiUrl('/api/health'), {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Health check failed (HTTP ${response.status}).`);

  const data = await response.json();
  // A generic HTTP 200 is not enough: make sure we reached the right service.
  if (data.service !== 'droplink' || data.status !== 'UP') {
    throw new Error('Unexpected response from the server.');
  }
  return data;
}

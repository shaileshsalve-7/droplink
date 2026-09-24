import { RoomApiError } from './rooms.js';
import { apiUrl } from './config.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function validateFile(file) {
  if (!file || file.size === 0) return 'Choose a file that is not empty.';
  if (file.size > MAX_FILE_BYTES) return 'Choose a file up to 10 MiB.';
  return '';
}

function validFile(file) {
  return file && /^[a-f0-9-]{36}$/i.test(file.id) && typeof file.name === 'string'
    && file.name.length > 0 && file.name.length <= 320 && Number.isInteger(file.size)
    && file.size > 0 && file.size <= MAX_FILE_BYTES
    && Number.isFinite(Date.parse(file.uploadedAt)) && Number.isFinite(Date.parse(file.expiresAt));
}

async function request(membership, suffix, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(apiUrl(`/api/rooms/${membership.room.id}/files${suffix}`), {
      method, body, cache: 'no-store', headers: { Authorization: `Bearer ${membership.memberToken}` },
      // Let the browser supply FormData's boundary. Never put a member token in a URL.
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RoomApiError('Transfer interrupted. Refresh files before retrying; an upload may have finished.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const messages = {
      ROOM_UNAVAILABLE: 'Room unavailable. It may have expired. Check room status.',
      FILE_UNAVAILABLE: 'This file is no longer available. Refresh the file list.',
      EMPTY_FILE: 'Choose a file that is not empty.', FILE_TOO_LARGE: 'Choose a file up to 10 MiB.',
      INVALID_UPLOAD: 'The upload was incomplete. Choose one file and try again.',
      ROOM_STORAGE_FULL: 'This room is full (20 files or 50 MiB). Create a new room.',
      STORAGE_FULL: 'Temporary storage is full. Try again after rooms expire.',
      STORAGE_ERROR: 'Temporary storage is unavailable. Try again.',
      UPLOAD_BUSY: 'Uploads are busy. Try again shortly.',
      RATE_LIMITED: 'Too many attempts. Wait one minute and try again.',
    };
    const code = typeof data?.code === 'string' && Object.hasOwn(messages, data.code) ? data.code : 'REQUEST_FAILED';
    throw new RoomApiError(messages[code] || (response.status === 413 ? messages.FILE_TOO_LARGE : 'File request failed. Try again.'), code);
  }
  return response;
}

async function json(response, message = 'Unexpected file response.') {
  try { return await response.json(); }
  catch { throw new RoomApiError(message, 'INVALID_RESPONSE'); }
}

export async function listFiles(membership, signal) {
  const files = await json(await request(membership, '', { signal }));
  if (!Array.isArray(files) || files.length > 20 || !files.every(validFile))
    throw new RoomApiError('Unexpected file list.', 'INVALID_RESPONSE');
  return files;
}

export async function uploadFile(membership, file, signal) {
  const error = validateFile(file);
  if (error) throw new RoomApiError(error, 'INVALID_FILE');
  const body = new FormData(); body.append('file', file);
  // No automatic retries: an interrupted response may hide a completed upload.
  // A failed response-body read is just as uncertain as losing the connection
  // before headers. The server may already have committed this upload.
  const result = await json(await request(membership, '', { method: 'POST', body, signal }),
    'Unexpected upload response. Refresh files before retrying.');
  if (!validFile(result)) throw new RoomApiError('Unexpected upload response. Refresh files before retrying.', 'INVALID_RESPONSE');
  return result;
}

export async function downloadFile(membership, file, signal) {
  const response = await request(membership, `/${file.id}`, { signal });
  try {
    const blob = await response.blob();
    if (blob.size !== file.size) throw new Error('Incomplete download');
    return blob;
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RoomApiError('Download interrupted. Try again.');
  }
}

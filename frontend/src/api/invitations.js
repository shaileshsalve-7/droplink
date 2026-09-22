import { normalizeCode, validCode } from './rooms.js';

// The fragment is handled in the browser. It carries an invitation code, never
// a member's bearer token. Reading a link does not itself join a room.
export function readInvitation(hash) {
  if (!/^#join(?:=|$)/i.test(hash)) return { kind: 'none' };
  if (hash.length > 64 || !/^#join=[^&?#]+$/i.test(hash)) return { kind: 'invalid' };
  try {
    const code = normalizeCode(decodeURIComponent(hash.slice(6)));
    return validCode(code) ? { kind: 'valid', code } : { kind: 'invalid' };
  } catch { return { kind: 'invalid' }; }
}

export function buildJoinLink(code, pageAddress) {
  if (!validCode(code)) return { error: 'The room code is invalid.' };
  let url;
  try { url = new URL(pageAddress); } catch { return { error: 'This page address cannot be shared.' }; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return { error: 'Open DropLink using its normal HTTP or HTTPS address.' };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host)
      || ['0.0.0.0', '[::]', '[::1]'].includes(host) || /^\[::ffff:7f/.test(host)) {
    return { error: 'To connect your phone, open this page using your laptop’s Wi-Fi address instead of localhost.' };
  }
  // Keep the application's path and port, discard unrelated query/fragment data.
  url.search = '';
  url.hash = `join=${code}`;
  if (url.href.length > 512) return { error: 'This page address is too long for a simple QR invitation. Share the room code instead.' };
  return { url: url.href };
}

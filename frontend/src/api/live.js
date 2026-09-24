import { validRoom } from './rooms.js';
import { socketBase } from './config.js';

// Notifications invalidate HTTP data; they never replace it or contain file bytes.
export function connectRoom(membership, callbacks, environment = {}) {
  const {
    WebSocket: Socket = globalThis.WebSocket, location = globalThis.location,
    document = globalThis.document, window = globalThis.window,
    setTimeout: later = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout,
    now = Date.now, random = Math.random,
  } = environment;
  let stopped = false, terminal = false, socket, retryTimer, watchdog;
  let attempt = 0, lastMessage = 0, ready = false;
  const status = value => callbacks.onStatus?.(value);

  function reconnect() {
    if (stopped || terminal) return;
    status('reconnecting');
    if (document?.visibilityState === 'hidden') return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)) + Math.floor(random() * 500);
    cancel(retryTimer); retryTimer = later(open, delay);
  }
  function open() {
    if (stopped || terminal) return;
    cancel(retryTimer); cancel(watchdog);
    const previous = socket; socket = null;
    previous?.close();
    ready = false; status(attempt ? 'reconnecting' : 'connecting');
    let next;
    try {
      const address = new URL('/api/live', socketBase(location.href));
      address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
      // Credentials are in the first frame, never the handshake URL/logs.
      next = new Socket(address.href); socket = next; lastMessage = now();
    } catch { reconnect(); return; }
    const current = () => !stopped && socket === next;
    function check() {
      if (!current()) return;
      if (now() - lastMessage > (ready ? 45000 : 6000)) { next.close(); return; }
      watchdog = later(check, 1000);
    }
    watchdog = later(check, 1000);
    next.onopen = () => {
      if (current()) next.send(JSON.stringify({ type: 'auth', roomId: membership.room.id, token: membership.memberToken }));
    };
    next.onmessage = event => {
      if (!current()) return;
      let message;
      try { message = JSON.parse(event.data); } catch { next.close(); return; }
      // Valid JSON need not be an event object (for example, null). Reject it
      // before touching fields or treating the frame as a healthy heartbeat.
      if (!message || typeof message !== 'object' || Array.isArray(message)
          || !['ready', 'room_changed', 'files_changed', 'ping'].includes(message.type)) {
        next.close(); return;
      }
      lastMessage = now();
      if (message.type === 'ping') { next.send(JSON.stringify({ type: 'pong' })); return; }
      if (message.type === 'ready' || message.type === 'room_changed') {
        if (!validRoom(message.room) || message.room.id !== membership.room.id) { next.close(); return; }
        callbacks.onRoom?.(message.room);
        if (message.type === 'ready') {
          ready = true; attempt = 0; status('live');
          // Reconcile after EVERY connection, including missed offline changes.
          callbacks.onFiles?.();
        }
      } else if (message.type === 'files_changed' && ready) { callbacks.onFiles?.(); }
    };
    next.onerror = () => { if (current()) next.close(); };
    next.onclose = event => {
      if (!current()) return;
      socket = null; cancel(watchdog);
      if (event.code === 4404) {
        terminal = true; status('unavailable'); callbacks.onUnavailable?.();
      } else if (event.code === 1008 || event.code === 1009 || event.code === 1003) {
        terminal = true; status('offline');
      } else { reconnect(); }
    };
  }
  function wake() {
    if (!stopped && !terminal && document?.visibilityState !== 'hidden') open();
  }
  if (Socket) {
    open(); window?.addEventListener('online', wake); document?.addEventListener('visibilitychange', wake);
  } else { status('offline'); }
  return () => {
    stopped = true; cancel(retryTimer); cancel(watchdog);
    window?.removeEventListener('online', wake); document?.removeEventListener('visibilitychange', wake);
    socket?.close(); socket = null;
  };
}

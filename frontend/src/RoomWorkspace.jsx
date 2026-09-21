import { useEffect, useRef, useState } from 'react';
import { createRoom, joinRoom, inspectRoom, leaveRoom, normalizeCode, validCode } from './api/rooms.js';
import { loadSession, saveSession } from './roomSession.js';

export default function RoomWorkspace() {
  const [membership, setMembership] = useState(loadSession);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [remaining, setRemaining] = useState(null);
  const [verified, setVerified] = useState(false);
  const [copied, setCopied] = useState(false);
  const active = useRef(null);
  const heading = useRef(null);
  const initial = useRef(membership);

  function remember(value) {
    setMembership(value);
    if (!saveSession(value)) setNotice('Tab storage is unavailable. Reloading will require joining again.');
  }

  async function perform(action, saved = membership) {
    // A ref closes the double-click gap before React updates the disabled state.
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(action); setError(''); setNotice(''); setCopied(false);
    try {
      if (action === 'create' || action === 'join') {
        const result = action === 'create' ? await createRoom(controller.signal) : await joinRoom(code, controller.signal);
        if (controller.signal.aborted) return;
        remember(result); setVerified(true); setCode('');
      } else if (action === 'leave') {
        await leaveRoom(saved, controller.signal);
        if (controller.signal.aborted) return;
        remember(null); setVerified(false); setNotice('You left the room.');
      } else {
        const room = await inspectRoom(saved, controller.signal);
        if (controller.signal.aborted) return;
        remember({ ...saved, room }); setVerified(true);
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (saved && failure.code === 'ROOM_UNAVAILABLE') {
        remember(null); setVerified(false);
        setNotice('This room has expired or is no longer available. Create or join another room.');
      } else {
        setError(failure.message);
        if (saved && action !== 'leave') setVerified(false);
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (!controller.signal.aborted) setPending('');
      }
    }
  }

  useEffect(() => {
    if (initial.current) perform('restore', initial.current);
    return () => { active.current?.abort(); active.current = null; };
    // Only restore on mount; later status checks are explicit user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { heading.current?.focus(); }, [membership?.room.id]);

  useEffect(() => {
    if (!membership || !verified) { setRemaining(null); return; }
    // Derive duration from SERVER timestamps, not the phone/laptop wall clock.
    const duration = Date.parse(membership.room.expiresAt) - Date.parse(membership.room.serverTime);
    const started = performance.now();
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((duration - (performance.now() - started)) / 1000));
      setRemaining(seconds);
      if (seconds === 0) {
        active.current?.abort(); active.current = null; setPending('');
        remember(null); setVerified(false);
        setNotice('This room has expired. Create or join another room.');
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [membership, verified]);

  function submitJoin(event) {
    event.preventDefault();
    if (!validCode(normalizeCode(code))) { setError('Enter a valid eight-character room code.'); return; }
    perform('join');
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(membership.room.code); setCopied(true); }
    catch { setNotice('Copy is unavailable here. Select the room code and copy it manually.'); }
  }

  const room = membership?.room;
  return <section className="room-workspace" aria-busy={Boolean(pending)}>
    <h2 ref={heading} tabIndex={-1}>{room ? (verified ? 'Your room is ready.' : 'Check your room.') : 'Bring your devices together.'}</h2>
    {notice && <p className="room-notice" role="status">{notice}</p>}
    {error && <p className="room-error" role="alert">{error}</p>}
    {room ? <>
      <p className="panel-description">Enter this code on your other device.</p>
      <div className="room-code-card">
        <span className="small-label">ROOM CODE</span>
        <p className="room-code" aria-label={`Room code ${room.code}`}>{room.code.slice(0, 4)}-{room.code.slice(4)}</p>
        <button className="secondary-button" onClick={copyCode}>{copied ? 'Copied' : 'Copy code'}</button>
        <p className="footnote">Anyone with this code can join. Share it privately.</p>
      </div>
      <dl className="room-details">
        <div><dt>Joined sessions</dt><dd>{verified ? `${room.memberCount} / ${room.maxMembers}` : 'Not verified'}</dd></div>
        <div><dt>Time remaining</dt><dd>{remaining === null ? 'Checking…' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</dd></div>
      </dl>
      <p className="footnote">Session count is from your last status check; it is not a live online count.</p>
      <div className="room-actions">
        <button className="secondary-button" disabled={Boolean(pending)} onClick={() => perform('refresh')}>{pending === 'refresh' || pending === 'restore' ? 'Checking…' : 'Refresh status'}</button>
        <button className="text-button" disabled={Boolean(pending)} onClick={() => perform('leave')}>{pending === 'leave' ? 'Leaving…' : 'Leave room'}</button>
      </div>
      <p className="room-next">Room connected. QR links and file sharing are coming in later builds.</p>
    </> : <>
      <p className="panel-description">Start a temporary room, or enter a code from another device.</p>
      <div className="create-room-card">
        <span className="small-label">START HERE</span><h3>Create a private room</h3>
        <p>A shared space for your devices. Expires in 30 minutes by default.</p>
        <button className="primary-button" disabled={Boolean(pending)} onClick={() => perform('create')}>{pending === 'create' ? 'Creating…' : 'Create room'}<span aria-hidden="true">↗</span></button>
      </div>
      <form className="join-room-form" onSubmit={submitJoin}>
        <label htmlFor="room-code">Have a room code?</label>
        <p id="code-help" className="footnote">Enter all eight characters. For example, ABCD-2345.</p>
        <div className="join-controls">
          <input id="room-code" value={code} onChange={event => setCode(event.target.value)} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCD-2345" aria-describedby="code-help" disabled={Boolean(pending)} required />
          <button className="secondary-button" type="submit" disabled={Boolean(pending)}>{pending === 'join' ? 'Joining…' : 'Join room'}</button>
        </div>
      </form>
      <p className="footnote">No account needed. Rooms disappear when the server restarts.</p>
    </>}
  </section>;
}

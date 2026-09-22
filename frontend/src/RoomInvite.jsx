import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { buildJoinLink } from './api/invitations.js';

export default function RoomInvite({ code, pageAddress = window.location.href }) {
  const invitation = buildJoinLink(code, pageAddress);
  const [message, setMessage] = useState('');
  async function copyLink() {
    try { await navigator.clipboard.writeText(invitation.url); setMessage('Join link copied.'); }
    catch { setMessage('Copy is unavailable here. Select the join link and copy it manually.'); }
  }
  return <section className="room-invite" aria-labelledby="invite-title">
    <h3 id="invite-title">Scan to join</h3>
    {invitation.url ? <>
      <p className="footnote">Scan with your phone camera, then press Join room.</p>
      <div className="qr-frame">
        {/* A plain QR with a four-module quiet zone; no external image service. */}
        <QRCodeSVG xmlns="http://www.w3.org/2000/svg" value={invitation.url} size={224} level="M" marginSize={4}
          bgColor="#ffffff" fgColor="#000000" role="img" title="Scan to open this room invitation" />
      </div>
      <label className="small-label" htmlFor="join-link">JOIN LINK</label>
      <input id="join-link" className="join-link" readOnly value={invitation.url}
        onFocus={event => event.target.select()} autoComplete="off" spellCheck={false} />
      <button className="secondary-button" onClick={copyLink}>Copy join link</button>
      <p className="footnote">Anyone with this link can join until the room expires. On a local network, both devices must be able to reach this address.</p>
    </> : <p className="room-notice">{invitation.error}</p>}
    {message && <p className="footnote" role="status">{message}</p>}
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import RoomWorkspace from './RoomWorkspace.jsx';
import { getHealth } from './api/health.js';

export default function App() {
  // State changes tell React to redraw the relevant part of the screen.
  const [status, setStatus] = useState('idle');
  const [checkedAt, setCheckedAt] = useState(null);
  const activeRequest = useRef(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function checkConnection() {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    // A stalled server must not leave the button loading forever.
    const timeout = setTimeout(() => controller.abort(), 5000);
    setStatus('checking');
    try {
      await getHealth({ signal: controller.signal });
      setStatus('connected');
      setCheckedAt(new Date().toLocaleTimeString());
    } catch {
      setStatus('error');
      setCheckedAt(null);
    } finally {
      clearTimeout(timeout);
      activeRequest.current = null;
    }
  }

  const messages = {
    idle: ['Check your connection', 'Make sure the sharing server is reachable before getting started.'],
    checking: ['Connecting…', 'Waiting for the sharing server to respond.'],
    connected: ['Server is reachable', `Last checked at ${checkedAt}. Room creation and joining are available.`],
    error: ['Couldn’t reach the server', 'Start the Spring Boot backend, then try again. If it is running, check its address and port.'],
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="DropLink home">Drop<span>Link</span><span className="brand-mark" aria-hidden="true">↗</span></a>
        <span className="build-label">Development build · Day 2</span>
      </header>

      <main className="workspace">
        <aside className="intro">
          <span className="eyebrow">YOUR FILES. YOUR DEVICES.</span>
          <h1>A shorter path<br />between devices.</h1>
          <p>Open a room. Connect your other device. Share what you need.</p>
          <div className="intro-bottom">
            <span className="small-label">BUILT FOR EVERYDAY FILES</span>
            <p>PDFs, documents, images,<br />ZIPs and code files.</p>
            <span className="development-note">File sharing is coming in a later build.</span>
          </div>
        </aside>

        <section className="main-panel" aria-label="Room workspace">
          <div className="panel-heading"><span className="eyebrow">WORKSPACE</span><span className="step-label">02 / Rooms</span></div>
          <RoomWorkspace />
          <details className="server-diagnostics"><summary>Check server connection</summary>
          <section className={`connection-card ${status}`} aria-labelledby="connection-title" aria-busy={status === 'checking'}>
            <div className="status-heading"><span className={`status-dot ${status}`} aria-hidden="true" /><span className="small-label">SERVER CONNECTION</span></div>
            <div role="status" aria-live="polite" aria-atomic="true">
              <h3 id="connection-title">{messages[status][0]}</h3>
              <p>{messages[status][1]}</p>
            </div>
            <button className="primary-button" onClick={checkConnection} disabled={status === 'checking'}>
              {status === 'checking' ? 'Checking…' : status === 'error' ? 'Try again' : status === 'connected' ? 'Check again' : 'Check connection'}
              <span aria-hidden="true">↗</span>
            </button>
          </section>

          </details>
        </section>
      </main>
      <footer className="footer"><span>DropLink</span><span>Simple transfers, less clutter.</span></footer>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { downloadFile, listFiles, uploadFile, validateFile } from './api/files.js';

export function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export default function FilePanel({ membership, refreshRevision = 0, liveStatus = 'offline' }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [transferError, setTransferError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const active = useRef(null);
  const picker = useRef(null);
  const urls = useRef(new Map());
  const queuedRefresh = useRef(false);
  const mounted = useRef(false);

  async function perform(action, file) {
    if (active.current) {
      if (action === 'sync' || action === 'refresh') queuedRefresh.current = true;
      return;
    }
    const controller = new AbortController(); active.current = controller;
    const isList = action === 'sync' || action === 'refresh';
    setPending(action);
    // Live reconciliation must not erase an uncertain upload result or an
    // invalid selection. Each operation owns its own feedback.
    if (isList) setListError('');
    else { setTransferError(''); setNotice(''); }
    try {
      if (action === 'upload') {
        const result = await uploadFile(membership, selected, controller.signal);
        if (controller.signal.aborted) return;
        setFiles(current => [...current.filter(item => item.id !== result.id), result]);
        setSelected(null); picker.current.value = '';
        setNotice('Uploaded. Connected devices update automatically.');
      } else if (action === 'download') {
        const blob = await downloadFile(membership, file, controller.signal);
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = file.name;
        document.body.append(anchor); anchor.click(); anchor.remove();
        // Give the browser time to start saving before releasing the blob URL.
        urls.current.set(url, setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 60000));
        setNotice('Download sent to your browser.');
      } else {
        const result = await listFiles(membership, controller.signal);
        if (controller.signal.aborted) return;
        setFiles(result); setLoaded(true); setUnavailable(false);
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (isList) setListError(failure.message);
      else setTransferError(failure.message);
      if (failure.code === 'ROOM_UNAVAILABLE') { setFiles([]); setUnavailable(true); queuedRefresh.current = false; }
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (!controller.signal.aborted) setPending('');
        // A notification during an upload/list/download must not be lost. One
        // deferred refresh covers the burst after the current request finishes.
        if (queuedRefresh.current && mounted.current) {
          queuedRefresh.current = false;
          perform('sync');
        }
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    perform('refresh');
    return () => {
      mounted.current = false; queuedRefresh.current = false;
      active.current?.abort(); active.current = null;
      for (const [url, timer] of urls.current) { clearTimeout(timer); URL.revokeObjectURL(url); }
      urls.current.clear();
    };
    // Parent keys this panel by membership; status refreshes keep the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (refreshRevision > 0) perform('sync'); }, [refreshRevision]);

  const transferring = pending === 'upload' || pending === 'download';
  const listing = pending === 'refresh' || pending === 'sync';

  function clearSelection() {
    setSelected(null); setSelectionError('');
    picker.current.value = '';
    // The Clear button disappears; return focus to a useful, stable control.
    picker.current.focus();
  }

  return <section className="file-panel" aria-labelledby="file-heading">
    <div className="file-heading"><h3 id="file-heading">Room files</h3>
      <button className="text-button" disabled={Boolean(pending) || unavailable} onClick={() => perform('refresh')}>{listing ? 'Refreshing…' : 'Refresh files'}</button></div>
    <p className="footnote" id="file-help">Any file type · 10 MiB per file · 20 files / 50 MiB per room. Files expire with this room.</p>
    <form onSubmit={event => { event.preventDefault(); if (!selected) return; perform('upload'); }}>
      <label htmlFor="file-picker">Choose a file</label>
      <input id="file-picker" ref={picker} type="file" aria-describedby={`file-help${selectionError ? ' selection-error' : ''}${selected ? ' selected-file' : ''}`} aria-invalid={Boolean(selectionError)} disabled={transferring || unavailable}
        onChange={event => {
          const file = event.target.files?.[0];
          const problem = file ? validateFile(file) : '';
          setSelectionError(problem); setSelected(problem ? null : file ?? null);
        }} />
      {selected && <div className="selected-file">
        <p id="selected-file"><span className="small-label">READY TO SHARE</span><span className="file-name">{selected.name}</span><span className="footnote">{formatBytes(selected.size)}</span></p>
        <button type="button" className="text-button" disabled={transferring || unavailable} onClick={clearSelection}>Clear selection</button>
      </div>}
      {selectionError && <p id="selection-error" className="error-message" role="alert">{selectionError}</p>}
      <button className="primary-button" type="submit" disabled={!selected || Boolean(pending) || unavailable}>{pending === 'upload' ? 'Uploading…' : 'Upload file'}<span aria-hidden="true">↑</span></button>
    </form>
    {transferError && <p className="error-message" role="alert">{transferError}</p>}
    {listError && <p className="error-message" role="alert">{listError}</p>}
    <p className="footnote transfer-status" role="status">{pending === 'download' ? 'Preparing download…' : pending === 'upload' ? 'Uploading your file… Keep this tab open.' : notice}</p>
    <p className="footnote" role="status">{listing ? (loaded ? 'Updating room files…' : 'Loading room files…') : ''}</p>
    {files.length > 0 ? <ul className="file-list">{files.map(file => <li key={file.id}>
      <div><span className="file-name">{file.name}</span><span className="footnote">{formatBytes(file.size)}</span></div>
      <button className="secondary-button" disabled={Boolean(pending) || unavailable} onClick={() => perform('download', file)} aria-label={`Download ${file.name}`}>Download</button>
    </li>)}</ul> : loaded && !unavailable && <p className="file-empty">No files yet. Choose one to start sharing.</p>}
    <p className={`live-status ${liveStatus}`} role="status">{
      liveStatus === 'live' ? 'Live updates connected' : liveStatus === 'connecting' ? 'Connecting live updates…' :
      liveStatus === 'reconnecting' ? 'Reconnecting… You can still refresh files manually.' : 'Live updates unavailable. Refresh files manually.'
    }</p>
  </section>;
}

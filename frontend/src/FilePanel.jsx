import { useEffect, useRef, useState } from 'react';
import { downloadFile, listFiles, uploadFile, validateFile } from './api/files.js';

export function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export default function FilePanel({ membership }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const active = useRef(null);
  const picker = useRef(null);
  const urls = useRef(new Map());

  async function perform(action, file) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setPending(action); setError(''); setNotice('');
    try {
      if (action === 'upload') {
        const result = await uploadFile(membership, selected, controller.signal);
        if (controller.signal.aborted) return;
        setFiles(current => [...current.filter(item => item.id !== result.id), result]);
        setSelected(null); picker.current.value = '';
        setNotice('Uploaded. On your other device, choose Refresh files.');
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
      setError(failure.message);
      if (failure.code === 'ROOM_UNAVAILABLE') { setFiles([]); setUnavailable(true); }
    } finally {
      if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setPending(''); }
    }
  }

  useEffect(() => {
    perform('refresh');
    return () => {
      active.current?.abort(); active.current = null;
      for (const [url, timer] of urls.current) { clearTimeout(timer); URL.revokeObjectURL(url); }
      urls.current.clear();
    };
    // Parent keys this panel by membership; status refreshes keep the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <section className="file-panel" aria-labelledby="file-heading" aria-busy={Boolean(pending)}>
    <div className="file-heading"><h3 id="file-heading">Room files</h3>
      <button className="text-button" disabled={Boolean(pending)} onClick={() => perform('refresh')}>{pending === 'refresh' ? 'Refreshing…' : 'Refresh files'}</button></div>
    <p className="footnote" id="file-help">Any file type · 10 MiB per file · 20 files / 50 MiB per room. Files expire with this room.</p>
    <form onSubmit={event => { event.preventDefault(); if (!selected) return; perform('upload'); }}>
      <label htmlFor="file-picker">Choose a file</label>
      <input id="file-picker" ref={picker} type="file" aria-describedby="file-help" disabled={Boolean(pending) || unavailable}
        onChange={event => {
          const file = event.target.files?.[0];
          const problem = file ? validateFile(file) : '';
          setError(problem); setNotice(''); setSelected(problem ? null : file ?? null);
        }} />
      <button className="primary-button" type="submit" disabled={!selected || Boolean(pending) || unavailable}>{pending === 'upload' ? 'Uploading…' : 'Upload file'}<span aria-hidden="true">↑</span></button>
    </form>
    {error && <p className="error-message" role="alert">{error}</p>}
    <p className="footnote" role="status">{notice || (pending === 'download' ? 'Preparing download…' : '')}</p>
    {files.length > 0 ? <ul className="file-list">{files.map(file => <li key={file.id}>
      <div><span className="file-name">{file.name}</span><span className="footnote">{formatBytes(file.size)}</span></div>
      <button className="secondary-button" disabled={Boolean(pending) || unavailable} onClick={() => perform('download', file)} aria-label={`Download ${file.name}`}>Download</button>
    </li>)}</ul> : loaded && !unavailable && <p className="file-empty">No files yet. Choose one to start sharing.</p>}
    <p className="footnote">Refresh to see files from your other device. Automatic updates arrive in Day 5.</p>
  </section>;
}

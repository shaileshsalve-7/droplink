import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FilePanel from './FilePanel.jsx';
const member = { room: { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7bd' }, memberToken: 'a'.repeat(43) };
const file = { id: 'ea013e60-fb65-4717-bb0c-a1a500edb7b1', name: 'notes.java', size: 3, uploadedAt: '2026-09-23T00:00:00Z', expiresAt: '2026-09-23T00:30:00Z' };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => reply([]))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function open() { render(<FilePanel membership={member} />); await screen.findByText(/No files yet/); }
function select(bytes = 'abc') { fireEvent.change(screen.getByLabelText('Choose a file'), { target: { files: [new File([bytes], 'notes.java')] } }); }

test('load is safe under StrictMode; refresh gets another device’s file', async () => {
  render(<StrictMode><FilePanel membership={member} /></StrictMode>);
  await screen.findByText(/No files yet/);
  fetch.mockImplementation(async () => reply([file]));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh files' }));
  await screen.findByText('notes.java');
  expect(fetch.mock.calls.every(([, o]) => o.headers.Authorization === `Bearer ${member.memberToken}`)).toBe(true);
});
test('upload disables duplicate submissions, shows the file and clears the picker', async () => {
  await open(); select();
  let resolve;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: /Upload file/ }));
  expect(screen.getByRole('button', { name: /Uploading/ }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Refresh files' }).disabled).toBe(true);
  await act(async () => resolve(reply(file, 201)));
  await screen.findByText('notes.java');
  expect(screen.getByRole('button', { name: /Upload file/ }).disabled).toBe(true);
  expect(fetch.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1);
});
test('empty selection is rejected without posting', async () => {
  await open(); select('');
  expect(screen.getByRole('alert').textContent).toContain('not empty');
  expect(screen.getByRole('button', { name: /Upload file/ }).disabled).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
test('failed upload retains selection and suggests refreshing before retry', async () => {
  await open(); select(); fetch.mockRejectedValueOnce(new TypeError('offline'));
  fireEvent.click(screen.getByRole('button', { name: /Upload file/ }));
  expect((await screen.findByRole('alert')).textContent).toContain('Refresh files before retrying');
  expect(screen.getByRole('button', { name: /Upload file/ }).disabled).toBe(false);
});
test('expired access clears files and disables uploads', async () => {
  fetch.mockImplementationOnce(async () => reply([file]));
  render(<FilePanel membership={member} />); await screen.findByText('notes.java');
  fetch.mockResolvedValueOnce(reply({ code: 'ROOM_UNAVAILABLE' }, 404));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh files' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('notes.java')).toBeNull();
  expect(screen.getByLabelText('Choose a file').disabled).toBe(true);
});
test('download saves a blob with the filename and releases the object URL on unmount', async () => {
  const create = vi.fn(() => 'blob:test'); const revoke = vi.fn();
  URL.createObjectURL = create; URL.revokeObjectURL = revoke;
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    expect(this.download).toBe('notes.java'); expect(this.href).toBe('blob:test');
  });
  fetch.mockImplementationOnce(async () => reply([file]));
  const view = render(<FilePanel membership={member} />); await screen.findByText('notes.java');
  fetch.mockResolvedValueOnce(new Response('abc'));
  fireEvent.click(screen.getByRole('button', { name: 'Download notes.java' }));
  await screen.findByText('Download sent to your browser.');
  expect(click).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1);
  view.unmount(); expect(revoke).toHaveBeenCalledWith('blob:test');
});
test('unmount aborts a pending upload', async () => {
  const view = render(<FilePanel membership={member} />); await screen.findByText(/No files yet/); select();
  let signal;
  fetch.mockImplementationOnce((_url, options) => { signal = options.signal; return new Promise(() => {}); });
  fireEvent.click(screen.getByRole('button', { name: /Upload file/ }));
  view.unmount(); expect(signal.aborted).toBe(true);
});

test('a notification during upload queues one refresh and keeps files from both devices', async () => {
  const view = render(<FilePanel membership={member} refreshRevision={0} liveStatus="live" />);
  await screen.findByText(/No files yet/); select();
  let finish;
  fetch.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  fireEvent.click(screen.getByRole('button', { name: /Upload file/ }));
  view.rerender(<FilePanel membership={member} refreshRevision={1} liveStatus="live" />);
  view.rerender(<FilePanel membership={member} refreshRevision={2} liveStatus="live" />);
  const remote = { ...file, id: 'ea013e60-fb65-4717-bb0c-a1a500edb7b2', name: 'phone.pdf' };
  fetch.mockImplementationOnce(async () => reply([file, remote]));
  await act(async () => finish(reply(file, 201)));
  await screen.findByText('phone.pdf'); expect(screen.getByText('notes.java')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(screen.getByText('Live updates connected')).toBeTruthy();
});
test('a notification during a list fetch triggers reconciliation after the stale response', async () => {
  let finish;
  fetch.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  const view = render(<FilePanel membership={member} refreshRevision={0} />);
  view.rerender(<FilePanel membership={member} refreshRevision={1} />);
  fetch.mockImplementationOnce(async () => reply([file]));
  await act(async () => finish(reply([])));
  await screen.findByText('notes.java'); expect(fetch).toHaveBeenCalledTimes(2);
});

test('background refresh preserves picker focus and accepts a selection while loading', async () => {
  const view = render(<FilePanel membership={member} />);
  await screen.findByText(/No files yet/);
  const picker = screen.getByLabelText('Choose a file'); picker.focus();
  let finish;
  fetch.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  view.rerender(<FilePanel membership={member} refreshRevision={1} />);
  expect(picker.disabled).toBe(false);
  expect(document.activeElement).toBe(picker);
  select();
  expect(screen.getByText('3 B')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Upload file/ }).disabled).toBe(true);
  await act(async () => finish(reply([])));
  expect(screen.getByRole('button', { name: /Upload file/ }).disabled).toBe(false);
  expect(screen.getByText('notes.java')).toBeTruthy();
});

test('clear selection resets the upload and returns focus to the picker', async () => {
  await open(); select();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  const picker = screen.getByLabelText('Choose a file');
  expect(document.activeElement).toBe(picker);
  expect(picker.value).toBe('');
  expect(screen.queryByText('READY TO SHARE')).toBeNull();
  expect(screen.getByRole('button', { name: /Upload file/ }).disabled).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('selection validation remains linked to the input after a live refresh', async () => {
  const view = render(<FilePanel membership={member} />);
  await screen.findByText(/No files yet/); select('');
  view.rerender(<FilePanel membership={member} refreshRevision={1} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh files' }).disabled).toBe(false));
  const picker = screen.getByLabelText('Choose a file');
  expect(picker.getAttribute('aria-invalid')).toBe('true');
  expect(picker.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
  select(); expect(picker.getAttribute('aria-invalid')).toBe('false');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('background reconciliation retains an uncertain upload warning and selection', async () => {
  const view = render(<FilePanel membership={member} />);
  await screen.findByText(/No files yet/); select();
  fetch.mockRejectedValueOnce(new TypeError('offline'));
  fireEvent.click(screen.getByRole('button', { name: /Upload file/ }));
  await screen.findByRole('alert');
  view.rerender(<FilePanel membership={member} refreshRevision={1} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh files' }).disabled).toBe(false));
  expect(screen.getByRole('alert').textContent).toContain('Refresh files before retrying');
  expect(screen.getByText('READY TO SHARE')).toBeTruthy();
  expect(fetch.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1);
});

test('initial list failure offers refresh without claiming the room is empty', async () => {
  let finish;
  fetch.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  render(<FilePanel membership={member} />);
  expect(screen.getByText('Loading room files…')).toBeTruthy();
  expect(screen.queryByText(/No files yet/)).toBeNull();
  await act(async () => finish(reply({ code: 'UNAVAILABLE' }, 503)));
  await screen.findByRole('alert');
  expect(screen.queryByText(/No files yet/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh files' }));
  await screen.findByText(/No files yet/);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('clear selection cannot change the file while its upload is in flight', async () => {
  await open(); select();
  let finish;
  fetch.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  fireEvent.click(screen.getByRole('button', { name: /Upload file/ }));
  expect(screen.getByRole('button', { name: 'Clear selection' }).disabled).toBe(true);
  expect(screen.getByLabelText('Choose a file').disabled).toBe(true);
  await act(async () => finish(reply(file, 201)));
  expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
});

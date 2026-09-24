# Day 4 verification

Implementation checkpoint: authenticated uploads, listing, attachment downloads,
and temporary storage. Original milestone date: September 24; early work was
explicitly requested. Publication target: September 23 morning, Asia/Kolkata,
after verifying Day 3. No Day 5 feature work is included.

## Automated results

| Check | Result |
| --- | --- |
| Node API/invitation/file tests | 19 passed |
| React tests under Vitest/jsdom | 27 passed |
| Java/JUnit/Spring HTTP tests | 27 passed |
| Total automated tests | **73 passed, zero failures** |
| Vite production build | Passed |
| Spring Boot executable JAR packaging | Passed |
| Real frontend client → Vite proxy → Spring file flow | Passed |
| Scheduled expiry cleanup on actual disk files | Passed |
| Forced server crash, startup orphan cleanup, revoked old access | Passed |
| Git whitespace check | Passed |

The new backend tests cover binary round trips for PDF/DOCX/PNG/ZIP/Java/HTML
filenames, duplicate names, wrong-room and revoked access, immediate expiry,
last-member cleanup, empty/oversized files, room file count and byte limits,
server byte quota, concurrent final-slot uploads, failed/truncated copies,
expiry during a copy, sanitized names, orphan cleanup, and process locking.

HTTP tests send real multipart requests to embedded Tomcat, including a file just
over 10 MiB. They check attachment/content-type/cache/nosniff headers and safe JSON
errors. HTTP tests use an isolated randomly named store, never the app's default store.

New frontend checks cover FormData/bearer headers, response validation, interrupted
uploads without automatic retry, exact downloaded bytes, StrictMode list loading,
manual refresh, duplicate-click prevention, selection validation, expired access,
blob URL release, and abort on unmount. Existing room/QR tests still pass.

The live script printed:

```text
PASS: both directions through real frontend API -> Vite -> Spring; six file extensions, byte equality, room isolation and revoked access.
PASS: expiry immediately blocks access and the scheduled cleaner removes actual disk files.
PASS: hard restart removes orphaned files and invalidates old membership.
```

It sends representative binary bytes under each extension; it does not claim to
parse or validate PDF, Office, image, or ZIP formats. Storage treats all files as
opaque bytes. The script uses its own processes, ports, and temporary directory,
then removes them. Waiting for the real cleanup timer is intentional.

## Failures found and resolved

- Initial room/invitation UI tests assumed only room requests used `fetch`. Adding
  the file panel consumed their mocked responses. Isolated file API mocks now keep
  those tests focused; dedicated file tests exercise the actual client.
- Oversized multipart parsing happened before controller selection, so scoped
  controller advice returned no JSON. A global multipart-only advice now returns
  `413 FILE_TOO_LARGE`; the real HTTP test passed after the fix.
- Offline Maven initially lacked cached dependencies/plugins. Packaging succeeded
  after downloading them using an environment-only proxy configuration. No proxy
  URL, credentials, or generated build output was committed.
- Tests initially ran using the default application storage configuration. All
  HTTP test classes now use a separate randomized directory; final backend tests
  passed after this isolation change.

## Limits of this verification

No physical phone camera, Wi-Fi transfer, mobile download/save dialog, real-browser
responsive screenshot, or Windows/IntelliJ session was exercised here. jsdom is
not a browser layout engine. The manual workflow is in `day-04.md`.
No load test, malware scanning, secure erasure, WebSocket delivery, or production
hosting has been implemented or claimed. Uploads are serialized within the storage
service. The server can read files; this is not end-to-end encryption.
Access ends immediately at expiry, while deletion may lag and retries on failure.
Downloads already started may finish after expiry. A crash requires restart to
clean app-owned blobs; container multipart spool files are separate temporary files.

## GitHub status at preparation

Day 3's earlier scheduled run had not published its commit. The authorized Day 3
checkpoint was published during this session after the midnight boundary, then
verified by fetching `main` and matching its tree:

- Commit: `121974da3014b390346a6475aa3df847f9f99015`
- Tree: `96eab3c9cb4e2096643ad3612f2596e829cd5462`

Day 4 builds on that verified commit. It is prepared for later publication;
preparation and scheduling must not be described as a successful upload.
The publisher must recheck `main`, verify the checkpoint tree, and use a non-forced
update. It must report any access failure or unexpected remote changes.

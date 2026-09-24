# Day 4 — uploads and temporary storage

The original calendar labels this milestone September 24. The user asked to build
it early and publish on September 23, after Day 3 appears on GitHub. Milestone
numbers control scope; the calendar does not authorize starting the next milestone.
Day 5 remains paused.

## What we are building, and why

A room code connects devices, but transferring a file needs three more parts.

| Part | What it does | Why it exists |
| --- | --- | --- |
| File HTTP API | Uploads a file, lists metadata, downloads bytes | Each operation needs a predictable contract |
| Temporary storage service | Streams bytes to disk, checks quotas, deletes expired files | Files must not fill memory or stay forever |
| React file panel | Select, upload, refresh, download, explain failures | Both phone and laptop need the same simple workflow |

The receiver presses **Refresh files** to see another device's uploads. This already
supports both directions. WebSocket notifications are Day 5; they will notify the
browser to refresh metadata, not transport the file bytes themselves.

We use Spring's built-in multipart support, following its
[file upload guide](https://spring.io/guides/gs/uploading-files/). Multipart sends the
file as bytes plus a filename. JSON is used for the small metadata response. There
is no need to base64-encode files, add a database, or unpack ZIP archives.

## Read the implementation in this order

1. `frontend/src/api/files.js`: `FormData` sends a file with the browser's multipart
   boundary. The existing member token goes in `Authorization`, never in the URL.
2. `backend/src/main/java/com/droplink/room/RoomRequestFilter.java`: rejects invalid
   membership before Spring parses/spools an upload; admits at most four concurrent
   upload requests. POST attempts still share the existing rate limiter.
3. `FileController.java`: maps the HTTP operations to the service. Downloads always
   use `application/octet-stream`, attachment disposition, and `nosniff`.
4. `FileStorageService.java`: validates room access, checks size/count/disk quotas,
   copies bytes through a 16 KiB buffer, then rechecks room access before listing
   the completed file. Its lock is separate from RoomService's lock.
5. `FileUploadErrors.java`: converts multipart failures into safe JSON. It is global
   because parsing can fail before Spring chooses a controller.
6. `frontend/src/FilePanel.jsx`: keeps selection/loading/error state, refreshes the
   file list, and gives downloads to the browser with a temporary blob URL.

Reasoning comments appear beside the access recheck, locks, streaming, temporary
URL cleanup, and error handling. These explain why the code is there rather than
repeating each line's syntax.

## API contract

All file operations require `Authorization: Bearer <memberToken>`.

| Method and path | Request | Success |
| --- | --- | --- |
| `POST /api/rooms/{roomId}/files` | Multipart field `file` | `201` and one file's metadata |
| `GET /api/rooms/{roomId}/files` | No body | `200` and an array of metadata |
| `GET /api/rooms/{roomId}/files/{fileId}` | No body | `200` and attachment bytes |

Metadata contains `id`, `name`, `size` in bytes, `uploadedAt`, and `expiresAt`.
It contains no disk path or member credentials. File IDs are UUIDs. Files with the
same displayed name have different IDs, so one upload never replaces another.

Wrong/missing membership returns `404 ROOM_UNAVAILABLE`. A member of another room
cannot use a known file ID to download it. Missing file IDs return `404 FILE_UNAVAILABLE`.
Empty files return `400 EMPTY_FILE`; oversized files return `413 FILE_TOO_LARGE`;
full rooms return `409 ROOM_STORAGE_FULL`; exhausted disk quota or a storage failure
returns `503`. See the client API module for the corresponding user messages.

## Storage rules

- Any non-empty file type is accepted: PDFs, documents, images, ZIPs, code, and other
  bytes. There is no preview, execution, extraction, or file conversion.
- Limits: **10 MiB per file**, **20 files / 50 MiB per room**, **250 MiB of stored
  blobs per server**. One MiB is 1,048,576 bytes. These replace the larger proposed
  defaults in the earlier architecture notes.
- A random UUID chooses the disk name. The supplied filename is sanitized and kept
  only for display/download. `../../notes.java` cannot choose a storage path.
- Metadata becomes visible only after a complete copy and a fresh access check.
  Failed copies are discarded; failed deletions are retried.
- The room's original expiry also applies to every file. Uploading does not extend it.
- New access stops immediately at expiry. Disk cleanup runs every 30 seconds, also
  after the last member leaves. An in-progress download may finish after expiry.
- The default folder is `droplink-files` under Java's temporary directory. Override
  with `DROPLINK_STORAGE_DIR` only to a dedicated app-owned folder.
- A process lock prevents two backend instances using that folder. Startup removes
  old generated blobs because old in-memory rooms are gone. Normal shutdown removes
  blobs too. A hard crash leaves blobs until restart. No secure-erasure claim is made.
- Multipart parsing has separate temporary-disk overhead: four requests, each limited
  to 11 MiB. Servlet temp files after a hard crash may need OS/container cleanup.
- The MVP serializes storage operations for predictable quota enforcement. This is
  a small single-server design, not a high-throughput cloud storage service.

## Run on your laptop

From `droplink`, open a backend terminal (PowerShell):

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

In a second terminal, again starting at `droplink`:

```powershell
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```

On Linux/macOS, use `./mvnw` instead of `.\mvnw.cmd`.

Find the laptop's Wi-Fi IPv4 address with `ipconfig`. Open, for example,
`http://192.168.1.20:5173` on the laptop itself. Use your actual address. Connect
both devices to the same trusted Wi-Fi and allow the development server through
Windows Firewall for the private network if prompted. Keep the backend bound to
loopback; Vite forwards the API requests.

1. Create a room on the laptop.
2. Scan its QR on the phone, then press **Join room**, or enter the code manually.
3. Upload a small PDF from the phone.
4. On the laptop press **Refresh files**, then **Download**.
5. Upload an image or ZIP from the laptop; refresh and download on the phone.
6. Try uploading the same name twice; both entries should remain.
7. Stop the backend with Ctrl+C when finished.

This phone walkthrough is a manual check for you. Automated tests use two sessions
through the real server; they do not prove camera behavior or a physical phone's
save dialog. Those checks remain pending.

## Test before moving on

From the repository root:

```powershell
npm test --prefix frontend
npm run build --prefix frontend
cd backend
.\mvnw.cmd test
.\mvnw.cmd package
cd ..
node scripts/smoke-day4.mjs
```

The live script starts its own Vite/Spring processes on ports 15173 and 18080, uses
its own temporary directory, checks transfers in both directions, waits for expiry
and disk deletion, then deliberately kills/restarts its own backend to verify
orphan cleanup. It stops its processes afterward. Do not point it at a real running
service. Use `SMOKE_FRONTEND_PORT` and `SMOKE_BACKEND_PORT` if those ports are busy.
It normally takes around 35–50 seconds because it exercises the real cleanup timer.

Automated tests cover bytes, authorization, limits, race conditions, expiry,
partial copies, startup cleanup, HTTP errors, and UI state. See
[verification-day-04.md](verification-day-04.md) for the recorded results.

## Debug a failure

| Symptom | Check or action |
| --- | --- |
| `413` or “Choose a file up to 10 MiB” | Use a smaller file; both servlet and service enforce limits |
| Room is full | 20-file and 50 MiB limits apply together; create a fresh room |
| Room unavailable | Refresh room status; expiry, leaving, and restart invalidate access |
| Upload interrupted | Refresh files before retrying; the server may already have stored it |
| Other device sees no file | Press **Refresh files**; live updates are Day 5 |
| Backend says storage is already in use | Stop the other backend or choose a separate dedicated directory; do not delete its lock while running |
| Storage unavailable | Check disk space and directory permissions; never fix this by using a personal folder as the store |
| Maven fails offline | Run the wrapper with internet once to download missing dependencies/plugins |
| Phone cannot open the QR URL | Check Wi-Fi, laptop IPv4, firewall, and Vite's host setting; phone localhost is the phone |

In IntelliJ, set breakpoints in `FileController.upload`, `FileStorageService.upload`,
and `FileStorageService.cleanup`. Watch `size`, `roomId`, and the copy counter.
Do not paste bearer tokens or personal file contents into screenshots or logs.
In browser DevTools → Network, inspect the status of `/api/rooms/.../files`.
An upload succeeds at `201`; a rejected request should explain its error in JSON.

Actual fixes during this milestone:

- An oversized multipart request failed before the controller was selected. The
  controller-scoped advice could not return JSON. A global multipart-only handler
  fixed it, verified against the real servlet with a file over 10 MiB.
- New file-list requests consumed old room-test response mocks. Room tests now
  isolate the file API, while dedicated file-panel tests exercise its real client.
- Offline Maven lacked some cached plugins. An environment-only proxy setting
  downloaded dependencies; no workspace proxy or credentials were added to source.
- HTTP tests use their own randomly named storage directory so they cannot clear
  a developer's app-owned blobs.

## Git and publication

Day 3 is published as `121974da3014b390346a6475aa3df847f9f99015`:
[verified Day 3 commit](https://github.com/shaileshsalve-7/droplink/commit/121974da3014b390346a6475aa3df847f9f99015).
The Day 4 checkpoint is based on that commit. Its upload is requested for
September 23 morning, Asia/Kolkata, after rechecking Day 3. Scheduled is not uploaded.
If the remote history changes, stop and report the conflict rather than force-push.

The implementation workflow (already performed for the prepared checkpoint):

```powershell
git status
git diff --check
git add AGENTS.md README.md backend/src frontend/src docs scripts/smoke-day4.mjs
git commit -m "feat: add temporary file uploads and authenticated downloads"
```

Exactly one Day 4 implementation commit. Do not repeat the commit when receiving
the already committed checkpoint. The scheduled publisher will create that one
commit on `main` after validating its files and parent. Once publication is confirmed,
update your own clean clone with:

```powershell
git switch main
git pull --ff-only origin main
```

For a manual publication from a clean branch based on the same verified Day 3 commit,
only after the requested time and if the scheduled publisher has not already published:

```powershell
git push origin HEAD:main
```

Do not force-push. Do not manually publish while the scheduled task is running.

Commit message:

```text
feat: add temporary file uploads and authenticated downloads
```

Short GitHub summary:

> Add authenticated file upload, listing, and attachment download for both devices.
> Stream bytes to temporary storage with file/room/server limits and expiry cleanup.
> Add a responsive file panel, storage/HTTP/UI tests, and a live transfer/restart check.
> Manual file refresh is available; WebSocket updates remain Day 5.

## Learning checkpoint

Before Day 5, explain these in your own words:

1. Why is the original filename unsuitable as a storage path?
2. Why check room access both before and after copying?
3. Why does expiry block downloads before the disk cleaner runs?
4. Why should a failed upload response not trigger an automatic retry?
5. Which part will WebSockets improve without replacing HTTP uploads?

Stop here. Day 5 needs a new instruction from the user.

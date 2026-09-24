# Day 5 — real-time sharing

## What and why

Day 4 transfers files correctly, but the receiving device must press Refresh.
Day 5 adds a live notification channel so the receiver learns that the room changed.
The file itself still uses the existing HTTP endpoints and temporary storage.

| Part | What it does | Why |
| --- | --- | --- |
| WebSocket endpoint | Keeps a connection open after authentication | The server can notify a device without waiting for a new HTTP request |
| Room events | Marks that room's file list as changed after a successful upload | Keeps file bytes and credentials out of notifications |
| Browser connection manager | Authenticates, watches heartbeats, reconnects | Wi-Fi changes and background tabs can break connections |
| Deferred file refresh | Fetches the authoritative list after notifications | Recovers missed changes and avoids losing events during transfers |

The implementation follows [Spring's WebSocket server API](https://docs.spring.io/spring-framework/reference/web/websocket/server.html).
A plain native WebSocket is enough for this small MVP; no STOMP broker or new
client package is required. This is server-mediated sharing, not peer-to-peer or
end-to-end encryption.

## Read these files in order

1. `RoomSocketConfiguration.java` registers `/api/live`, retaining Spring's same-origin
   default. `frontend/vite.config.js` proxies WebSocket upgrades to Spring.
2. `RoomSocketHandler.java` handles authentication, room-specific notifications,
   membership checks, heartbeats, connection limits, and closure.
3. `RoomFilesChanged.java` defines the small internal event.
4. `FileController.java` publishes that event only after a successful storage call.
5. `frontend/src/api/live.js` manages one browser connection, authentication frames,
   deadlines, reconnect delays, and visibility/online recovery.
6. `frontend/src/useRoomLive.js` connects that lifecycle to React and cleans it up
   on unmount, including StrictMode's setup/cleanup cycle.
7. `RoomWorkspace.jsx` handles live room state and revoked access. `FilePanel.jsx`
   refreshes the file list automatically and queues one refresh while busy.

Comments explain the credential transport, bounded queues, deferred refresh,
reconciliation after reconnect, and separation of network I/O from storage locks.

## Connection and event flow

1. Browser opens same-origin `/api/live` using `ws:` locally or `wss:` on HTTPS.
2. Its first JSON frame is `auth` with room ID and member token. Browser WebSocket
   APIs cannot supply a custom Authorization header. Credentials therefore travel
   in the frame, never the URL. Production requires HTTPS/WSS.
3. The server validates current membership and returns `ready` plus room metadata.
4. The browser fetches the current HTTP file list on every `ready`, even after reconnect.
5. A successful upload marks only that room's authenticated sockets for notification.
6. A `files_changed` message causes another HTTP list fetch. That GET uses the member
   token and enforces current room access as before.

| Message | Direction | Meaning |
| --- | --- | --- |
| `auth` | Browser → server | Prove membership with room ID and member token |
| `ready` | Server → browser | Authenticated; reconcile current room/file state |
| `files_changed` | Server → browser | Fetch the HTTP file list |
| `room_changed` | Server → browser | Joined session count changed |
| `ping` / `pong` | Both | Check that the connection still responds |

No event contains file bytes or another member's token. A known file ID or room ID
alone grants no access. The Origin check helps protect browsers; non-browser clients
can omit or forge Origin, so the member credential remains mandatory.

## Recovery and bounds

- Authenticate within five seconds or the server closes the socket.
- Maximum 128 sockets total and two per member for brief reconnect overlap.
- Incoming messages are limited to 1 KiB; binary messages are rejected.
- Handshakes share the existing rate limiter. Behind Vite, devices share its peer budget.
- Server checks clients on a 500 ms schedule using a bounded four-worker send queue.
  A slow send cannot hold an HTTP upload or the file/room cleanup scheduler.
- Repeated file notifications collapse into one pending refresh flag. This bounds
  memory while preserving the need to fetch the latest list.
- Server sends a heartbeat every 15 seconds and closes missing responses after 45.
  Browser also detects missing authentication/heartbeat responses.
- Browser reconnects after a delay that grows up to about 30 seconds, with jitter.
- Returning to a visible tab or coming online reconnects and fetches current data.
- Code `4404` means membership is no longer valid; the browser clears saved credentials.
- A socket closing does not mean the user left the room. Joined sessions are not
  the number of online devices, and a heartbeat never extends room expiry.
- HTTP refresh and transfer controls remain available if sockets are unavailable.

If a notification arrives during an upload, download, or older list request,
`queuedRefresh` is set. Once the current operation finishes, exactly one deferred
GET runs. Without that flag, an event during a busy period could disappear and the
screen could remain stale until a manual refresh.

## Run and try it

From `droplink`, open PowerShell terminal 1:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Terminal 2, starting at `droplink`:

```powershell
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```

Use `./mvnw` on Linux/macOS. For two-device setup use the laptop's Wi-Fi address
on both devices, as described in [Day 3](day-03.md). The backend stays on loopback;
Vite forwards both HTTP and WebSocket traffic. Do not publish this dev server.

1. Create a room on the laptop and join on the phone.
2. Wait for **Live updates connected**.
3. Upload on the phone. The laptop should show the file without pressing Refresh.
4. Download it, then upload from the laptop to test the opposite direction.
5. Turn off Wi-Fi briefly. Restore it and return to the page. Missed files should appear.
6. Leave on one device. Its membership is removed; the other remains connected.
7. For a short expiry check, stop the backend, set `$env:ROOM_TTL="PT15S"`, restart,
   and create a new room. It should expire and close its live connection. Remove
   the override afterward with `Remove-Item Env:ROOM_TTL`.

Physical phone/camera/save-dialog testing is still a manual check. Automated
sessions and simulated DOM tests do not prove the behavior of your phone.

## Test and build

From the repository root:

```powershell
npm test --prefix frontend
npm run build --prefix frontend
cd backend
.\mvnw.cmd test
.\mvnw.cmd package
cd ..
node scripts/smoke-day5.mjs
```

The smoke script starts its own Spring and Vite servers on ports 18080/15173 and
uses a dedicated temporary directory. It observes actual WebSocket notifications,
fetches HTTP lists with the real frontend client, downloads in both directions,
checks another room's isolation, reconnects after missed changes, revokes access,
waits for expiry, and kills/restarts its own server. It stops its processes afterward.
Use `SMOKE_BACKEND_PORT` and `SMOKE_FRONTEND_PORT` if those ports are occupied.

See [verification-day-05.md](verification-day-05.md) for recorded results and limitations.

## Debug before proceeding

| Symptom | What to inspect |
| --- | --- |
| Files transfer but no automatic updates | DevTools Network → WS → `/api/live`; inspect upgrade status and ready frame |
| WebSocket upgrade rejected | Check same-origin Host/Origin and Vite `ws: true`; do not “fix” by allowing `*` |
| Reconnecting status | Check backend reachability and Wi-Fi; manual refresh still works |
| Close code 4404 | Room expired, member left, or backend restarted; create/join again |
| Close code 1008 | Authentication deadline or invalid protocol message |
| Close code 1013 | Socket capacity is full; wait for retry or use manual refresh |
| Upload succeeded but missing on reconnect | Confirm `ready` triggers an HTTP list GET with the current member token |
| Backend unit tests fail during JVM attach | Use the provided interface fake; tests should not require instrumenting this environment |
| `no main manifest attribute` | Re-run Maven `package`; launch the executable `.jar`, not `.jar.original` |

IntelliJ breakpoints: `handleTextMessage` for authentication, `filesChanged` for
upload events, and `update` for access/heartbeat checks. Frontend breakpoints:
`next.onmessage` and `FilePanel.perform`. Never share a screenshot of an auth frame
containing your active token. Use harmless demo files and redact room credentials.

## Git, publication, and the remaining days

The latest user request authorizes the remaining days without asking `next day`.
It also requests one upload per day. Day 3 already published September 23 in India;
Day 4's pending upload moves to September 24, Day 5 to September 25, and Days 6–8
run September 26–28. See [remaining-work.md](remaining-work.md).

Day 5 is prepared locally on top of Day 4. The publisher must wait for the actual
remote Day 4 commit, verify its tree, then create this one Day 5 commit on that
parent. It must not force local history onto the remote or upload twice in one day.
Scheduled tasks must report failures truthfully; scheduling is not publication.

Implementation commands (the prepared checkpoint already has its own commit):

```powershell
git status
git diff --check
git add AGENTS.md README.md backend/src frontend/src frontend/vite.config.js docs scripts/smoke-day5.mjs
git commit -m "feat: add authenticated real-time room updates"
```

After the scheduled upload is confirmed, update your own clean GitHub clone:

```powershell
git switch main
git pull --ff-only origin main
```

Do not repeat the prepared commit, force-push, or run a competing manual upload.

One clean commit message:

```text
feat: add authenticated real-time room updates
```

Short GitHub summary:

> Add authenticated, room-scoped WebSocket notifications for uploads and joined
> sessions. Reconcile file lists after reconnect, queue refreshes during transfers,
> and retain manual refresh. Add origin/auth/expiry/isolation tests and a live
> bidirectional transfer/restart check.

## Learning checkpoint

Explain why WebSocket notifications do not replace HTTP uploads, why every
reconnect fetches the file list, and why a room can remain active after its socket
closes. Trace `POST file → event → socket message → GET file list` in the source.

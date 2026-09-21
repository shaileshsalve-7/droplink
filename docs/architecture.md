# Architecture decisions — Day 2

Day 2 implements room creation/joining, member authentication for status/leave,
expiry, and bounded in-memory room state. File storage, QR links, and WebSockets
below remain planned constraints. See `day-02.md` for the implemented HTTP contract.

## One repository, two applications

`frontend/` contains React and Vite. `backend/` contains Spring Boot. `docs/` contains
lessons and decisions. This keeps a day's connected frontend/backend changes in one
commit while leaving each application easy to run and understand.

## Server-mediated sharing

Files go from the sender to temporary server storage, then from the server to the
receiver. This works in either direction. A room has members, not permanent
sender/receiver roles. The sender can finish uploading before the receiver downloads.
Uploads must finish successfully before metadata is published to other members.

## Rooms and privacy

- Implemented default expiry: 30 minutes from creation, enforced by the server.
- Use a cryptographically generated eight-character room code, excluding confusing
  characters. A code grants access: anyone holding it may join.
- Codes and QR invitations need rate-limited join attempts and expiry checks.
- Successful joining should produce an unguessable member credential. Require it
  for listing files, uploads, downloads, and room WebSocket access.
- A QR code encodes a browser join link, not file content. Prefer a URL fragment for
  an invitation secret so normal HTTP request logs do not capture it.
- No public room directory. Do not log codes, invitation tokens, or file contents.
- HTTPS/WSS is required in production. The server can read the files; do not label
  this design end-to-end encrypted or anonymous.

Implemented: 30-minute fixed expiry, eight-character SecureRandom codes, distinct
256-bit member tokens, 100-room and eight-member limits, synchronized admission,
and cleanup every 30 seconds plus on access. Last-member leave removes a room.
HTTP status and leave require a bearer token; responses use `Cache-Control: no-store`.
Admission POST requests are limited to 30 per peer and 300 globally per minute,
including malformed attempts. Fixed windows can burst at boundaries. The app
ignores forwarded IP headers; all devices behind the development proxy share a
peer quota. Configure trusted proxy handling and edge abuse limits before deploy.
Frontend credentials live in tab session storage, are validated after reload, and
are cleared on expiry/leave. Same-origin scripts can read them; avoid untrusted
scripts and review CSP before production. Closed tabs can leave membership slots
until expiry. Member count is a snapshot of sessions, not online presence.
Do not expose an unauthenticated file endpoint while building later milestones.

## Temporary storage

No database for the first MVP. Keep room metadata in memory and uploaded bytes in a
dedicated temporary directory. Run one backend instance. Restart invalidates rooms;
startup cleanup must remove orphaned DropLink files without touching unrelated paths.

Proposed initial bounds: 25 MiB per file, 100 MiB per room, 20 files per room,
and 1 GiB total disk quota. The 100-active-room cap is already implemented.
Enforce file count/byte reservations against
concurrent uploads, not just separate preflight checks. Reject overload cleanly.
The file and disk bounds are design defaults, not implemented limits or tested capacity claims.

Expiry is checked on each access, not only by the cleanup job. Expired rooms stop
accepting new requests immediately. Cleanup should run at most every minute and
retry failed deletions; bytes may briefly remain on disk after access expires.
Define and test how in-flight downloads/uploads are cancelled when expiry occurs.

Use server-generated file IDs as disk names. Preserve the original name only as
sanitized display/download metadata. Never use a user-provided path. Stream files
instead of reading entire uploads into Java memory. Discard partial uploads on
failure. Downloads use attachment disposition and `nosniff`; do not execute or render
uploaded HTML, code, or archive contents on the server.

## Real-time events

WebSockets notify members of file availability, joins, and expiry. They do not carry
file bytes. Authenticate membership before accepting or subscribing a socket, check
allowed origins, scope events to the room, and close sockets when access expires.
After reconnecting, fetch the authoritative file list over HTTP to recover missed
events. Browser backgrounding and Wi-Fi changes can break sockets.

## Development and deployment

Implemented: Vite serves port 5173 and proxies `/api` to loopback port 8080. The
backend binds to loopback by default. No permissive CORS configuration is needed.

For a phone test, bind Vite to the LAN and open the laptop's LAN IP. `localhost`
on a phone means the phone, not the laptop. Vite can still forward requests locally.

On Day 8 choose hosting with a Java process, WebSocket support, and writable
temporary storage. A static frontend host alone cannot run Spring Boot. Prefer
serving UI and API under one HTTPS origin. Keep the first backend at one instance;
multiple instances would need shared room state/storage and event distribution.

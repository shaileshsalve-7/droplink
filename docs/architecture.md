# Architecture decisions — Day 7

Day 2 implements room creation/joining, member authentication for status/leave,
expiry, and bounded in-memory room state. Day 3 adds client-generated QR codes
and fragment-based join links with explicit admission. Day 4 implements authenticated
uploads, file listing, attachment downloads, quotas, and disk cleanup. Day 5 adds authenticated WebSocket notifications and reconnect recovery. Days 6–7
improve feedback, validation, and multipart request boundaries. See `day-02.md` for the implemented HTTP contract.

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

## Implemented invitations (Day 3)

Links use the current page's HTTP(S) address plus `#join=CODE`; member tokens never
appear in the payload. React consumes the fragment and clears it from the current
history entry. Users explicitly join using the same backend admission endpoint.
Existing membership is preserved when another invitation opens. Loopback/wildcard
addresses do not offer QR/link sharing; local phone testing uses the laptop's LAN
address. QR generation runs locally as SVG with a four-module quiet zone. No
external QR service receives the code. Fragments remain visible to browser scripts
and copied links, so this is log minimization, not encryption.

## Temporary storage

No database for the first MVP. Keep room metadata in memory and uploaded bytes in a
dedicated temporary directory. Run one backend instance. Restart invalidates rooms;
startup cleanup must remove orphaned DropLink files without touching unrelated paths.

Implemented bounds: 10 MiB per file, 50 MiB per room, 20 files per room,
and 250 MiB total stored blobs. These replace the earlier proposed larger defaults
to keep this MVP small. The room cap remains 100. Multipart parsing allows a 10 MiB
file and 11 MiB request. Four upload requests can parse concurrently; the storage
service serializes disk copies and quota checks with its own lock. It never puts
file I/O inside RoomService's lock. This deliberately favors readability and bounded
resource use over maximum throughput. POSTs also share existing admission throttling.

The file filter rejects multipart bodies on every route/method except POST to
`/api/rooms/{roomId}/files`, then validates membership before multipart parsing.
This includes unknown paths and trailing-slash variants, so they cannot bypass
the upload parsing budget. The service checks
again before copying and after copying, so expiry/leave during upload discards the
partial result. List/download check current membership, and room/file association
is required for downloads. A file ID alone grants no access.

Expired rooms stop accepting requests immediately. File cleanup runs every 30 seconds;
failed deletions stay eligible for retry and still count toward disk quota. Last-member
leave also makes stored files eligible. Started downloads may finish after expiry;
open streams are closed by Spring. On systems that cannot delete an open file,
cleanup retries after it closes.

A dedicated directory contains UUID-named `.blob` files and a process lock.
The original filename is only sanitized display/download metadata. Completed metadata
is in memory. Uploads stream through a 16 KiB buffer. Downloads stream from disk as
`application/octet-stream`, with attachment disposition and `nosniff`. No previews,
execution, ZIP extraction, type conversion, or extension allowlist is needed.
Duplicate names get distinct IDs. Browser downloads use a blob URL and release it;
the browser holds at most the selected file (up to 10 MiB) in memory per UI request.

Startup and normal shutdown delete only generated blob filenames, without recursive
folder removal. The process lock prevents another instance using the same directory.
After a crash, old app-owned blobs are removed on restart. This does not claim secure
erasure or instant cleanup during process downtime. Multipart container spool files
are separate from the stored-blob quota; abrupt termination may leave OS temp files.
Use one backend and one app-owned directory, with sufficient disk headroom.

## Real-time events (implemented Day 5)

`/api/live` upgrades to a WebSocket with Spring's same-origin default. Vite proxies
this path with WebSocket support and preserves Host/Origin. An HTTP(S) page chooses
WS(S) accordingly. No tokens or codes are embedded in the socket URL.

The browser sends one JSON authentication frame with room ID and member token.
Until validated, no room data is sent. Authentication has a five-second deadline.
A session may use two sockets for brief reconnect overlap; the server caps all
sockets at 128 and incoming frames at 1 KiB. Handshakes share admission throttling.

After a successful upload, the controller publishes a room-only invalidation event,
after the storage lock is released. The socket handler marks only that room's
clients dirty; repeated notifications collapse into one flag. A 500 ms scheduler
queues at most one job per socket. Four send workers and a bounded queue isolate
network writes from HTTP uploads and room/file cleanup. A concurrent-session wrapper
serializes sends and bounds its buffer; this is not a load-tested latency guarantee.

Before private updates, the server rechecks membership and expiry. It sends `ready`
on authentication, `files_changed` after an upload, `room_changed` when the joined
session count differs, and `ping` every 15 seconds. Missing `pong` for 45 seconds
closes the connection. Revoked/expired membership closes with application code 4404.
Socket disconnection does not delete room membership or its files.

The frontend fetches the HTTP file list after `ready` and every invalidation. A
notification during another request queues one deferred refresh, including during
an upload/download or an older list response. HTTP data is authoritative. Reconnects
use exponential delay with jitter capped at about 30 seconds. A ready/auth deadline
and heartbeat watchdog detect stalled connections. Returning to the page or coming
online reconnects and reconciles missed changes. Terminal access failures clear the
saved membership. Manual refresh remains available when sockets are unavailable.
No WebSocket upload, automatic retry of a file POST, or online-device count is claimed.

## Development and deployment

Implemented: Vite serves port 5173 and proxies `/api` to loopback port 8080. The
backend binds to loopback by default. No permissive CORS configuration is needed.

For a phone test, bind Vite to the LAN and open the laptop's LAN IP. `localhost`
on a phone means the phone, not the laptop. Vite can still forward requests locally.

On Day 8 choose hosting with a Java process, WebSocket support, and writable
temporary storage. A static frontend host alone cannot run Spring Boot. Prefer
serving UI and API under one HTTPS origin. Keep the first backend at one instance;
multiple instances would need shared room state/storage and event distribution.

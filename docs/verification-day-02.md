# Day 2 verification

Milestone: September 22, 2026. Work began after explicit `go day 2` authorization.
Executed in the development workspace with Node 24.19.0 and OpenJDK 17.0.20.

## Passed

| Check | Result |
| --- | --- |
| Maven `package` | 13 tests passed; executable JAR built |
| Node API tests | 8 passed (health and rooms) |
| Vitest + jsdom React tests | 10 passed |
| Vite production build | Successful |
| Real frontend client through Vite → Spring | Create, join, status, and leave passed |
| Separate member credentials | Same room ID, different tokens; anonymous status denied |
| Four-second live expiry | Member access and new joins denied after expiry |
| Backend outage/restart | Network failure reported; old membership invalid after restart |
| Admission filter | Malformed bodies counted; attempt 31 returned 429 and Retry-After |
| Spoofed forwarding headers | Did not bypass the peer budget |
| Git whitespace and npm lockfile sources | Clean; standard registry.npmjs.org URLs |

Expiry boundary and concurrent capacity tests use controlled time and parallel
calls. The live smoke script uses real servers and no mocked HTTP responses. Its
source is `scripts/smoke-day2.mjs`; run it after backend packaging and `npm ci`.

## Debugging and limits

Offline Maven initially could not resolve dependencies in this workspace. Running
with temporary proxy settings resolved them and the complete package build passed.
The proxy settings stay outside the repository; no TLS verification was disabled.

A saved room is labelled unverified while restoring or after a status-check network
failure. A failed leave retains its membership so the user can retry.

Rendered desktop/mobile layout, clipboard behavior in a real browser, physical
phone use, Windows/IntelliJ execution, and actual keyboard navigation are not
verified here. Day 1's cloud browser blocked localhost; jsdom component tests are
not a browser or visual test. Use the Day 2 manual checklist before relying on UX.

Rooms, credentials, and rate limits exist only in this single backend process.
Restart clears them. Limits use fixed windows and share the reverse proxy's peer
budget. Production proxy trust, edge abuse controls, HTTPS, and deployment security
remain deployment gates. A tab that disappears without leaving keeps its membership
until expiry; the displayed count deliberately does not claim online presence.

QR links, uploads, disk cleanup, and WebSocket sharing are not implemented or tested
in this checkpoint. The scheduled cleanup only removes in-memory room metadata.

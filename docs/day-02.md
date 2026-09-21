# September 22 — temporary rooms, create and join

This is the Day 2 milestone, started with the user's `go day 2` instruction.
Stop after this lesson. Day 3 (QR and join links) requires `next day`.

## 1. What we are building, and why

A room is a short-lived group of browser sessions. Creating it produces an
invitation code. Joining with that code gives each session its own secret member
token. The code admits a device; the token proves that device has joined when it
asks for room status or leaves. A room ID alone does not grant access.

This separates the easy-to-type invitation from a strong access credential. Anyone
with the code can join: private means access-controlled, not end-to-end encrypted.
No account, database, file transfer, QR generation, or WebSocket endpoint is added
today. Those remain later milestones.

Default lifetime is 30 minutes from creation. Joining and refreshing status never
extend it. The server is authoritative: changing a browser's clock cannot keep a
room alive. The UI uses server timestamps to display an approximate countdown.

## 2. Backend: read in this order

| File in `backend/src/main/java/com/droplink/room/` | What and why |
| --- | --- |
| `RoomConfiguration.java` | Creates the service and injects a UTC clock. Tests can replace time without sleeping. Enables Spring scheduling. |
| `RoomService.java` | Owns rooms, generates codes/tokens, enforces expiry and limits, and revokes membership. |
| `RoomController.java` | Converts HTTP requests to service calls; reads bearer tokens from headers. |
| `RoomException.java`, `RoomErrors.java` | Return deliberate error codes and safe messages rather than stack traces. |
| `AdmissionLimiter.java`, `RoomRequestFilter.java` | Throttle attempts before parsing the body and prevent caching room responses. |

`HashMap` holds at most 100 active rooms by default. Each room has at most eight
members, including its creator. All state mutations share the service's monitor
(`synchronized`): checking the count and adding a member happen together. Otherwise,
two simultaneous requests could both see the last free slot and exceed the limit.
Future file I/O must stay outside this lock.

Codes use `SecureRandom` and eight characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
The generator checks for an existing code before admitting a room. Each member
token contains 32 random bytes encoded as URL-safe Base64 (43 characters).

Expiry is checked on every room access. A scheduled task also removes expired
metadata every 30 seconds. A scheduled cleanup delay cannot extend access.
Spring's annotations are described in the [official scheduling reference](https://docs.spring.io/spring-framework/reference/integration/scheduling.html).

## 3. HTTP contract

| Method and path | Input | Result |
| --- | --- | --- |
| `POST /api/rooms` | No body | `201` with `{ room, memberToken }` |
| `POST /api/rooms/join` | JSON `{ "code": "ABCD2345" }` | `200` with `{ room, memberToken }` |
| `GET /api/rooms/{id}` | `Authorization: Bearer <memberToken>` | `200` with room details |
| `DELETE /api/rooms/{id}/members/me` | Same bearer header | `204`; caller's membership revoked |

The example code is illustrative; use the code returned by a real create request.
Room details contain `id`, `code`, `expiresAt`, `serverTime`, `memberCount`, and
`maxMembers`. Status never contains another member's token. There is no public room
listing: `GET /api/rooms` returns `405`.

| Error | Meaning and fix |
| --- | --- |
| `400 INVALID_CODE` / `INVALID_REQUEST` | Fix the input or JSON. Lowercase and display spaces/hyphens are accepted. |
| `404 ROOM_UNAVAILABLE` | Missing, expired, or inaccessible room. Check the code or create a new room. These cases deliberately share a response. |
| `409 ROOM_FULL` | Eight membership sessions already exist. Leave from another session or create another room. |
| `429 RATE_LIMITED` | Wait a minute. The response includes `Retry-After: 60`. |
| `503 ROOM_CAPACITY` | The active room cap is reached. Wait for expiry or for the last member of another room to leave. |

Admission uses a fixed one-minute window: 30 POST attempts per network peer and
300 globally. Failed/malformed attempts count too. The global cap bounds limiter
memory. The application does not trust `X-Forwarded-For`; Vite therefore shares a
peer quota across devices. Fixed windows can allow bursts around boundaries.
This is basic MVP throttling, not complete protection from distributed attacks.
Production proxy trust and edge limits must be configured before deployment.

## 4. Frontend: from a click to Java and back

`RoomWorkspace.jsx` owns the forms and room screen. `api/rooms.js` sends requests,
validates response shapes, and maps errors to messages. `roomSession.js` stores the
current membership in this tab's `sessionStorage` so refreshing can restore it.
`App.jsx` keeps the Day 1 health check under **Check server connection**.

Trace this path in the source:

1. Click **Create room** → `perform('create')` disables admission buttons.
2. `createRoom()` sends a relative POST to `/api/rooms`.
3. Vite proxies it to Spring → filter → controller → service.
4. The service returns the new room and member credential.
5. React stores the membership and displays the code and countdown.
6. A second device submits the code and gets a different token for the same room.
7. **Refresh status** asks the server for the latest membership count.

The count is **joined sessions**, not people or devices currently online. Closing a
tab does not reliably notify the server. Its membership may remain until room
expiry. Explicitly leaving releases a slot; the last member leaving removes the
room. A duplicated tab may inherit the same session credential, so use a separate
browser/incognito window for a genuinely separate member test.

Reloading checks the saved credential with the server. Invalid/expired access is
cleared. A temporary network failure preserves the credential for retry. A failed
leave request also preserves it: showing a successful leave would be misleading.
Storage errors do not break the app, but a reload may then require another join.

`sessionStorage` is readable by same-origin JavaScript; it is not a secure vault.
Tokens are never put in URLs or deliberately logged. Production needs HTTPS, a
review of script security/CSP, and the deployment protections in the architecture.

Requests time out after ten seconds and are not automatically retried. A lost POST
response may already have created a room/member; expiry bounds that orphaned state.
If copy is blocked on a local HTTP/LAN origin, select and copy the displayed code.

## 5. Run on Windows

From your GitHub clone (commit or preserve your own edits before pulling):

```powershell
git pull --ff-only origin main
cd backend
.\mvnw.cmd spring-boot:run
```

In a second terminal from the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. To use your phone on the same trusted Wi-Fi, replace
the frontend start command with `npm run dev -- --host 0.0.0.0`, then open
`http://YOUR-LAPTOP-IP:5173` on the phone. Use `ipconfig` to find that IP.
Keep Spring Boot bound to loopback; Vite forwards the API calls. See Day 1 for
private-network firewall guidance. macOS/Linux use `./mvnw` instead of `mvnw.cmd`.

## 6. Test before moving on

Backend, inside `backend`:

```powershell
.\mvnw.cmd package
```

Frontend, inside `frontend`:

```powershell
npm test
npm run build
```

From the repository root, after packaging and installing dependencies:

```powershell
node scripts/smoke-day2.mjs
```

The smoke script launches and stops its own servers on ports 18080 and 15173. It
uses a four-second room lifetime to exercise expiry, then restarts the backend and
checks throttling. It uses the real frontend API functions through the Vite proxy.
Set `SMOKE_BACKEND_PORT` and `SMOKE_FRONTEND_PORT` if those ports are occupied.

Backend tests cover room isolation, exact expiry, last-member deletion, validation,
quota reset, concurrent capacity checks, and real HTTP responses. Frontend tests
cover API contracts and React interactions using Vitest/Testing Library with jsdom.
jsdom has no real browser rendering, so those tests do not establish visual quality.
See the [Vitest guide](https://vitest.dev/guide/) and
[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

Manual checklist (still required):

1. Create on the laptop, join on the phone or a separate browser.
2. Press **Refresh status** on each; both should show `2 / 8`.
3. Reload one page; it should restore the same membership without adding a member.
4. Leave from one session; refresh the other and expect `1 / 8`.
5. Try a wrong and malformed code; confirm useful errors and keyboard access.
6. Stop the backend; try joining or refreshing. Restart it and confirm the old room is unavailable.
7. Check 390px and desktop layouts, Tab/Enter navigation, and clipboard fallback.
8. For fast manual expiry, stop the backend, set `$env:ROOM_TTL="PT10S"`, restart,
   create a room and wait. After testing, stop it and run
   `Remove-Item Env:ROOM_TTL` before restarting with the default lifetime.

## 7. Debug with intent

Set a Java breakpoint in `RoomService.join()`. Inspect the normalized code, matching
room, expiry, and membership count. Avoid copying real tokens into screenshots.
A long breakpoint pause will cause the frontend's request timeout; that is expected.

In browser DevTools → Network, check the method/status/body. Room status must send
an `Authorization` header. If it doesn't, inspect saved session state and the API
client. Do not share the header's value. Check server logs for startup errors rather
than exposing stack traces in HTTP responses.

If many tests/manual attempts produce `429`, wait a minute. If a phone gets no UI,
check LAN access first; if the UI loads but requests fail, inspect the Vite proxy
and Spring process. A successful Day 1 health check does not prove room membership.

## 8. Git commands, commit, and GitHub summary

After the checks pass, from the repository root:

```powershell
git status
git diff --check
git add .
git diff --cached --stat
git commit -m "feat: add temporary rooms with code-based joining and expiry"
git push origin main
```

These document the day's workflow. If the checkpoint is already on GitHub, pull it
instead of creating a duplicate commit. Never force-push to resolve a rejection.

**Commit message:** `feat: add temporary rooms with code-based joining and expiry`

**GitHub summary:** Added temporary rooms with create/join by code, separate member
credentials, expiry, limits, and leave support. Connected the React room workflow
and added backend, component, and live proxy tests plus a Day 2 lesson.

## 9. What to learn before Day 3

Explain in your own words: why a room code and member token serve different roles;
why checking expiry only in cleanup is insufficient; why a count check plus an
insert needs synchronization; and why session count is not online presence.

The source is AI-assisted. Trace and change it yourself before claiming independent
mastery. Day 3 remains paused until you ask to continue.

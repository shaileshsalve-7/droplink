# Day 7 — testing and cleanup

Prepared ahead of the September 27 publication slot at the user's request.
The goal is to verify the MVP and repair observed defects before deployment.

## What and why

Tests need to check failure paths as well as successful sharing. A transfer can
finish on the server while its response is lost. A response can be valid JSON
without containing an event or error object. Upload limits also need to apply
before the framework consumes multipart bodies.

| Part | What it does | Why it matters |
| --- | --- | --- |
| Multipart route guard | Rejects multipart on unsupported routes/methods with 415 | Keeps parsing behind member authentication and the upload slot limit |
| Upload response handling | Retains the refresh-before-retry warning after broken JSON | Avoids encouraging duplicate uploads after a lost response |
| API error validation | Uses known own properties of a fixed error map | Null, unknown, or inherited names cannot produce raw JavaScript errors |
| WebSocket event validation | Checks object shape and event type before reading fields | Malformed events close the connection and use normal reconnect recovery |
| Regression tests | Reproduce each failure and assert the corrected behavior | Prevents these bugs from returning unnoticed |

Before changing the code, the new tests reproduced a missing upload warning,
a TypeError from a null file error, and a TypeError from a null socket event.
The HTTP test also showed multipart POST to `/api/rooms` returned 201 and created
a room. It should have been rejected before parsing because this is not the
file-upload endpoint. The verification record distinguishes these observations
from the additional malformed-input cases covered after the fix.

## Read the changes in order

1. `backend/src/main/java/com/droplink/room/RoomRequestFilter.java`: multipart route
   and method gate, before the existing file membership check and semaphore.
2. `backend/src/test/java/com/droplink/room/FileEndpointTest.java`: real HTTP tests
   for supported uploads and unsupported multipart requests.
3. `frontend/src/api/files.js`: safe error-code lookup and upload response warning.
4. `frontend/src/api/rooms.js`: the same bounded error-code handling for rooms.
5. `frontend/src/api/live.js`: validate an event before using its fields.
6. The neighboring `*.test.js` files: four new frontend API/socket regressions.

The backend guard checks the decoded servlet path used by MVC. Only POST to the
exact file collection route can proceed with a multipart body. That route still
checks membership before parsing and uses the existing four-upload semaphore.
Multipart on a room action, file-download path, trailing-slash path, unknown URL,
or a non-POST method returns a fixed JSON error. This does not make an invalid
token valid or enlarge any quota.

`Object.hasOwn(messages, code)` accepts only a message explicitly defined in the
map. A property such as `toString` is inherited by a normal JavaScript object;
it must not be mistaken for an API error message. The UI never displays arbitrary
server-provided messages. Unknown errors use a fixed fallback.

For upload JSON, the same uncertainty applies before and after response headers.
The server may have stored the bytes even if parsing the 201 response fails.
The client tells the user to refresh and check, and sends the POST only once.

Small cleanup: removed an obsolete “future WebSocket” comment and ignored JVM
attach probe files left by local test tooling. No dependency or UI redesign was
needed. Existing storage, socket bounds, and queued-refresh code were retained.

## Run the app

From the repository root in PowerShell terminal 1:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

From the repository root in terminal 2:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Use a separate browser session to create/join and
transfer harmless files. For phone access, use the LAN instructions in Day 3.
On macOS/Linux replace `.\mvnw.cmd` with `./mvnw`.

## Full checks

From the repository root:

```powershell
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
.\backend\mvnw.cmd -B -f backend/pom.xml clean package
node scripts/smoke-day4.mjs
node scripts/smoke-day5.mjs
git diff --check
```

Run the smoke scripts sequentially: they use the same isolated default ports,
start real servers, and stop them afterward. They refuse to reuse another server.
If needed, select free ports through `SMOKE_BACKEND_PORT` and `SMOKE_FRONTEND_PORT`.
The scripts use temporary test directories and harmless byte fixtures.

Day 4's script checks bidirectional exact-byte downloads for six extensions,
room isolation, expiry, scheduled disk cleanup, and crash/restart orphan cleanup.
Day 5's script checks actual frontend modules through Vite and Spring, automatic
list updates, reconnect reconciliation, leave revocation, expiry, and restart.
These are HTTP/socket checks, not physical-phone or rendered-browser tests.

For focused debugging:

```powershell
node --test frontend/src/api/files.test.js frontend/src/api/rooms.test.js frontend/src/api/live.test.js
.\backend\mvnw.cmd -B -f backend/pom.xml "-Dtest=FileEndpointTest" test
```

Read the first assertion failure and the request involved before changing code.
A test expecting 415 but receiving 201 points to route admission, not storage.
For interrupted-upload feedback, break inside `json` and inspect whether the
failure happened after a successful HTTP status. Never automatically replay the
POST while debugging.

## Clean-checkout setup

The verification uses an isolated clone of the prepared source plus the exact
uncommitted Day 7 patch, with no copied `node_modules`, `target`, or local `.env`.
Install dependencies, compile, run tests, and start real servers there. A fresh
source checkout can reuse machine-level download caches; that does not mean it
is a brand-new operating system. Linux execution does not certify Windows setup.

After Day 7 is published, a user can reproduce it with:

```powershell
git clone https://github.com/shaileshsalve-7/droplink.git droplink-check
cd droplink-check
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
.\backend\mvnw.cmd -B -f backend/pom.xml package
node scripts/smoke-day4.mjs
node scripts/smoke-day5.mjs
```

If the wrapper cannot find Java, check `JAVA_HOME`. If dependencies cannot be
downloaded, check the network/proxy configuration. If packaging reports a damaged
generated archive, use `clean package`. Do not commit machine-specific settings,
credentials, generated bundles, uploaded files, or logs to fix local setup.

## Remaining checks before calling it deployed

Real phone/laptop appearance, native file dialogs, camera scanning, keyboard
navigation, screen-reader behavior, and production HTTPS/WSS still need direct
verification. Earlier cloud browser navigation was blocked; no substitute
screenshot or physical-device success is claimed. High-volume/load testing is
also outside this small MVP's test evidence. Day 8 must verify its actual host,
single-instance temporary disk, room/transfer flow, and reconnect behavior.

## Git commands and one clean commit

The implementation is already prepared in the working project. To reproduce it
yourself after Day 6 is on main, use a clean clone:

```powershell
git pull --ff-only origin main
git switch -c work/day-07
# Apply the Day 7 changes, run the checks, and inspect the diff.
git diff --check
git status --short
git add .gitignore AGENTS.md README.md backend/pom.xml backend/src/main/java/com/droplink/room/RoomRequestFilter.java backend/src/test/java/com/droplink/room/FileEndpointTest.java frontend/src/api/files.js frontend/src/api/files.test.js frontend/src/api/rooms.js frontend/src/api/rooms.test.js frontend/src/api/live.js frontend/src/api/live.test.js docs/architecture.md docs/remaining-work.md docs/day-07.md docs/verification-day-07.md
git commit -m "test: harden file sharing and clean up the MVP"
```

Do not repeat the commit if it is already present. The existing daily task publishes
the saved checkpoint September 27 after Day 6, under the one-publication-per-India-day
rule. After confirmed publication, update a clean user clone with
`git pull --ff-only origin main`. A scheduled upload is not a completed upload.

**GitHub summary:** Close the unsupported multipart parsing path, preserve safe
upload recovery after broken responses, and validate API errors and socket events.
Add focused regressions, verify installation and the complete live sharing flows,
and document actual checks and remaining browser/deployment limitations.

This run stops after Day 7. Day 8 is deployment, final README, and genuine screenshots.

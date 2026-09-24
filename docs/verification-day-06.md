# Day 6 verification

Executed September 23, 2026 UTC, ahead of the September 26 India-time publication
slot. Source checkpoint: Day 6 UX polish on top of the prepared Day 5 implementation.

## Checks actually performed

| Check | Result |
| --- | --- |
| Frontend Node tests | 26 passed, zero failures |
| React/jsdom tests | 38 passed, zero failures; six new UX regressions |
| Backend Java tests | 36 passed, zero failures/errors/skips |
| Frontend production build | Passed |
| Backend clean package | Passed after regenerating incomplete build output |
| Live client/Vite/Spring HTTP and WebSocket flow | Passed |
| Changed-file whitespace check | Passed |

**100 automated tests passed.** Java tests ran during packaging; they are not
counted twice when the clean build repeated them. No new dependency was introduced.

The six added tests cover selection during a background refresh, preservation of
picker focus, focus after clearing a selection, persistent linked validation,
persistent uncertain-upload feedback, initial list failure/recovery, and controls
remaining disabled during an upload (related assertions share test cases).

The live `scripts/smoke-day5.mjs` run passed all four stages:

1. Authenticate through Vite, update lists automatically, download exact bytes in
   both directions, and keep another room isolated.
2. Reconnect and reconcile missed uploads; leaving revokes the socket and updates
   the joined-session count.
3. Expiry closes the authenticated socket and rejects further HTTP access.
4. Server restart triggers reconnect, then rejects the old membership.

This smoke test uses the actual frontend API/socket modules and real servers. It
does not render React or simulate a physical phone. Existing Day 4 quota/storage
coverage was rerun in the backend suite; its separate live cleanup smoke script
was not rerun for these UI-only changes and remains part of Day 7's broader pass.

## Build debugging performed

The first offline Maven attempt could not resolve a parent POM from the incomplete
local cache. Retried online with the workspace's existing proxy configuration in a
temporary settings file; no proxy settings or credentials were added to the repo.
All 36 Java tests passed, but repackaging found an incomplete generated JAR
(`zip END header not found`). Maven `clean package` regenerated the output and
passed all 36 tests and packaging. The live smoke script then started that fresh
JAR successfully in the same execution. Application source did not need a backend
change to resolve this local build-output issue.

## Browser/device limitation

Vite started successfully at `http://127.0.0.1:15174/`. The documented cloud browser
refused to open that address with `net::ERR_BLOCKED_BY_CLIENT`. No attempt was made
to bypass that restriction. Consequently, no visual screenshots, narrow-phone or
laptop visual pass, native file-dialog check, physical QR scan, actual Tab/Space
navigation, or screen-reader review is claimed.

DOM tests verify focus and state behavior in jsdom, not browser rendering or
assistive-technology output. CSS was reviewed for wrapping, flexible controls,
visible focus, and existing responsive breakpoints. Actual 320px/1366px layout,
200% zoom, keyboard and screen-reader checks remain pending and should be run in
an available local browser as described in the Day 6 lesson.

## Reproduce

From the repository root on macOS/Linux:

```bash
npm --prefix frontend test
npm --prefix frontend run build
./backend/mvnw -B -f backend/pom.xml clean package
node scripts/smoke-day5.mjs
git diff --check
```

On Windows use `.\backend\mvnw.cmd` for the Maven command. The first run requires
internet for dependencies; use the network configuration appropriate to your own
machine. Do not commit generated files, logs, or downloaded dependencies.

## Publication status

Prepared locally; not uploaded by this implementation run. Day 3 already occupied
September 23's publication. Day 4 is queued September 24, Day 5 September 25, and
this Day 6 checkpoint September 26, all in Asia/Kolkata. The existing task must
verify the actual Day 5 parent/tree, publish one complete commit without force,
and verify remote main before reporting success. Scheduling is not confirmation.

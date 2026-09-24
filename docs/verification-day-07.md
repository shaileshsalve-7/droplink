# Day 7 verification

Executed September 23, 2026 UTC, ahead of the September 27 publication slot.
This records checks actually run against the Day 7 source, not future deployment.

## Reproduced before fixing

| Case | Observed failure | Correction |
| --- | --- | --- |
| Truncated JSON with successful upload status | Generic response error lost the refresh-before-retry warning | Preserve the uncertainty warning for response-body parsing too |
| Null file API error body | TypeError when reading `code` | Validate the code against own entries in the fixed message map |
| Null WebSocket event | TypeError when reading `type` | Check object shape and supported event type before use |
| Multipart POST to the room-creation URL | Returned 201 instead of the expected 415 | Reject unsupported multipart routes/methods before parsing |

Those new regression tests failed before the corresponding fixes. Additional
cases now cover arrays/primitives/unknown socket events and null/unknown/inherited
API error names, including room API errors. The inherited-name cases were added
after inspecting the same error-map pattern; they are not claimed as separate
pre-fix test runs. No automatic upload retry was added.

## Completed verification

| Check | Result |
| --- | --- |
| Clean frontend install (`npm ci`) | Passed, 99 packages installed from lockfile |
| Node API/socket/QR tests | 30 passed |
| React/jsdom tests | 38 passed |
| Java tests | 37 passed; zero failures/errors/skips |
| Frontend production build | Passed |
| Backend packaging from an empty target directory | Passed |
| Live Day 4 transfer/storage smoke script | Passed all three stages |
| Live Day 5 real-time smoke script | Passed all four stages |
| Source equivalence and whitespace check | Passed |

**105 tests passed**, including five new test cases: four Node cases and one
real-HTTP Java case with several unsupported-route assertions. Repeated runs are
not counted as additional tests.

The final run used an isolated local Git clone at the Day 6 parent plus the exact
tracked Day 7 patch. It started without `node_modules`, `backend/target`, or `.env`.
The six steps were install, frontend tests, frontend build, backend package/tests,
Day 4 smoke, then Day 5 smoke. Every command exited zero. The backend and smoke
scripts ran sequentially in the same execution so the freshly packaged artifact
was the one started by both smoke scripts.

All 60 tracked frontend/backend/script files were compared with the working
project after verification. Application source matched byte for byte. The Windows
Maven wrapper differed only in CRLF/LF normalization explicitly configured by
`.gitattributes`. Windows itself was not available for execution. Machine-level
download caches and an existing JDK/Node were available; this was a clean source
checkout check, not a bare-machine installation test.

An earlier execution lost its temporary logs/process handle while work resumed.
Its unfinished live checks were not counted as passes. The complete clean-checkout
run above supplied the final evidence. Temporary Maven proxy settings stayed
outside source control. No dependency version was changed.

## Live results and review coverage

Day 4 smoke verified both directions using the actual frontend API through Vite
and Spring, six file extensions, exact-byte downloads, room isolation, revoked
access, immediate access expiry, actual scheduled disk deletion, crash/restart
orphan cleanup, and rejection of old membership after restart.

Day 5 smoke verified authenticated notifications through Vite, automatic list
updates and exact downloads in both directions, isolation from another room,
reconciliation after missed uploads, leave revocation and session count updates,
expiry closure plus HTTP rejection, and reconnect/stale-membership rejection after
server restart.

The backend suite also covers file/count/room/global quotas, concurrent count
limits, failed copies, expiry during copying, misleading sizes, sanitized names,
storage ownership/locking, room admission and capacity, socket origin/auth limits,
heartbeats, and expiry. The frontend suite covers queued refreshes while busy,
selection/focus/error preservation, stale socket callbacks, response validation,
reconnect watchdogs, and explicit invitation joining.

The new multipart test makes requests to room creation/join, trailing-slash and
file-download paths, health, and an unknown path. It also sends malformed multipart
to a GET file-list request. All return a safe 415 instead of proceeding to parsing.
Existing real upload tests still pass. This is focused regression evidence, not
a load test or a comprehensive security audit.

## Not verified

The cloud browser refused local app navigation during Day 6 with
`ERR_BLOCKED_BY_CLIENT`. No new browser pass or bypass is claimed in Day 7.
Real narrow-phone/laptop rendering, 200% zoom, physical camera scanning, native
downloads, actual keyboard navigation, and assistive-technology behavior remain
pending. jsdom tests are not evidence of those checks.

Production HTTPS/WSS, hosting resource limits, host temporary-disk behavior, and
public deployment are Day 8 work. No service was deployed in this run. One backend
instance is still required; the app is not end-to-end encrypted or a backup store.

## Reproduce

From the repository root on macOS/Linux:

```bash
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
./backend/mvnw -B -f backend/pom.xml clean package
node scripts/smoke-day4.mjs
node scripts/smoke-day5.mjs
git diff --check
```

Use `.\backend\mvnw.cmd` for Maven on Windows. See `day-07.md` for run instructions,
focused tests, debugging, and Git commands. Do not publish build output or logs.

## Publication

This checkpoint is prepared locally for September 27, Asia/Kolkata, after Day 6.
The existing task must verify the actual remote parent/tree and perform a single
non-forced main update, then verify the result before claiming an upload. If a
predecessor is missing or the remote diverges, preserve user work and report the
dependency. No GitHub upload is claimed by this implementation run.

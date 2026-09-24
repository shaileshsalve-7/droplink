# Day 8 preparation verification

Executed September 24, 2026 UTC, ahead of the September 28 release slot.
**Production preparation is tested locally; the full deployment milestone is not complete.**

## Checks actually completed

| Check | Result |
| --- | --- |
| Frontend Node tests | 30 passed |
| React/jsdom tests | 38 passed |
| Java tests | 40 passed; no failures, errors, or skips |
| Frontend production build | Passed |
| Maven production-profile clean package | Passed; React assets included in executable JAR |
| Production JAR live smoke | Passed all five stages |
| Vite development live smoke | Passed all four stages |
| Whitespace check | Passed |
| Render workspace/services read | Succeeded; no existing DropLink service |

**108 automated tests**, plus two live smoke workflows. The three new Java tests
cover the configured external HTTPS WebSocket origin, rejection of an unrelated
origin with forged forwarded headers, and rejection of unsafe origin settings.
An HTTP connection to local Spring Boot with a public HTTPS Origin simulates the
TLS-termination boundary; it is not a real hosted TLS test.

Production smoke served `/`, referenced JS/CSS, verified no-store asset headers
and a real API 404, then tested authenticated notifications, exact file downloads
both directions, isolation from another room, missed-event reconciliation,
leaving/revocation, expiry, server loss/reconnect, and rejection of old membership
after restart. It used the same packaged JAR and did not start Vite. The original
Vite workflow was then run separately and passed after the shared script change.
The Day 4 long disk-cleanup smoke was not rerun; Day 7 records its earlier pass.

The frontend used installed dependencies. Maven initially lacked usable cached
dependencies; a temporary workspace proxy configuration restored downloads. A
subsequent explicit offline clean package completed successfully with all 40
Java tests. That temporary proxy file is outside the repository. Existing
RoomSocketHandler deprecation/compiler warnings remain non-fatal; no dependency
versions were changed. These are not bare-machine or Windows execution results.

## Pending release gates

- Docker engine is absent here: the multi-stage image, non-root filesystem
  permissions, container memory behavior, and image pulls were not executed.
- Render CLI is absent. Blueprint fields were reviewed against current official
  docs and YAML syntax checked; Render's server-side validation is still pending.
- The cloud browser navigation to the running local app returned
  `net::ERR_BLOCKED_BY_CLIENT`. No screenshots, visual/keyboard review, physical
  phone camera checks, or native download-dialog checks are claimed.
- No Render service was created and no public HTTPS/WSS URL exists yet. Host
  health checks, resource limits, cold starts, transfer/reconnect behavior and
  assigned origin must be verified after the scheduled release.
- Free-plan workspace hours/overages need review before applying hosting; existing
  unrelated services were left untouched. No hosting charges were authorized.

## Reproduce

From the repository root, with Java and Node installed:

```bash
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
./backend/mvnw -B -f backend/pom.xml -Pproduction clean package
node scripts/smoke-production.mjs
node scripts/smoke-day5.mjs
git diff --check
```

Use `.\backend\mvnw.cmd` on Windows. The environment's installed Maven distribution
was used for the final offline verification, with the same POM and production
profile. See `deployment.md` for public-origin settings, Docker commands, Render
configuration, limitations, debug steps, and genuine screenshot requirements.

## Publication status

Prepared on `work/day-08` with no GitHub mutation. The public predecessor chain
must reach Day 7 before the September 28 slot can publish this checkpoint. Keep
one non-forced implementation update per India calendar day. Preserve unrelated
work if the remote tree diverges. Publication is separate from successful hosting;
report each result accurately, and do not manufacture a live URL or screenshot.

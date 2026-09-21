# Day 1 verification

Milestone: September 21, 2026. Executed in the development workspace on September
20 UTC (September 21 in India), using Node 24.19.0 and OpenJDK 17.0.20.

## Passed

| Check | Result |
| --- | --- |
| Frontend `npm test` | 4 tests passed, 0 failures |
| Frontend `npm run build` | Vite production bundle built successfully |
| Backend Maven `package` | Compilation, tests, and executable JAR packaging passed |
| Spring Boot integration tests | 2 passed, 0 failures, 0 skipped |
| Running JAR: direct `/api/health` | HTTP 200, expected JSON, `Cache-Control: no-store` |
| Running Vite: proxied `/api/health` | Same real backend response and cache policy |
| Frontend `getHealth()` through live Vite proxy | Accepted the actual backend response |
| Stop backend and repeat `getHealth()` through Vite | Rejected the request as expected |
| Git staged whitespace check | Passed |
| npm lockfile registry URLs | Standard registry.npmjs.org; no workspace proxy embedded |

The backend test also verifies `/api/rooms` returns 404, since rooms are not yet
implemented. The frontend tests use injected HTTP responses for isolated error
cases; the separate live proxy check used a real running Spring Boot application.

## Debugging performed

Initial Maven dependency resolution failed because this workspace requires an HTTP
proxy. Maven needed temporary settings generated from the environment for that
execution. With those settings, the complete backend build passed. The proxy file
is outside the project and is not included in the deliverable. No TLS verification
was disabled and no dependency versions were downgraded.

The initial compiler warning came from deprecated Jackson API usage in test
assertions. The final checkpoint uses `JsonMapper.builder()` and deserializes the
response into a typed record. The updated test compilation has no deprecation
warning.

## Not verified here

- Rendered desktop/mobile layout, keyboard interaction, loading state, and visible
  retry flow: the first Chromium download repeatedly timed out. A follow-up
  attempt connected to the supported cloud browser, but it blocked access to
  `http://127.0.0.1:5173` with `ERR_BLOCKED_BY_CLIENT`. This is a browser access
  limitation, not evidence of an application failure. No browser or screenshot
  pass is claimed, and the restriction was not bypassed.
- Physical phone access over Wi-Fi.
- Windows/IntelliJ execution; the supplied commands require a local check.
- Rooms, QR links, file uploads, expiry, WebSockets, and deployment: not implemented
  in this day's scope, so no test coverage or completion is claimed for them.

Use the manual checklist in `docs/day-01.md` before moving to Day 2. The UI has
responsive CSS and accessibility attributes, but those alone do not prove browser
behavior. The automated checks establish the Day 1 build and API foundation.

## Git and handoff

The original offline download contains the local Day 1 commit and records its ID
in `CHECKPOINT.txt`. The public destination is now
[shaileshsalve-7/droplink](https://github.com/shaileshsalve-7/droplink).
Command-line Git could not authenticate in this workspace. Publication therefore
uses the connected GitHub app: a README initialization commit followed by the
complete Day 1 source tree, preserving the executable Maven Wrapper mode.
The implementation message is
`chore: initialize DropLink frontend and backend foundation`.

Use a fresh GitHub clone for subsequent days; the older offline bundle has a
different history. Dependencies, build outputs, local environment files, uploaded
files, and proxy settings are excluded from source control. Browser checks above
remain outstanding; publishing source does not verify the rendered application.

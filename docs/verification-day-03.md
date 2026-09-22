# Day 3 verification

Milestone: September 23, 2026. Implementation and checks ran September 22 following
the user's explicit request to start early and upload after midnight in India.
This records the prepared source checkpoint, not proof of GitHub publication.

## Passed

| Check | Result |
| --- | --- |
| Node API/invitation tests | 14 passed |
| React interaction tests (Vitest + jsdom) | 20 passed |
| Backend regression tests | 13 passed |
| Vite production build | Successful |
| Maven executable JAR packaging | Successful after regenerating a damaged output JAR |
| QR payload round trip | SVG → pixels → separate decoder returned the exact join URL for HTTP LAN and HTTPS examples |
| Invitation parsing | Valid/invalid fragments, formatted codes, unrelated anchors, and duplicate fields checked |
| URL construction | Loopback/wildcard hosts, credentials, unsupported schemes, and overly long addresses rejected |
| Invitation UI | Explicit join, StrictMode, existing session preservation, expiry errors, copy fallback, and hash changes checked |
| Live Vite → Spring check | Parsed invitation joined the real room with a distinct member token |
| Live room regression checks | Leave, expiry, backend outage/restart, and throttling passed |
| Source hygiene | Git whitespace check passed; dependency URLs use registry.npmjs.org |

Total: 47 automated tests, plus the live smoke script. Commands and manual checks
are in `day-03.md`. The smoke script starts/stops its own servers; no public site
was deployed.

## Debugging recorded

- QR standalone rasterization initially rejected the SVG without its XML namespace.
  The QR now declares `xmlns`; the real pixel decoding test passes.
- One StrictMode test reused a consumed mock Response. Each mocked request now
  receives a fresh Response, matching the real fetch contract.
- Offline Maven dependency resolution was unavailable initially. Temporary proxy
  settings outside the project restored dependency resolution. Packaging then
  found a damaged generated JAR. Cached JARs were checked; only the generated
  application JAR was removed and rebuilt. The final package run passed all 13
  backend tests and produced the executable artifact. No dependency version or
  TLS verification was weakened.

## Not verified here

Physical phone-camera scanning, real browser layout, keyboard navigation,
clipboard permissions on devices, and Windows/IntelliJ execution still require the
manual checklist. Pixel decoding and jsdom are not substitutes for those checks.
Day 1's supported cloud browser blocked localhost; no visual browser pass is claimed.

The invitation includes the existing room code and is as sensitive as that code.
Fragments reduce initial HTTP logging exposure; they do not provide encryption or
hide the code from browser scripts. The server's admission limits and expiry still
apply. Generated links require a reachable host and network; checking the address
format alone cannot establish reachability.

## Publication

The requested publication window begins at 00:00 Asia/Kolkata on September 23,
2026. The checkpoint is prepared locally first. A one-time task is intended to
attempt publication after that boundary, verify the resulting branch, and report
success or a blocker. Do not infer upload success from the existence of this file
or a task schedule. No Day 4 implementation is included.

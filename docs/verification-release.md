# Netlify release verification

September 24, 2026. The user requested completion now and a Netlify live link,
replacing the previous daily release schedule. The daily automation is disabled.

## Implementation

- React supports a validated public HTTPS API origin while retaining relative
  localhost/JAR development requests. WSS uses that same backend address.
- Production API CORS permits exactly the configured frontend origin. Preflights
  run before member-token checks. Actual file requests still require valid access.
- CORS filtering excludes the WebSocket endpoint, whose origin and first-frame
  member authentication are checked separately.
- Netlify build configuration and the Render backend origin are documented.
- The prior Days 5–8 realtime, UX, regression and production work is retained.

## Results

Frontend: 32 Node tests and 38 React/jsdom tests passed; build passed.
Backend: 42 Java tests passed, including exact-origin API preflights, rejected
unrelated origins, and token-required file access. Production packaging passed.
The production-JAR smoke verified bundled assets, transfers in both directions,
notifications, isolation, reconnect, revocation, expiry and server restart.
Total: 112 automated tests, plus the local live-production workflow.
Netlify project created with id `6b89c276-3527-449c-8091-94096486c397`.
No complete public deployment is claimed by this preliminary record.

Physical phone/camera and assistive-technology checks remain unverified.

## GitHub summary

Complete the remaining DropLink MVP and prepare Netlify frontend deployment with
a Java Docker backend, exact-origin CORS and WSS, release documentation and tests.

Commit message: `feat: release DropLink with Netlify frontend integration`

After confirmed publication, on your clean clone:

```powershell
git switch main
git pull --ff-only origin main
```

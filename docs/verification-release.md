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

Frontend: all 32 Node API tests and 38 React/jsdom tests passed; the production
build passed. `npm ci` reported zero vulnerabilities.

Render backend: service `droplink` is live at
[https://droplink-u513.onrender.com](https://droplink-u513.onrender.com), on the
free Singapore plan with one instance. Deploy `dep-dar9ckrncjis73ckldi0` is live
from GitHub commit `e9219a17d62cc4f537988782d63e53265cb299c7`. The public
`/api/health` check returned HTTP 200 and `status: UP`.

Netlify frontend: [https://droplink-shailesh.netlify.app](https://droplink-shailesh.netlify.app)
returned HTTP 200. `VITE_API_BASE_URL` is set to the Render HTTPS origin, and the
published JavaScript bundle contains that origin. Production deploy
`6ab69a98115da82e59af4f48` is ready and published at `2026-09-25T16:00:39Z`.
The live browser created a room and showed “Live updates connected”; the temporary
session was then left.

Public API checks passed: exact-origin CORS preflight, room creation and joining,
multipart uploads by both members, file listing, and exact downloads in both
directions. Public WSS token authentication returned `ready`. A cleanup check
confirmed that both temporary memberships return HTTP 204 on leave.

Fresh local Java verification is incomplete. Maven main-source compilation
completed, but test compilation/package failed under local JDK 26.0.1 because
`javac` received `java.nio.file.AccessDeniedException` while closing the
`spring-boot-web-server` dependency archive. This is an environment-level file
access failure; it does not establish a Java test result. The earlier 42-test
backend result is historical and was not repeated in this session.

The existing screenshot shows the landing page only. Physical phone/camera,
assistive-technology, and real-browser file-picker/download-dialog checks remain
unverified.

The live Render service runs GitHub commit `e9219a17d62cc4f537988782d63e53265cb299c7`;
the earlier feature release was `4dd3fd8d3681352a8a1a251ea8535a54579015b2`.

## GitHub summary

Complete the remaining DropLink MVP and prepare Netlify frontend deployment with
a Java Docker backend, exact-origin CORS and WSS, release documentation and tests.

Commit message: `feat: release DropLink with Netlify frontend integration`

After confirmed publication, on your clean clone:

```powershell
git switch main
git pull --ff-only origin main
```

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
Frontend deployment succeeded September 25, 2026:
[Open the Netlify frontend](https://droplink-shailesh.netlify.app/).
Netlify production deploy: 6ab5fef67b500f99c9642650, state ready, published at
2026-09-25T04:56:33Z. The real page was opened in the cloud browser and its landing
screen verified and captured in [the deployment screenshot](netlify-frontend-20260925.jpg). No active room or
member credentials appear in that screenshot.

The backend is NOT deployed. Render dashboard remains signed out; the secure
sign-in attempt timed out. The frontend currently has no external API origin, so
room creation, joining, uploads and downloads are unavailable on the public site.
A live page is not a completed sharing service. Finish Render sign-in, deploy the
existing Docker backend, set VITE_API_BASE_URL on Netlify, redeploy, then verify
both-direction transfer and WSS. No production transfer success is claimed.

Source release was published and independently fetched/verified as GitHub commit
4dd3fd8d3681352a8a1a251ea8535a54579015b2, exact tree
7817e546dff6c00048862aa7494be419a942aa75. The September 25 documentation update adds
the live frontend link and genuine screenshot to the repository, with the backend
deployment blocker stated explicitly.

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

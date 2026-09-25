# Netlify frontend and Java backend

The user requested immediate completion on Netlify on September 24, 2026.
This replaces the earlier September 28 publication schedule. The old daily task
is disabled. Consult verification-release.md for actual hosting status.

## Why two hosts

Netlify builds and serves React. Spring Boot needs a long-running Java process,
WebSocket connections, and temporary disk, so it runs in a separate Docker web
service. File bytes go directly to that service over HTTPS; events use WSS.
Netlify is not used as a WebSocket or large-upload proxy.

| Configuration | Meaning |
| --- | --- |
| Netlify project | `droplink-shailesh` |
| Frontend source / output | `frontend/` / `frontend/dist/` |
| Netlify build | `npm run build` with Node 24 |
| `VITE_API_BASE_URL` | Exact assigned backend HTTPS origin, no trailing slash |
| Backend `DROPLINK_PUBLIC_ORIGIN` | `https://droplink-shailesh.netlify.app` |
| Backend runtime | Docker, one free Render instance |
| Health endpoint | `/api/health` |
| Upload storage | `/app/files`, ephemeral; no persistent disk |
| Public port | Host-supplied `PORT`, default 10000 |

The Vite variable is public build configuration, not a secret. Changing it requires
rebuilding the frontend. Invitation URLs still use the Netlify frontend origin;
member tokens never go in URLs. Public origins must not include paths, fragments,
credentials, or query strings. No wildcard CORS policy is used.

## Test and package

From the project root on Windows PowerShell:

```powershell
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
.\backend\mvnw.cmd -B -f backend/pom.xml -Pproduction clean package
node scripts/smoke-production.mjs
```

Use `./backend/mvnw` on Linux/macOS. Build React before Maven: the optional Maven
production profile embeds the existing `frontend/dist` into the executable JAR.
The Dockerfile runs both test suites and does that sequence automatically.
The hosted Netlify frontend uses its own build with the backend origin configured.
The optional embedded frontend remains useful for local production smoke tests.

With Docker installed:

```powershell
docker build -t droplink:local .
docker run --rm --name droplink-local -p 127.0.0.1:10000:10000 --memory=512m -e DROPLINK_PUBLIC_ORIGIN=https://droplink-shailesh.netlify.app droplink:local
```

The image runs as UID 10001 and owns only its app storage. JVM heap is capped at
50% of detected RAM to leave space for native memory; Tomcat connections and
threads are bounded. This is not a measured production capacity guarantee.

## Backend deployment

The Docker web service is live at `https://droplink-u513.onrender.com` on the
free Singapore plan with one instance and no persistent disk. Its health check is
`/api/health`; `DROPLINK_PUBLIC_ORIGIN` is the exact Netlify origin above.
`VITE_API_BASE_URL` is configured to the backend HTTPS origin and requires a new
Netlify build if the backend hostname changes.

Render automatic deploys are off. After a reviewed source change, deploy the
existing `droplink` service from the Render Dashboard and wait for its health
check. Do not create a duplicate service or change unrelated services. Free hours
are shared across the workspace; no paid plan, disk, or compute is configured.

## Frontend deployment

`netlify.toml` defines the build directory, command, static asset caching, no-referrer,
nosniff and frame-denial headers. Use the connected Netlify deployment flow or an
authenticated CLI to deploy the tested source to the existing project. Avoid
uploading local credentials, logs, dependencies, uploaded files, or Maven output.

```powershell
npx netlify link --id 6b89c276-3527-449c-8091-94096486c397
npx netlify env:set VITE_API_BASE_URL <actual-backend-https-origin>
npx netlify deploy --build --prod
```

Replace the placeholder with the assigned backend origin before running. These
commands require your authenticated Netlify account. No auth token belongs in
Git, a VITE variable, or chat.

## Access rules and resource limits

ProductionCorsConfiguration runs exact-origin API preflights before the member
filter. A preflight has no bearer token, but the real protected request still
requires one. Unrelated browser origins are denied. The filter only covers HTTP
API routes; RoomSocketConfiguration separately handles WebSocket origins and
first-frame member authentication. Cookies are not used for API authentication.

Forwarded headers remain untrusted. Rate limits use the TCP peer, so users behind
a shared proxy may share the 30-attempt/minute budget. The global budget is 300
attempts/minute. This is deliberately conservative and can reject busy legitimate
traffic. Do not fix that by trusting arbitrary X-Forwarded-For values.

Free services can sleep and take about a minute to wake. Rooms and files vanish
at restart, sleep, or redeploy; 30 minutes is a maximum lifetime, not guaranteed
durability. Files are not backups. Access expiry is checked on each new request;
cleanup normally removes expired blobs every 30 seconds. An already-started
download may complete. Storage must be dedicated to DropLink, never personal files.

## Live verification and screenshots

1. Verify backend `/api/health` and the Netlify root over HTTPS.
2. In a browser, create a room and join in a second tab/device. Check CORS and
   the WSS upgrade; no wildcard origins or tokens in URLs.
3. Transfer harmless files in both directions, verify bytes and automatic lists.
4. Disconnect/reconnect and recover missed uploads; check leave/revocation.
5. Capture genuine UI screenshots. Expire or revoke the demo room before publishing
   images containing its invitation code/QR. Never expose member tokens.
6. Record the exact URLs, deployed commit, and checks in verification-release.md.

A live landing page alone does not prove file sharing works. Separate source
publication, frontend hosting, backend hosting, automated transfer tests, browser
checks and physical-phone checks in the final report.

## Debugging

- Root 404 in the JAR: rebuild React, then package with `-Pproduction clean package`.
- CORS/preflight failure: check frontend origin and the early CORS filter.
- WebSocket 403: ensure the exact Netlify origin is configured on the backend.
- File request 404: check member token, room expiry, or restart before retrying.
- Upload response lost: refresh files before retrying; never auto-repeat uploads.
- Cold start: wait for server startup, then retry explicitly.
- 429: wait one minute; proxy clients can share a budget.
- Memory/disk failures: inspect host logs and cleanup; do not silently upgrade.

References: [Netlify configuration](https://docs.netlify.com/configure-builds/file-based-configuration/),
[Render Docker](https://render.com/docs/docker),
[Render Blueprint](https://render.com/docs/blueprint-spec),
[free hosting](https://render.com/docs/free),
[Spring WebSockets](https://docs.spring.io/spring-framework/reference/web/websocket/server.html).

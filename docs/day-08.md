# Day 8 — production packaging and deployment preparation

Update September 24: the user requested immediate completion on Netlify. The
earlier dates below are historical; use deployment.md and verification-release.md
for the current two-host release and verification status.

## Understand the parts

| Part | What it does | Why |
| --- | --- | --- |
| Vite production build | Converts React into HTML, JS, and CSS | A public server doesn't need the Vite dev server |
| Maven production profile | Packages those assets inside the Spring Boot JAR | Frontend, API, and sockets use one address |
| Dockerfile | Builds/tests the app and runs it as a non-root user | Gives the host a repeatable Java runtime |
| Production Spring profile | Configures binding, limits, cache policy, public origin | Makes the host/proxy behavior explicit |
| Render Blueprint | Describes one free Docker web service | Makes deployment settings reviewable |
| Production smoke script | Starts the JAR without Vite and exercises real transfers | Tests the packaged app, not only source code |

The original eight-day plan reaches deployment on September 28. This work was
prepared ahead of that slot. It does not authorize skipping the predecessor
uploads or publishing another milestone on the same India calendar date.

## How a deployed request works

The browser loads `/` from Spring Boot, then loads the bundled JS/CSS. React calls
relative API paths on the same address. Uploads/downloads remain HTTP; WebSocket
notifications tell other devices when to fetch fresh metadata. The host supplies
HTTPS/WSS, while the Java process listens internally on its configured port.

`RoomSocketConfiguration` accepts one configured HTTPS origin behind that proxy.
It retains same-origin development behavior and token authentication. Forwarded
headers remain untrusted, so an attacker cannot select a fake client IP to evade
the application's peer-based throttle. This also means genuine visitors behind
the same proxy may share its rate budget.

## File map

- `Dockerfile`, `.dockerignore`: staged build and runtime isolation.
- `render.yaml`: free Docker service, health check, environment, manual deployment.
- `backend/pom.xml`: optional `production` Maven profile for frontend resources.
- `application-production.properties`: production runtime settings.
- `RoomSocketConfiguration.java`: exact public-origin validation.
- `ProductionOriginTest.java`: allowed origin, spoofed header rejection, bad config.
- `scripts/smoke-production.mjs`: production version of the transfer/reconnect test.
- `docs/deployment.md`: full Windows, Docker, Render, debug and verification steps.
- `README.md`: project overview, architecture, learning topics, and honest status.

## Run, test, and debug

Use [deployment.md](deployment.md) for production build and run commands. Normal
development is unchanged: run `mvnw spring-boot:run` in backend and `npm run dev`
in frontend. In IntelliJ, set breakpoints in `RoomSocketConfiguration`,
`RoomRequestFilter`, and `FileController` to trace origin, access, and file handling.

The production smoke script tests assets and the real API in one JAR, exact file
contents in both directions, notifications, isolation, reconnect, expiry, and
restart. It does not prove Docker builds, host HTTPS, physical phone rendering,
or camera scanning. See [verification-day-08.md](verification-day-08.md) for actual
results and remaining gates. Do not treat previous-day test counts as today's run.

## Git commands

On your clean clone after publication is confirmed:

```powershell
git switch main
git pull --ff-only origin main
```

For the prepared implementation checkpoint (only on the authorized publication
date after verifying the parent):

```powershell
git status
git add .
git diff --cached --check
git commit -m "chore: prepare production deployment and final project documentation"
git push origin main
```

The automation publishes the complete milestone as one commit; don't run these
commit/push commands yourself if it has already done so. Never force-push.

**GitHub summary:** Prepare one-origin production packaging for React and Spring
Boot, add free Render configuration and proxy-origin tests, and document deployment,
run/debug steps, AI-assisted learning, and the remaining release verification.

## What to learn yourself

Explain why a static-only host cannot run Spring Boot, why a QR code is not an
access token, why expiry and disk cleanup are separate, and why storing room data
in memory requires one backend instance. Build the JAR and trace one request before
claiming you understand the whole system. The code was built with AI assistance.

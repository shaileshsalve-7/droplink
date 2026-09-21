# September 21 — setup and architecture

Stop after this lesson. Day 2 begins only when you say **next day**.

## 1. Understand the pieces before editing

React runs in the browser and controls the screen. Vite starts the development
server and rebuilds the frontend when you edit it. Java runs Spring Boot, which
starts an embedded HTTP server. You do not need to install Tomcat separately.

HTTP is a request followed by a response. JSON is the text format used for today's
response. WebSockets keep a connection open for future live events. Temporary
storage will hold uploaded file bytes later; it is not being implemented today.

Spring Boot is larger than a beginner Java loops exercise. Do not try to memorize
every annotation today. Trace one working request and understand each boundary.

## 2. Read the generated code in this order

| File | What to understand |
| --- | --- |
| `backend/pom.xml` | Dependencies and Java version; the Spring parent manages compatible versions. |
| `backend/src/main/java/com/droplink/DropLinkApplication.java` | `main` starts Spring; component scanning finds the controller. |
| `backend/src/main/java/com/droplink/health/HealthController.java` | `@GetMapping` maps the URL; the record becomes JSON. |
| `backend/src/main/resources/application.properties` | Default port and bind address; environment overrides. |
| `frontend/package.json` | Dependencies and scripts such as `dev`, `build`, and `test`. |
| `frontend/vite.config.js` | `/api` requests are forwarded to Spring Boot during development. |
| `frontend/src/main.jsx` | React is mounted inside the HTML root element. |
| `frontend/src/api/health.js` | HTTP status and JSON contract validation. |
| `frontend/src/App.jsx` | State transitions, async request, timeout, retry, and screen rendering. |
| `frontend/src/styles.css` | Shared colors, spacing, and mobile layout rules. |

Example to trace: click → `checkConnection()` → `getHealth()` → `/api/health` →
Vite proxy → `HealthController.health()` → JSON → React state → status text.

The comments explain decisions rather than translating every line into English.
Try explaining `async`, `await`, `useState`, and `@GetMapping` in your own words.

## 3. Run on Windows

Extract the ZIP. Open the `droplink` directory. Follow the two-terminal commands in
the README. First dependency downloads can take several minutes.

For IntelliJ: open `backend/pom.xml` as a project, allow Maven import, and set
Project SDK and Maven Runner JRE to an installed compatible JDK. Then run the
`DropLinkApplication.main` method. The frontend can run in a separate terminal.

## 4. Verify before moving on

1. Run backend tests with `.\mvnw.cmd test` inside `backend`.
2. Run `npm test` and `npm run build` inside `frontend`.
3. Start both servers and open `http://localhost:5173`.
4. Click **Check connection**. Expect **Server is reachable**.
5. Open browser DevTools → Network. Inspect `/api/health`: status 200 and JSON
   containing `service: droplink`, `status: UP`.
6. Stop only the backend, then click **Check again**. Expect a clear error and
   **Try again**, not a stale green success state.
7. Restart the backend. Click **Try again**. Expect success without refreshing.
8. Use DevTools device mode at 390px width. Check wrapping, scrolling, and button size.
9. Press Tab to reach the check button and Enter to activate it.

The UI uses a manual check: a previous success is timestamped, not a promise of
continuous monitoring. An unresponsive request times out after five seconds.

### Optional real phone check

Connect the phone and laptop to the same trusted Wi-Fi. Start the frontend with:

```powershell
npm run dev -- --host 0.0.0.0
```

Find the laptop's Wi-Fi IPv4 address with `ipconfig`, then open
`http://YOUR-LAPTOP-IP:5173` on the phone. This is a placeholder: use the actual
address shown on your laptop. If Windows asks, allow Node only on your private
network. Do not turn off the firewall. Keep Spring Boot on its loopback default;
Vite forwards requests. This checks access only; file transfer arrives later.

## 5. Debug deliberately

| Symptom | Check or fix |
| --- | --- |
| `java` not recognized / wrong Java | Install or select a JDK; check `java -version` and `JAVA_HOME`; restart the terminal. |
| IntelliJ says SDK missing | Set Project SDK and Maven Runner JRE; reload Maven. |
| `mvn` not recognized | Use `.\mvnw.cmd`; the wrapper downloads Maven. |
| Maven/npm download fails | Read the first error; check internet, proxy, and certificate configuration. Do not disable TLS verification. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd ci` / `npm.cmd run dev` or Command Prompt. No policy change is needed. |
| Port 8080 is occupied | Stop your other server or set `$env:PORT="8081"` before starting Spring Boot. Update `API_PROXY_TARGET` to match and restart Vite. |
| Port 5173 is occupied | Stop the old frontend. `strictPort` deliberately prevents silently switching ports. |
| UI loads but check fails | Open `http://localhost:8080/api/health`; check backend logs, then Vite's proxy target and terminal output. |
| JSON parsing/unexpected response | Inspect Network response body; HTML usually means the wrong server or route answered. |
| Phone cannot connect | Use laptop LAN IP, same Wi-Fi, Vite `--host`, and private-network firewall permission. Guest Wi-Fi may isolate devices. |

Set a breakpoint inside `HealthController.health()` and run Spring Boot in Debug.
Click the browser button. When execution pauses, inspect the request and return
value. Resume promptly: a pause longer than five seconds intentionally triggers the
frontend timeout. For JavaScript, set a browser breakpoint in `getHealth()`.

## 6. Git commands

The local Day 1 commit has been created for you. The download includes a Git bundle
that preserves it; use the README's restore instructions to keep this history.
The commands below document how the commit was created. You do not need to repeat
them after restoring the bundle. If you prefer starting from the source-only
`droplink` directory, these commands create an equivalent initial commit:

```powershell
git init -b main
git add .
git diff --cached --check
git diff --cached --stat
git commit -m "chore: initialize DropLink frontend and backend foundation"
```

Check the staged file list: it must not contain dependencies, build output, local
environment files, or uploaded files. If Git requests identity, set your own name
and email locally for this repository, then retry the commit.

The public repository is `shaileshsalve-7/droplink`. For future work, clone it
using the README instructions. Inspect changes and publish a completed day's
commit from that clone:

```powershell
git status
git diff --check
git add .
git diff --cached --stat
git commit -m "YOUR-DAILY-COMMIT-MESSAGE"
git push origin main
```

Use the completed day's message in place of the placeholder. Run that day's tests
before committing. A push requires GitHub authentication. Do not force-push to
solve a rejected push. The initial publication uses a repository initialization
commit followed by the complete Day 1 implementation commit because this
workspace's command-line Git has no GitHub credentials.

**One commit message:** `chore: initialize DropLink frontend and backend foundation`

**Short GitHub summary:** Set up DropLink with React/Vite and Spring Boot. Added a
responsive workspace, a live backend connection check, automated tests, and setup
and architecture notes. Temporary rooms and file sharing are planned next.

## 7. Learning checkpoint

Before saying **next day**, explain these without reading the code:

- Why does the browser request `/api/health` instead of hardcoding port 8080?
- What turns the Java record into JSON?
- Why is an HTTP 200 response alone not enough to confirm DropLink is reachable?
- Why will file bytes use HTTP while notifications use WebSockets?

Write your own answers below or in a notebook. Completing the lesson matters more
than keeping the calendar exact. Day 2 remains paused.

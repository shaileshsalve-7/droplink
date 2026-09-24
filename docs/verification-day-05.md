# Day 5 verification

Scope: authenticated WebSocket notifications, automatic file-list refresh,
joined-session updates, heartbeat, reconnect recovery, and revoked-access handling.
Day 5 is implemented ahead of its September 25 publication slot. The latest user
instruction authorizes remaining daily work and one upload per India calendar day.

## Results

| Check | Result |
| --- | --- |
| Node API/invitation/file/live-connection tests | 26 passed |
| React/Vitest/jsdom tests | 32 passed |
| Java/JUnit/Spring HTTP/WebSocket tests | 36 passed |
| Total | **94 passed, zero failures** |
| Vite production build | Passed |
| Spring executable JAR package | Passed |
| Live frontend client → Vite → HTTP/WebSocket → Spring | Passed |
| Git whitespace check | Passed |

The backend adds five real WebSocket endpoint tests and four handler tests.
They check successful room-scoped upload notifications, no cross-room delivery,
joined count updates, revoked socket closure, unauthenticated timeout, invalid
tokens, malformed/binary messages, browser-origin rejection, expiry independent
of room cleanup, heartbeat failure, two sockets per member, and the 128-socket cap.

Frontend tests cover first-frame authentication without a token in the URL,
ready-triggered reconciliation, reconnect backoff, heartbeat/auth deadlines,
terminal revocation, cleanup of timers/listeners, tab visibility recovery, and
rejecting mismatched room metadata. UI tests also cover notifications during
uploads or stale list responses, automatic display without clicking Refresh,
count updates without reconnecting, and clearing the expired workspace.

The real integration script printed:

```text
PASS: authenticated notifications through Vite; auto-list and exact downloads both directions; another room sees nothing.
PASS: reconnection reconciles missed uploads; leaving revokes the socket and updates joined sessions.
PASS: expiry closes the authenticated socket and rejects further HTTP access.
PASS: server restart triggers reconnect and then rejects the stale membership.
```

It uses the real `connectRoom`, file and room client modules, a running Vite proxy,
and the packaged Spring server. It creates separate room sessions and a dedicated
store, verifies actual downloaded text, then stops its own processes. The browser
Origin rejection is separately tested with Java's real WebSocket HTTP handshake.
The Node smoke client itself is not a physical browser or phone.

## Issues encountered and resolved

- Mockito's default mock maker could not attach its agent in this environment.
  The handler unit tests now use a small implementation of WebSocketSession;
  they require no JVM instrumentation. All four subsequently passed.
- The first smoke launch found a plain JAR without the executable main manifest
  in the generated target directory. Repackaging with the Spring Boot plugin and
  running the smoke in the same command produced a working executable and all
  live checks passed. No generated JAR is committed.
- Review found that a socket closing while the page was hidden could leave its
  status looking live. Reconnect status now updates before deferring retries until
  the page is visible. The frontend suite and build passed after the change.

## What has not been verified

No physical phone Wi-Fi/camera/download-dialog check or real-browser responsive
screenshot is claimed. jsdom does not test layout. No production proxy/HTTPS/WSS,
load test, mobile OS background suspension, or deployment has been verified yet.
The fixed worker queue bounds resource use; it does not promise a maximum latency
under slow clients or overload. Manual refresh is retained.

Day 4's storage limitations remain: one instance, temporary server-readable files,
access expiry before disk deletion, possible cleanup retries, and restart-driven
orphan cleanup. No account system, encryption scheme, database, or file preview
has been introduced.

## Publication state

Day 3 is already on GitHub as commit
`121974da3014b390346a6475aa3df847f9f99015`, published September 23 India time.
Day 4's saved tree is `59fed2a5bb8d345b411bca52a4577e40236e6e07` and is now queued
for September 24 to honor the latest one-upload-per-day instruction.
Day 5 must be published on the actual remote Day 4 commit on September 25; local
and GitHub commit SHAs may differ while their trees must match.

No Day 4/5 upload is claimed at this checkpoint. Prepared and scheduled work is
not uploaded work. Remaining UX/testing/deployment tasks are documented in
`remaining-work.md`; their eventual checks and results must be recorded honestly.

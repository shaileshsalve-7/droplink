# September 23 — QR codes and join links

Day 3 was explicitly authorized on September 22. The user requested GitHub upload
after midnight in India, so publication is deferred until September 23, IST.
Building and testing the checkpoint does not mean it has already been uploaded.
Day 4 requires a separate `next day` instruction.

## 1. What and why, before reading the code

An invitation is a URL containing the room code. A QR code encodes that same URL
so a phone camera can open it without typing. It contains no file data and no
member access token. Anyone who receives the invitation can join the room while
it remains valid, exactly like someone who knows the typed room code.

The format is `http://YOUR-LAPTOP-IP:5173/#join=ABCD2345` in local development.
The example code is illustrative; the app generates the real invitation.
The part after `#` is a URL fragment. Browsers do not send it in the initial HTTP
request. React reads it, removes it from the current history entry, and fills the
join form. Same-origin JavaScript, browser extensions, copied links, screenshots,
and a camera service can still expose it. This is not encryption.

A user must press **Join room**. Merely opening a URL does not create membership.
This prevents duplicate joins from React StrictMode and accidental requests from
opening the same link repeatedly. The backend still enforces expiry, throttling,
capacity, and member authentication; a link cannot bypass those rules.

## 2. Implementation: read in this order

| File | What it does and why |
| --- | --- |
| `frontend/src/api/invitations.js` | Parses and validates invitation fragments; constructs links from the current page's address. Keeps invitation handling independently testable. |
| `frontend/src/RoomInvite.jsx` | Generates the QR locally using `qrcode.react`, displays a selectable link, and provides a clipboard fallback. |
| `frontend/src/RoomWorkspace.jsx` | Prefills the join form, handles links opened while the page is already running, and preserves existing membership. |
| `frontend/src/api/invitations.test.js` | Tests parser/address rules and decodes actual QR pixels to verify the payload. |
| `frontend/src/Invitations.ui.test.jsx` | Tests user-visible behavior with a simulated DOM, including StrictMode and failed clipboard access. |

`QRCodeSVG` renders a plain black QR on white with a four-module margin (quiet
zone). It uses error correction level M and no logo overlay. QR generation does
not contact a third-party QR service. `@resvg/resvg-js` and `jsqr` are development
only dependencies for rendering and decoding the QR during tests.

The URL builder uses only the current page address. It retains the app path and
port, removes unrelated query/fragment data, and appends the validated code. It
rejects unsupported schemes, URL credentials, overly long URLs, and common
loopback/wildcard addresses. It does not promise that every other address is
reachable: devices still need network access to that host.

Incoming unrelated fragments such as `#features` are ignored. Malformed `#join`
fragments are removed and produce an actionable error. No redirect destination is
accepted from an invitation.

## 3. Existing sessions and links

- With no active membership, opening a valid link fills the code. Press **Join room**.
- With a session for the same code, the app checks the saved session instead of
  creating another membership automatically.
- With a different active room, it shows the pending invitation. Leave the current
  room explicitly, then press **Join room** for the prefilled code.
- **Dismiss invitation** removes the pending invitation and its prefilled code.
- Expired/full/unavailable rooms use the existing Day 2 API errors.
- QR/link sharing appears only after the membership has been verified. The expiry
  flow removes the room view, including its QR.

No new backend endpoint is needed. The same `POST /api/rooms/join` handles code,
link, and QR entry. This keeps security rules in one place.

## 4. Run and test on Windows

After the scheduled upload is confirmed, update your existing clone:

```powershell
git pull --ff-only origin main
cd backend
.\mvnw.cmd spring-boot:run
```

In a second terminal, starting from the repository root:

```powershell
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```

Run `ipconfig` and find your laptop's Wi-Fi IPv4 address. Open
`http://YOUR-LAPTOP-IP:5173` on the laptop itself, then create a room. Replace the
placeholder with the actual address; do not enter the literal placeholder.

Scan the QR with your phone camera while both devices are on the same trusted
Wi-Fi. Open the result and press **Join room**. Press **Refresh status** on the
laptop to see the new session. No in-app camera permission or scanner is required.

Why not localhost? On a phone, `localhost` means that phone. A QR containing the
laptop's localhost address would fail. DropLink therefore displays guidance and
keeps code joining available instead of offering that QR. Opening the laptop's
LAN address before creating the room solves this. Do not disable your firewall;
allow Vite/Node on the trusted private network if prompted. Guest Wi-Fi may isolate
devices. No public deployment is part of Day 3.

## 5. Automated checks

Inside `frontend`:

```powershell
npm test
npm run build
```

Inside `backend`:

```powershell
.\mvnw.cmd package
```

From the repository root, after the package build and dependency install:

```powershell
node scripts/smoke-day2.mjs
```

The existing live smoke script now parses an invitation fragment before joining
with the real frontend API client through Vite and Spring Boot. It also checks
leave, expiry, backend restart, and throttling. Its filename is retained so earlier
lesson commands remain usable.

The QR test renders actual SVG pixels, decodes them with a separate QR decoder,
and compares the exact decoded URL and invitation code. This confirms payload
integrity under test conditions, not physical camera performance or screen layout.
The React tests use jsdom, not a real browser.

## 6. Manual checks and debugging

1. On the LAN address, create a room and scan its QR with a physical phone.
2. Verify the code is prefilled and membership is created only after **Join room**.
3. Copy the link into a separate browser and verify the same flow.
4. Open a link while in the same room, then a different room. Confirm there is no
   unexpected join or leave.
5. Open a malformed link and an expired room's link; verify errors and recovery.
6. On localhost, confirm no misleading QR is offered. On a LAN HTTP origin,
   clipboard access may be blocked; verify manual selection/copy still works.
7. Check at 390px width and on desktop: the QR must fit, retain a clear white
   margin, and remain scannable. Check Tab/Enter and visible focus.

If the camera opens a page that cannot load, inspect the hostname first. Test the
same base address in the phone browser before debugging QR generation. If the page
loads but joining fails, inspect the `/api/rooms/join` status in DevTools.

Set a JavaScript breakpoint in `readInvitation()` to inspect parsing, then in
`submitJoin()` to trace the explicit admission request. The address bar loses the
fragment deliberately after React captures it. Inspect the prefilled form to see
the invitation rather than expecting the fragment to remain.

The SVG decoding test initially failed because the standalone SVG lacked its XML
namespace. Adding `xmlns` fixed standalone rendering. A StrictMode test initially
reused one mock Response across two reads; returning a fresh Response per request
fixed that test setup. Neither failure was hidden by removing a check.

## 7. Git workflow and publication timing

The implementation is committed locally with one clean Day 3 message. GitHub must
remain at Day 2 until the requested publication window. A scheduled task will
attempt to publish the tested checkpoint after midnight IST and report the result.
A scheduled task is not evidence that upload has already succeeded.

Commands documenting the local implementation and eventual upload:

```powershell
git status
git diff --check
git add .
git diff --cached --stat
git commit -m "feat: add QR invitations and private room join links"
# Run only after midnight IST and only if this commit is not already published:
git push origin main
```

After automated publication, use `git pull --ff-only` from your existing Day 2
clone instead of recreating the commit. The publisher must preserve the current
branch, use a non-forced update, and stop if the destination changed unexpectedly.

**Commit message:** `feat: add QR invitations and private room join links`

**GitHub summary:** Added locally generated QR invitations and copyable join links,
with safe fragment parsing, explicit joining, current-session protection, and
localhost guidance. Added QR decoding and interaction tests plus the Day 3 lesson.

## 8. What to learn before Day 4

Explain why an invitation carries the code but never your member token; what the
URL fragment does and does not protect; why an explicit join avoids duplicate
membership; and why localhost cannot identify your laptop from a phone.

References: [qrcode.react](https://github.com/zpao/qrcode.react),
[MDN URL fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment).

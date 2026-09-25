# Release status — September 25, 2026

The main DropLink release is on GitHub. The React frontend is live on Netlify and
the Java backend is live on Render's free, single-instance plan. Public health,
room creation/joining, both-direction API file transfers, CORS, WSS authentication,
and the browser's live connection have been verified. See
[`verification-release.md`](verification-release.md) for evidence.

Remaining verification is limited to physical-phone camera behavior, native
browser file dialogs, and assistive-technology checks. Fresh local Java tests could
not complete because this Windows/JDK 26 environment denied access while `javac`
closed a Spring dependency archive. No feature or hosting deployment gate remains.

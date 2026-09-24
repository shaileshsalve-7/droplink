# DropLink working agreement

## Current user instruction (September 24, 2026)

Finish all remaining work now and provide a live Netlify link. This explicitly
replaces the earlier daily upload/deployment timing. The recurring daily task has
been disabled to prevent it from overwriting this release. Publish the tested
remaining source as a coherent release, then verify hosting. Preserve original
checkpoint branches and remote work; never force-push or backdate commits.

## Product and teaching requirements

Keep React + Vite, Java + Spring Boot, WebSockets, temporary storage, a simple
original responsive design, and a working MVP. Explain what/why before changes.
Use meaningful tests, report actual results, and include run/test/debug commands,
a clean commit message, and a short GitHub summary. README covers problem,
solution, features, stack, architecture, setup, learning with AI assistance,
limitations and future work. Do not claim unperformed checks or public deployment.

## Hosting

The user requested Netlify. Host the React frontend there; Spring Boot requires
a separate Java/Docker service. Keep the backend on a free Render plan if available,
one instance, no persistent disk. Configure the exact frontend HTTPS origin for
CORS and WebSocket access and the exact backend origin for Vite's public API URL.
Do not incur charges or modify unrelated hosting services. Do not publish secrets,
user uploads, dependencies, build output, logs, or local authentication settings.

Earlier dated checkpoint instructions are historical. See docs/deployment.md and
docs/verification-release.md for the current release configuration and evidence.

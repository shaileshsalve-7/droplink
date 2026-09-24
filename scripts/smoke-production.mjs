// Build frontend/dist, then package Maven with -Pproduction before this check.
// Reuse the real transfer/reconnect suite, running only the production JAR (no Vite).
process.env.SMOKE_PRODUCTION = '1';
await import('./smoke-day5.mjs');

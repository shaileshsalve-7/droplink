import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // This value is used by Vite's server, not embedded into browser JavaScript.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // A relative URL works from both a laptop and a phone on the same LAN.
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8080' },
      },
    },
  };
});

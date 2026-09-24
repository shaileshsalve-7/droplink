// Vite embeds this public address at build time. It must never contain a token.
// Keeping it empty preserves the same-origin Vite/local JAR development workflow.
export function validateApiOrigin(value = '') {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || value.endsWith('/')) {
    throw new Error('VITE_API_BASE_URL must be an HTTPS origin without a trailing slash.');
  }
  return url.origin;
}

export const API_ORIGIN = validateApiOrigin(import.meta.env?.VITE_API_BASE_URL || '');
export const apiUrl = path => `${API_ORIGIN}${path}`;
export const socketBase = fallback => API_ORIGIN || fallback;

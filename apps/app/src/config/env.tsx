// Environment variables are injected at build time by rspack's DefinePlugin.
// Access them directly - dynamic access via process.env[key] won't work.

function getApiUrl(): string {
  // Check for explicit override via environment variable
  const value = process.env.PUBLIC_API_URL;
  if (value !== undefined && value !== '') {
    return value;
  }

  // In browser, dynamically use current hostname so the app works when
  // accessed from other devices on the local network
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    return `${protocol}//${hostname}:3001`;
  }

  // SSR/build-time fallback
  return 'http://localhost:3001';
}

export const env = {
  apiUrl: getApiUrl(),
} as const;

export function validateEnv(): void {
  // Validation happens at build time via DefinePlugin
  // This logs the resolved configuration
  console.info('[env] Configuration loaded:', {
    apiUrl: env.apiUrl,
  });
}

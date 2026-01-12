// Environment variables are injected at build time by rspack's DefinePlugin.
// Access them directly - dynamic access via process.env[key] won't work.

function getApiUrl(): string {
  const value = process.env.PUBLIC_API_URL;
  if (value === undefined || value === '') {
    return 'http://localhost:3001';
  }
  return value;
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

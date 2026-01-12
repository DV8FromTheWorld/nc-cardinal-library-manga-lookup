/**
 * Native environment configuration.
 * Uses localhost with adb reverse port forwarding.
 * Run: adb reverse tcp:3001 tcp:3001
 */

export const env = {
  apiUrl: 'http://localhost:3001',
} as const;

export function validateEnv(): void {
  console.info('[env] Native configuration loaded:', {
    apiUrl: env.apiUrl,
  });
}

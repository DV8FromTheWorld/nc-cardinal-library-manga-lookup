/**
 * Store initialization registry.
 *
 * Modules register their initialize functions here.
 * The app calls `initializeAll()` once on startup.
 *
 * Usage:
 *   // In store/stores.tsx (central file):
 *   import { initialize as initAuth } from '../authentication/store';
 *   registerInitializer(initAuth);
 *
 *   // In app entry point:
 *   import { initializeAll } from './modules/store/registry';
 *   await initializeAll();
 */

type InitializerFn = () => Promise<void> | void;

/**
 * Registry of all initializer functions.
 */
const initializers: InitializerFn[] = [];

/**
 * Register an initializer function to run on app start.
 */
export function registerInitializer(fn: InitializerFn): void {
  initializers.push(fn);
}

/**
 * Run all registered initializers.
 * Call this once on app startup.
 */
export async function initializeAll(): Promise<void> {
  await Promise.all(initializers.map((fn) => fn()));
}

/**
 * Get count of registered initializers (for debugging/testing).
 */
export function getInitializerCount(): number {
  return initializers.length;
}

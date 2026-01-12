/**
 * Storage interface for cross-platform persistent storage.
 * 
 * Web uses localStorage (sync), Native uses AsyncStorage (async).
 * The interface supports both patterns.
 */

export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// Re-export the platform-specific implementation
// Bundlers will resolve storage.web.tsx or storage.native.tsx
export { storage } from './storage.web';

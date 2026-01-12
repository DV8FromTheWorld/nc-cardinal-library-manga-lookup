/**
 * Web storage implementation using localStorage.
 */

import type { Storage } from './storage';

class WebStorage implements Storage {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
}

export const storage: Storage = new WebStorage();

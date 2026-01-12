/**
 * Storage interface and web implementation.
 *
 * Web uses localStorage (sync), Native uses AsyncStorage (async).
 * Metro resolves storage.native.tsx on React Native.
 */

export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Web storage implementation using localStorage.
 * This is the default implementation used by web bundlers.
 * Metro will use storage.native.tsx instead on React Native.
 */
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

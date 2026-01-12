/**
 * Native storage implementation using AsyncStorage.
 * 
 * TODO: Implement when building native app.
 * Will need to install @react-native-async-storage/async-storage
 */

import type { Storage } from './storage';

class NativeStorage implements Storage {
  async getItem(key: string): Promise<string | null> {
    // TODO: Use AsyncStorage
    console.warn('NativeStorage not yet implemented');
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    // TODO: Use AsyncStorage
    console.warn('NativeStorage not yet implemented');
  }

  async removeItem(key: string): Promise<void> {
    // TODO: Use AsyncStorage
    console.warn('NativeStorage not yet implemented');
  }
}

export const storage: Storage = new NativeStorage();

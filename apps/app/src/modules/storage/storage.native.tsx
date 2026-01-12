/**
 * Native storage implementation using AsyncStorage.
 * Metro resolves this file when importing 'storage' on React Native.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

class NativeStorage implements Storage {
  async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('NativeStorage.getItem error:', error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('NativeStorage.setItem error:', error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('NativeStorage.removeItem error:', error);
    }
  }
}

export const storage: Storage = new NativeStorage();

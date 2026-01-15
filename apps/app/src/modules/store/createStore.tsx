/**
 * Store factory functions.
 *
 * Simple wrappers around Zustand's create() with cross-platform storage.
 *
 * Usage:
 *   // Simple store
 *   export const useCounterStore = createStore<CounterState>()(() => ({
 *     count: 0,
 *   }));
 *
 *   // Persistent store
 *   export const useAuthStore = createPersistentStore<AuthState>()(
 *     () => ({
 *       session: null,
 *       isLoading: false,
 *     }),
 *     {
 *       name: 'nc-cardinal-auth',
 *       partialize: (state) => ({ session: state.session }),
 *     }
 *   );
 */

import { create, StateCreator } from 'zustand';
import { persist, createJSONStorage, PersistOptions } from 'zustand/middleware';
import { storage } from '../storage/storage';

// ============================================================================
// Storage Adapter
// ============================================================================

/**
 * Adapter to make our storage abstraction work with Zustand's persist middleware.
 * Handles both sync (web localStorage) and async (React Native AsyncStorage).
 */
const storageAdapter = {
  async getItem(name: string): Promise<string | null> {
    return storage.getItem(name);
  },
  async setItem(name: string, value: string): Promise<void> {
    await storage.setItem(name, value);
  },
  async removeItem(name: string): Promise<void> {
    await storage.removeItem(name);
  },
};

// ============================================================================
// Store Factories
// ============================================================================

/**
 * Create a basic Zustand store.
 */
export function createStore<T>() {
  return (initializer: StateCreator<T, [], []>) => {
    return create<T>()(initializer);
  };
}

/**
 * Options for createPersistentStore.
 */
export type PersistentStoreOptions<T> = Omit<PersistOptions<T, Partial<T>>, 'storage'> & {
  name: string;
};

/**
 * Create a Zustand store with persistence.
 * Uses cross-platform storage adapter automatically.
 */
export function createPersistentStore<T>() {
  return (
    initializer: StateCreator<T, [], [['zustand/persist', Partial<T>]]>,
    options: PersistentStoreOptions<T>
  ) => {
    return create<T>()(
      persist(initializer, {
        ...options,
        storage: createJSONStorage(() => storageAdapter),
      })
    );
  };
}

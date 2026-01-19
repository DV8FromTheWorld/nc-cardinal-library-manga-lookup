/**
 * Home Library Hook
 *
 * Manages the user's selected home library with persistent storage.
 * The home library is used to show local vs remote availability.
 *
 * Supports both sync (web localStorage) and async (native AsyncStorage).
 */

import { useState, useEffect, useCallback } from 'react';
import { storage } from '../../storage/storage';
import { getLibraries } from '../../search/services/mangaApi';
import type { Library } from '../../search/types';

const STORAGE_KEY = 'nc-cardinal-home-library';
const DEFAULT_LIBRARY = 'HIGH_POINT_MAIN';

export interface UseHomeLibraryResult {
  homeLibrary: string;
  setHomeLibrary: (code: string) => void;
  libraries: Library[];
  isLoading: boolean;
  libraryName: string | undefined;
}

export function useHomeLibrary(): UseHomeLibraryResult {
  const [homeLibraryValue, setHomeLibraryValue] = useState<string>(DEFAULT_LIBRARY);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load stored home library on mount (handles both sync and async storage)
  useEffect(() => {
    let cancelled = false;

    async function loadStoredLibrary() {
      try {
        const stored = await storage.getItem(STORAGE_KEY);
        if (!cancelled && stored != null) {
          setHomeLibraryValue(stored);
        }
      } catch (error) {
        console.error('Failed to load stored home library:', error);
      }
    }

    // Handle both sync and async storage
    const result = storage.getItem(STORAGE_KEY);
    if (result instanceof Promise) {
      void loadStoredLibrary();
    } else if (typeof result === 'string') {
      setHomeLibraryValue(result);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch libraries on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchLibraries() {
      try {
        const data = await getLibraries();
        if (!cancelled) {
          setLibraries(data.libraries);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch libraries:', error);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchLibraries();

    return () => {
      cancelled = true;
    };
  }, []);

  const setHomeLibrary = useCallback((code: string) => {
    setHomeLibraryValue(code);
    // Fire and forget - storage.setItem may be async
    void storage.setItem(STORAGE_KEY, code);
  }, []);

  // Get the library name for the current selection
  const libraryName = libraries.find((l) => l.code === homeLibraryValue)?.name;

  return {
    homeLibrary: homeLibraryValue,
    setHomeLibrary,
    libraries,
    isLoading,
    libraryName,
  };
}

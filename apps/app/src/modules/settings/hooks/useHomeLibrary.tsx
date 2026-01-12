/**
 * Home Library Hook
 * 
 * Manages the user's selected home library with persistent storage.
 * The home library is used to show local vs remote availability.
 */

import { useState, useEffect, useCallback } from 'react';
import { storage } from '../../storage/storage.web';
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
  const [homeLibrary, setHomeLibraryState] = useState<string>(() => {
    // Initialize from storage or default
    const stored = storage.getItem(STORAGE_KEY);
    // Handle both sync and async storage (web is sync)
    if (typeof stored === 'string') {
      return stored;
    }
    return DEFAULT_LIBRARY;
  });
  
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    
    fetchLibraries();
    
    return () => {
      cancelled = true;
    };
  }, []);

  const setHomeLibrary = useCallback((code: string) => {
    setHomeLibraryState(code);
    storage.setItem(STORAGE_KEY, code);
  }, []);

  // Get the library name for the current selection
  const libraryName = libraries.find(l => l.code === homeLibrary)?.name;

  return {
    homeLibrary,
    setHomeLibrary,
    libraries,
    isLoading,
    libraryName,
  };
}

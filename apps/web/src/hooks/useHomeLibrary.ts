/**
 * Home Library Hook
 * 
 * Manages the user's selected home library with localStorage persistence.
 * The home library is used to show local vs remote availability.
 */

import { useState, useEffect, useCallback } from 'react';
import { getLibraries, type Library } from '../api/manga';

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
    // Initialize from localStorage or default
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_LIBRARY;
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
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, code);
    }
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

/**
 * Hook for managing manga search state and operations.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { searchManga } from '../services/mangaApi';
import type { SearchResult } from '../types';

export interface UseSearchOptions {
  initialQuery?: string | undefined;
  homeLibrary?: string | undefined;
  onQueryChange?: (query: string) => void;
}

export interface UseSearchResult {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult | null;
  isLoading: boolean;
  error: string | null;
  debugMode: boolean;
  search: (searchQuery: string) => void;
  refreshWithDebug: () => void;
  clearResults: () => void;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchResult {
  const { initialQuery, homeLibrary, onQueryChange } = options;
  
  const [query, setQueryState] = useState(initialQuery ?? '');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const lastSearchedQuery = useRef<string | undefined>(undefined);

  // Sync query input with initialQuery when it changes (e.g., browser back/forward)
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQueryState(initialQuery);
    }
  }, [initialQuery]);

  const executeSearch = useCallback(async (searchQuery: string, debug: boolean) => {
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await searchManga(searchQuery, { debug, homeLibrary });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  }, [homeLibrary]);

  // Execute search when initialQuery changes (URL navigation)
  useEffect(() => {
    if (initialQuery && initialQuery !== lastSearchedQuery.current) {
      lastSearchedQuery.current = initialQuery;
      executeSearch(initialQuery, false);
    } else if (!initialQuery && lastSearchedQuery.current) {
      lastSearchedQuery.current = undefined;
      setResults(null);
    }
  }, [initialQuery, executeSearch]);

  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);
  }, []);

  const search = useCallback((searchQuery: string) => {
    onQueryChange?.(searchQuery);
    executeSearch(searchQuery, debugMode);
  }, [onQueryChange, executeSearch, debugMode]);

  const refreshWithDebug = useCallback(() => {
    if (results?.query) {
      setDebugMode(true);
      executeSearch(results.query, true);
    }
  }, [results, executeSearch]);

  const clearResults = useCallback(() => {
    setQueryState('');
    setResults(null);
    lastSearchedQuery.current = undefined;
    onQueryChange?.('');
  }, [onQueryChange]);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    debugMode,
    search,
    refreshWithDebug,
    clearResults,
  };
}

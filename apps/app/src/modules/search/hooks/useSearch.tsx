/**
 * Hook for managing manga search state and operations.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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

  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const lastSearchedQueryRef = useRef<string | undefined>(undefined);

  // Sync query input with initialQuery when it changes (e.g., browser back/forward)
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const executeSearch = useCallback(
    async (searchQuery: string, debug: boolean) => {
      if (searchQuery.trim() === '') {
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
    },
    [homeLibrary]
  );

  // Execute search when initialQuery changes (URL navigation)
  useEffect(() => {
    if (
      initialQuery != null &&
      initialQuery !== '' &&
      initialQuery !== lastSearchedQueryRef.current
    ) {
      lastSearchedQueryRef.current = initialQuery;
      void executeSearch(initialQuery, false);
    } else if (
      (initialQuery == null || initialQuery === '') &&
      lastSearchedQueryRef.current != null
    ) {
      lastSearchedQueryRef.current = undefined;
      setResults(null);
    }
  }, [initialQuery, executeSearch]);

  const search = useCallback(
    (searchQuery: string) => {
      onQueryChange?.(searchQuery);
      void executeSearch(searchQuery, debugMode);
    },
    [onQueryChange, executeSearch, debugMode]
  );

  const refreshWithDebug = useCallback(() => {
    if (results?.query != null && results.query !== '') {
      setDebugMode(true);
      void executeSearch(results.query, true);
    }
  }, [results, executeSearch]);

  const clearResults = useCallback(() => {
    setQuery('');
    setResults(null);
    lastSearchedQueryRef.current = undefined;
    onQueryChange?.('');
  }, [onQueryChange, setQuery]);

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

/**
 * Hook for streaming manga search with real-time progress updates.
 * Native implementation using react-native-sse for true SSE streaming.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import EventSource from 'react-native-sse';

import { env } from '../../../config/env';
import type { SearchProgressEvent, SearchResult, StreamingSearchProgress } from '../types';

export interface UseStreamingSearchOptions {
  initialQuery?: string | undefined;
  homeLibrary?: string | undefined;
  onQueryChange?: (query: string) => void;
}

export interface UseStreamingSearchResult {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult | null;
  isLoading: boolean;
  error: string | null;
  progress: StreamingSearchProgress;
  search: (searchQuery: string) => void;
  clearResults: () => void;
  abort: () => void;
}

const INITIAL_PROGRESS: StreamingSearchProgress = {
  status: 'idle',
  currentStep: null,
  message: '',
};

function getProgressMessage(event: SearchProgressEvent): string {
  switch (event.type) {
    case 'started':
      return `Searching for "${event.query}"...`;
    case 'wikipedia:searching':
      return 'Looking up series info on Wikipedia...';
    case 'wikipedia:found':
      return `Found ${event.seriesTitle} (${event.volumeCount} volumes)`;
    case 'wikipedia:not-found':
      return 'Searching library catalog directly...';
    case 'wikipedia:error':
      return 'Wikipedia unavailable, using library catalog...';
    case 'nc-cardinal:searching':
      return 'Searching NC Cardinal catalog...';
    case 'nc-cardinal:found':
      return `Found ${event.recordCount} records in catalog`;
    case 'availability:start':
      return `Checking availability for ${event.total} volumes...`;
    case 'availability:progress':
      return `Checking availability: ${event.completed}/${event.total} (${event.foundInCatalog} in library)`;
    case 'availability:complete':
      return `${event.foundInCatalog} of ${event.total} volumes in library`;
    case 'covers:start':
      return `Loading cover images (${event.total})...`;
    case 'covers:progress':
      return `Loading covers: ${event.completed}/${event.total}`;
    case 'covers:complete':
      return 'Cover images loaded';
    case 'complete':
      return 'Search complete!';
    case 'error':
      return `Error: ${event.message}`;
    default:
      return '';
  }
}

function getCurrentStep(event: SearchProgressEvent): StreamingSearchProgress['currentStep'] {
  switch (event.type) {
    case 'started':
    case 'error':
      return null;
    case 'wikipedia:searching':
    case 'wikipedia:found':
    case 'wikipedia:not-found':
    case 'wikipedia:error':
      return 'wikipedia';
    case 'nc-cardinal:searching':
    case 'nc-cardinal:found':
      return 'nc-cardinal';
    case 'availability:start':
    case 'availability:progress':
    case 'availability:complete':
      return 'availability';
    case 'covers:start':
    case 'covers:progress':
    case 'covers:complete':
      return 'covers';
    case 'complete':
      return 'done';
  }
}

export function useStreamingSearch(
  options: UseStreamingSearchOptions = {}
): UseStreamingSearchResult {
  const { initialQuery, homeLibrary, onQueryChange } = options;

  const [queryValue, setQueryValue] = useState(initialQuery ?? '');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<StreamingSearchProgress>(INITIAL_PROGRESS);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastSearchedQueryRef = useRef<string | undefined>(undefined);
  const hasInitializedRef = useRef(false);

  // Sync query input with initialQuery when it changes
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQueryValue(initialQuery);
    }
  }, [initialQuery]);

  // Cleanup on unmount - also reset hasInitializedRef so StrictMode remount works
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Reset so the effect will re-execute search on StrictMode remount
      hasInitializedRef.current = false;
    };
  }, []);

  const abort = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsLoading(false);
    setProgress(INITIAL_PROGRESS);
  }, []);

  const executeSearch = useCallback(
    (searchQuery: string) => {
      if (searchQuery.trim() === '') {
        setResults(null);
        return;
      }

      // Abort any existing search
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      setIsLoading(true);
      setError(null);
      setProgress({
        status: 'searching',
        currentStep: null,
        message: 'Starting search...',
      });

      // Build URL with query params
      const params = new URLSearchParams({ q: searchQuery });
      if (homeLibrary != null && homeLibrary !== '') params.set('homeLibrary', homeLibrary);
      const url = `${env.apiUrl}/manga/search/stream?${params}`;

      // Create EventSource for SSE using react-native-sse
      const es = new EventSource(url, {
        headers: {
          Accept: 'text/event-stream',
        },
      });
      eventSourceRef.current = es;

      es.addEventListener('message', (event) => {
        if (event.data == null || event.data === '') return;

        try {
          const sseEvent = JSON.parse(event.data) as SearchProgressEvent;

          // Update progress state
          const currentStep = getCurrentStep(sseEvent);
          const message = getProgressMessage(sseEvent);

          setProgress((prev) => ({
            ...prev,
            status:
              sseEvent.type === 'complete'
                ? 'complete'
                : sseEvent.type === 'error'
                  ? 'error'
                  : 'searching',
            currentStep,
            message,
            // Update specific progress fields
            ...(sseEvent.type === 'wikipedia:found' && {
              seriesFound: sseEvent.seriesTitle,
              volumeCount: sseEvent.volumeCount,
            }),
            ...(sseEvent.type === 'availability:progress' && {
              availabilityProgress: {
                completed: sseEvent.completed,
                total: sseEvent.total,
                foundInCatalog: sseEvent.foundInCatalog,
              },
            }),
            ...(sseEvent.type === 'covers:progress' && {
              coversProgress: {
                completed: sseEvent.completed,
                total: sseEvent.total,
              },
            }),
          }));

          // Handle completion
          if (sseEvent.type === 'complete') {
            setResults(sseEvent.result);
            setIsLoading(false);
            es.close();
            eventSourceRef.current = null;
          }

          // Handle error
          if (sseEvent.type === 'error') {
            setError(sseEvent.message);
            setIsLoading(false);
            es.close();
            eventSourceRef.current = null;
          }
        } catch {
          console.warn('[useStreamingSearch] Failed to parse SSE event:', event.data);
        }
      });

      es.addEventListener('error', (event) => {
        console.error('[useStreamingSearch] EventSource error:', event);
        // Only set error if we're still loading (i.e., this isn't just the stream ending)
        if (isLoading) {
          setError('Connection error during search');
          setIsLoading(false);
          setProgress({
            status: 'error',
            currentStep: null,
            message: 'Connection error during search',
          });
        }
        es.close();
        eventSourceRef.current = null;
      });
    },
    [homeLibrary, isLoading]
  );

  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryValue(newQuery);
      onQueryChange?.(newQuery);
    },
    [onQueryChange]
  );

  const search = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);
      executeSearch(searchQuery);
    },
    [setQuery, executeSearch]
  );

  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
    setProgress(INITIAL_PROGRESS);
  }, []);

  // Execute search when initialQuery changes or on fresh mount with a query
  useEffect(() => {
    // On fresh mount, always execute search if we have an initialQuery
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (initialQuery != null && initialQuery !== '') {
        lastSearchedQueryRef.current = initialQuery;
        executeSearch(initialQuery);
      }
      return;
    }

    // After initialization, only execute when initialQuery actually changes
    if (
      initialQuery != null &&
      initialQuery !== '' &&
      initialQuery !== lastSearchedQueryRef.current
    ) {
      lastSearchedQueryRef.current = initialQuery;
      executeSearch(initialQuery);
    } else if (
      (initialQuery == null || initialQuery === '') &&
      lastSearchedQueryRef.current != null
    ) {
      lastSearchedQueryRef.current = undefined;
      setResults(null);
    }
  }, [initialQuery, executeSearch]);

  return {
    query: queryValue,
    setQuery,
    results,
    isLoading,
    error,
    progress,
    search,
    clearResults,
    abort,
  };
}

/**
 * Hook for streaming manga search with real-time progress updates.
 * Uses Server-Sent Events (SSE) to receive progress from the API.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { env } from '../../../config/env';
import type {
  SearchResult,
  SearchProgressEvent,
  StreamingSearchProgress,
  ParsedQuery,
} from '../types';

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
    default:
      return null;
  }
}

export function useStreamingSearch(options: UseStreamingSearchOptions = {}): UseStreamingSearchResult {
  const { initialQuery, homeLibrary, onQueryChange } = options;
  
  const [query, setQueryState] = useState(initialQuery ?? '');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<StreamingSearchProgress>(INITIAL_PROGRESS);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastSearchedQuery = useRef<string | undefined>(undefined);
  const hasInitialized = useRef(false);

  // Sync query input with initialQuery when it changes
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQueryState(initialQuery);
    }
  }, [initialQuery]);

  // Cleanup on unmount - also reset hasInitialized so StrictMode remount works
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Reset so the effect will re-execute search on StrictMode remount
      hasInitialized.current = false;
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

  const executeSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
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
    if (homeLibrary) params.set('homeLibrary', homeLibrary);
    const url = `${env.apiUrl}/manga/search/stream?${params}`;

    // Create EventSource for SSE
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SearchProgressEvent;
        
        // Update progress state
        const currentStep = getCurrentStep(event);
        const message = getProgressMessage(event);
        
        setProgress((prev) => ({
          ...prev,
          status: event.type === 'complete' ? 'complete' : 
                  event.type === 'error' ? 'error' : 'searching',
          currentStep,
          message,
          // Update specific progress fields
          ...(event.type === 'wikipedia:found' && {
            seriesFound: event.seriesTitle,
            volumeCount: event.volumeCount,
          }),
          ...(event.type === 'availability:progress' && {
            availabilityProgress: {
              completed: event.completed,
              total: event.total,
              foundInCatalog: event.foundInCatalog,
            },
          }),
          ...(event.type === 'covers:progress' && {
            coversProgress: {
              completed: event.completed,
              total: event.total,
            },
          }),
        }));
        
        // Handle completion
        if (event.type === 'complete') {
          setResults(event.result);
          setIsLoading(false);
          eventSource.close();
          eventSourceRef.current = null;
        }
        
        // Handle error
        if (event.type === 'error') {
          setError(event.message);
          setIsLoading(false);
          eventSource.close();
          eventSourceRef.current = null;
        }
      } catch (parseError) {
        console.error('Failed to parse SSE event:', parseError);
      }
    };

    eventSource.onerror = () => {
      // EventSource will auto-reconnect on error, so we need to close it
      eventSource.close();
      eventSourceRef.current = null;
      
      // Only set error if we haven't received a complete event
      if (isLoading) {
        setError('Connection lost. Please try again.');
        setIsLoading(false);
        setProgress((prev) => ({
          ...prev,
          status: 'error',
          message: 'Connection lost',
        }));
      }
    };
  }, [homeLibrary, isLoading]);

  // Execute search when initialQuery changes (URL navigation) or on fresh mount with a query
  useEffect(() => {
    // On fresh mount, always execute search if we have an initialQuery
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      if (initialQuery) {
        lastSearchedQuery.current = initialQuery;
        executeSearch(initialQuery);
      }
      return;
    }
    
    // After initialization, only execute when initialQuery actually changes
    if (initialQuery && initialQuery !== lastSearchedQuery.current) {
      lastSearchedQuery.current = initialQuery;
      executeSearch(initialQuery);
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
    lastSearchedQuery.current = searchQuery;
    executeSearch(searchQuery);
  }, [onQueryChange, executeSearch]);

  const clearResults = useCallback(() => {
    abort();
    setQueryState('');
    setResults(null);
    setError(null);
    lastSearchedQuery.current = undefined;
    onQueryChange?.('');
  }, [abort, onQueryChange]);

  return {
    query,
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

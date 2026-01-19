/**
 * Hook for managing autocomplete suggestions.
 *
 * Features:
 * - Pre-loads popular manga on mount for instant local filtering
 * - Debounced API search for obscure titles (300ms, min 2 chars)
 * - Recent searches stored in localStorage/AsyncStorage
 * - Merges local + API results, deduplicating by AniList ID
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getPopularManga, getSuggestions } from '../services/mangaApi';
import { storage } from '../../storage/storage';
import type { SuggestionItem } from '../types';

const RECENT_SEARCHES_KEY = 'nc-cardinal-manga:recent-searches';
const MAX_RECENT_SEARCHES = 10;
const DEBOUNCE_MS = 300;
const MIN_CHARS_FOR_API = 2;

export interface UseAutocompleteOptions {
  /** Maximum number of suggestions to show */
  maxSuggestions?: number | undefined;
}

export interface UseAutocompleteResult {
  /** Current suggestions to display (filtered local + API results) */
  suggestions: SuggestionItem[];
  /** Whether suggestions are being loaded from API */
  isLoading: boolean;
  /** Recent searches stored locally */
  recentSearches: string[];
  /** Whether the popular list has been loaded */
  isPopularLoaded: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Update the search query (triggers filtering/API search) */
  setQuery: (query: string) => void;
  /** Clear suggestions */
  clearSuggestions: () => void;
  /** Add a search to recent history */
  addRecentSearch: (query: string) => void;
  /** Remove a search from recent history */
  removeRecentSearch: (query: string) => void;
  /** Clear all recent searches */
  clearRecentSearches: () => void;
}

/**
 * Filter local suggestions by query (case-insensitive prefix/substring match)
 */
function filterLocalSuggestions(
  items: SuggestionItem[],
  query: string,
  limit: number
): SuggestionItem[] {
  const lowerQuery = query.toLowerCase().trim();
  if (lowerQuery === '') return [];

  // Score items: exact prefix match > word prefix match > substring match
  const scored = items.map((item) => {
    const lowerTitle = item.title.toLowerCase();
    const lowerRomaji = item.titleRomaji.toLowerCase();

    let score = 0;

    // Exact prefix match on English title - highest priority
    if (lowerTitle.startsWith(lowerQuery)) {
      score = 100;
    }
    // Exact prefix match on Romaji title
    else if (lowerRomaji.startsWith(lowerQuery)) {
      score = 90;
    }
    // Word prefix match (e.g., "piece" matches "One Piece")
    else if (
      lowerTitle.split(/\s+/).some((word) => word.startsWith(lowerQuery)) ||
      lowerRomaji.split(/\s+/).some((word) => word.startsWith(lowerQuery))
    ) {
      score = 70;
    }
    // Substring match
    else if (lowerTitle.includes(lowerQuery) || lowerRomaji.includes(lowerQuery)) {
      score = 50;
    }

    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

/**
 * Merge local and API suggestions, deduplicating by AniList ID
 */
function mergeSuggestions(
  local: SuggestionItem[],
  api: SuggestionItem[],
  limit: number
): SuggestionItem[] {
  const seenIds = new Set<number>();
  const result: SuggestionItem[] = [];

  // Add local first (higher priority)
  for (const item of local) {
    if (!seenIds.has(item.anilistId) && result.length < limit) {
      seenIds.add(item.anilistId);
      result.push(item);
    }
  }

  // Add API results that aren't duplicates
  for (const item of api) {
    if (!seenIds.has(item.anilistId) && result.length < limit) {
      seenIds.add(item.anilistId);
      result.push(item);
    }
  }

  return result;
}

export function useAutocomplete(
  options: UseAutocompleteOptions = {}
): UseAutocompleteResult {
  const { maxSuggestions = 8 } = options;

  // State
  const [popularList, setPopularList] = useState<SuggestionItem[]>([]);
  const [isPopularLoaded, setIsPopularLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Refs for debouncing
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentQueryRef = useRef<string>('');

  // Load popular manga on mount
  useEffect(() => {
    let cancelled = false;

    async function loadPopular() {
      try {
        const items = await getPopularManga();
        if (!cancelled) {
          setPopularList(items);
          setIsPopularLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load popular manga:', err);
          setError('Failed to load suggestions');
          setIsPopularLoaded(true); // Still mark as loaded so UI can proceed
        }
      }
    }

    void loadPopular();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load recent searches on mount
  useEffect(() => {
    async function loadRecent() {
      try {
        const stored = await Promise.resolve(storage.getItem(RECENT_SEARCHES_KEY));
        if (stored != null && stored !== '') {
          const parsed = JSON.parse(stored) as string[];
          if (Array.isArray(parsed)) {
            setRecentSearches(parsed);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    void loadRecent();
  }, []);

  // Save recent searches when they change
  const saveRecentSearches = useCallback((searches: string[]) => {
    setRecentSearches(searches);
    void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  }, []);

  const addRecentSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed === '') return;

      setRecentSearches((prev) => {
        // Remove if exists, then add to front
        const filtered = prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
        const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const removeRecentSearch = useCallback(
    (query: string) => {
      setRecentSearches((prev) => {
        const updated = prev.filter((s) => s !== query);
        void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const clearRecentSearches = useCallback(() => {
    saveRecentSearches([]);
  }, [saveRecentSearches]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    currentQueryRef.current = '';
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const setQuery = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      currentQueryRef.current = trimmed;

      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // If query is empty, clear suggestions
      if (trimmed === '') {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      // Filter local results immediately
      const localResults = filterLocalSuggestions(popularList, trimmed, maxSuggestions);
      setSuggestions(localResults);

      // If query is long enough, schedule API search
      if (trimmed.length >= MIN_CHARS_FOR_API) {
        setIsLoading(true);

        debounceTimerRef.current = setTimeout(() => {
          void (async () => {
            try {
              // Only proceed if query hasn't changed
              if (currentQueryRef.current !== trimmed) return;

              const apiResults = await getSuggestions(trimmed, { limit: maxSuggestions });

              // Only update if query still matches
              if (currentQueryRef.current === trimmed) {
                const merged = mergeSuggestions(localResults, apiResults, maxSuggestions);
                setSuggestions(merged);
              }
            } catch (err) {
              console.error('Suggestion API error:', err);
              // Keep showing local results on API error
            } finally {
              if (currentQueryRef.current === trimmed) {
                setIsLoading(false);
              }
            }
          })();
        }, DEBOUNCE_MS);
      } else {
        setIsLoading(false);
      }
    },
    [popularList, maxSuggestions]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    suggestions,
    isLoading,
    recentSearches,
    isPopularLoaded,
    error,
    setQuery,
    clearSuggestions,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
  };
}

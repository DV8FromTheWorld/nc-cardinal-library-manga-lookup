/**
 * Hook for fetching popular manga recommendations.
 * Used on the homepage to show recommended series instead of hardcoded suggestions.
 */

import { useState, useEffect } from 'react';
import { getPopularManga } from '../services/mangaApi';
import type { SuggestionItem } from '../types';

const MAX_RECOMMENDATIONS = 16;

// Fallback suggestions if API fails
const FALLBACK_SUGGESTIONS = [
  'Demon Slayer',
  'One Piece',
  'My Hero Academia',
  'Spy x Family',
];

export interface UseRecommendationsResult {
  /** Recommended manga items with cover images */
  items: SuggestionItem[];
  /** Whether the recommendations are currently loading */
  isLoading: boolean;
  /** Error message if fetch failed (null on success) */
  error: string | null;
  /** Fallback text suggestions to use if items are empty */
  fallbackSuggestions: string[];
}

/**
 * Fetches popular manga recommendations from the API.
 * Returns loading state, items, and fallback suggestions.
 */
export function useRecommendations(): UseRecommendationsResult {
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRecommendations() {
      try {
        setIsLoading(true);
        setError(null);

        const allItems = await getPopularManga();
        
        if (cancelled) return;

        // Limit to max recommendations for homepage display
        // Filter to only MANGA format (not NOVEL or ONE_SHOT) for cleaner display
        const mangaOnly = allItems.filter(item => item.format === 'MANGA');
        setItems(mangaOnly.slice(0, MAX_RECOMMENDATIONS));
      } catch (err) {
        if (cancelled) return;
        
        const message = err instanceof Error ? err.message : 'Failed to load recommendations';
        console.error('[useRecommendations] Error:', message);
        setError(message);
        setItems([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchRecommendations();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    items,
    isLoading,
    error,
    fallbackSuggestions: FALLBACK_SUGGESTIONS,
  };
}

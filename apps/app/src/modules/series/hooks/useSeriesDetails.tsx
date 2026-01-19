/**
 * Hook for fetching series details.
 */

import { useCallback, useEffect, useState } from 'react';

import { getSeriesDetails } from '../../search/services/mangaApi';
import type { SeriesDetails } from '../../search/types';

export interface UseSeriesDetailsOptions {
  seriesId: string;
  homeLibrary?: string | undefined;
}

export interface UseSeriesDetailsResult {
  series: SeriesDetails | null;
  isLoading: boolean;
  error: string | null;
  refreshWithDebug: () => void;
}

export function useSeriesDetails(options: UseSeriesDetailsOptions): UseSeriesDetailsResult {
  const { seriesId, homeLibrary } = options;

  const [series, setSeries] = useState<SeriesDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeries = useCallback(
    async (debug = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getSeriesDetails(seriesId, { debug, homeLibrary });
        setSeries(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load series');
      } finally {
        setIsLoading(false);
      }
    },
    [seriesId, homeLibrary]
  );

  useEffect(() => {
    void fetchSeries(false);
  }, [fetchSeries]);

  const refreshWithDebug = useCallback(() => {
    void fetchSeries(true);
  }, [fetchSeries]);

  return {
    series,
    isLoading,
    error,
    refreshWithDebug,
  };
}

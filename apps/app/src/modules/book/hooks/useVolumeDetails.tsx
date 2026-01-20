/**
 * Hook for fetching volume details by entity ID.
 */

import { useEffect, useState } from 'react';

import { getVolumeDetails } from '../../search/services/mangaApi';
import type { Volume } from '../../search/types';

export interface UseVolumeDetailsOptions {
  volumeId: string;
  homeLibrary?: string | undefined;
}

export interface UseVolumeDetailsResult {
  volume: Volume | null;
  isLoading: boolean;
  error: string | null;
}

export function useVolumeDetails(options: UseVolumeDetailsOptions): UseVolumeDetailsResult {
  const { volumeId, homeLibrary } = options;

  const [volume, setVolume] = useState<Volume | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVolume() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getVolumeDetails(volumeId, { homeLibrary });
        setVolume(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load volume');
      } finally {
        setIsLoading(false);
      }
    }

    void fetchVolume();
  }, [volumeId, homeLibrary]);

  return {
    volume,
    isLoading,
    error,
  };
}

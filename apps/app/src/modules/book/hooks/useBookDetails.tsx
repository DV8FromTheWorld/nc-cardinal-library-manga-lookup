/**
 * Hook for fetching book details.
 */

import { useState, useEffect } from 'react';
import { getBookDetails } from '../../search/services/mangaApi';
import type { BookDetails } from '../../search/types';

export interface UseBookDetailsOptions {
  isbn: string;
  homeLibrary?: string | undefined;
}

export interface UseBookDetailsResult {
  book: BookDetails | null;
  isLoading: boolean;
  error: string | null;
}

export function useBookDetails(options: UseBookDetailsOptions): UseBookDetailsResult {
  const { isbn, homeLibrary } = options;
  
  const [book, setBook] = useState<BookDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBook() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getBookDetails(isbn, { homeLibrary });
        setBook(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load book');
      } finally {
        setIsLoading(false);
      }
    }

    fetchBook();
  }, [isbn, homeLibrary]);

  return {
    book,
    isLoading,
    error,
  };
}

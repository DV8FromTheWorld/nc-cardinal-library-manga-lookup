/**
 * Manga API client for fetching search results, series details, and book details.
 */

import { env } from '../../../config/env';
import type {
  SearchResult,
  SeriesDetails,
  BookDetails,
  LibrariesResponse,
  ApiError,
  SuggestionsResponse,
  SuggestionItem,
} from '../types';

export class MangaApiError extends Error {
  constructor(
    public status: number,
    public apiError: ApiError
  ) {
    super(apiError.message ?? apiError.error);
    this.name = 'MangaApiError';
  }
}

async function fetchApi<T>(endpoint: string): Promise<T> {
  const url = `${env.apiUrl}${endpoint}`;
  
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    // Network error - CORS, offline, server unreachable, etc.
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Failed to fetch') {
      throw new Error(
        `Unable to connect to the API server at ${env.apiUrl}. ` +
        'This may be a network issue or CORS error. ' +
        'If accessing from another device, ensure the API allows cross-origin requests.'
      );
    }
    throw new Error(`Network error: ${message}`);
  }
  
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned invalid response (${response.status} ${response.statusText})`);
  }
  
  if (!response.ok) {
    throw new MangaApiError(response.status, data as ApiError);
  }
  
  return data as T;
}

/**
 * Get list of available libraries for home library selection
 */
export async function getLibraries(): Promise<LibrariesResponse> {
  return fetchApi<LibrariesResponse>('/manga/libraries');
}

/**
 * Search for manga series and volumes
 */
export async function searchManga(
  query: string, 
  options: { debug?: boolean | undefined; homeLibrary?: string | undefined } = {}
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query });
  if (options.debug) params.set('debug', 'true');
  if (options.homeLibrary) params.set('homeLibrary', options.homeLibrary);
  return fetchApi<SearchResult>(`/manga/search?${params}`);
}

/**
 * Get detailed series information with all volumes
 */
export async function getSeriesDetails(
  seriesId: string, 
  options: { debug?: boolean | undefined; homeLibrary?: string | undefined } = {}
): Promise<SeriesDetails> {
  const encoded = encodeURIComponent(seriesId);
  const params = new URLSearchParams();
  if (options.debug) params.set('debug', 'true');
  if (options.homeLibrary) params.set('homeLibrary', options.homeLibrary);
  const queryString = params.toString();
  return fetchApi<SeriesDetails>(`/manga/series/${encoded}${queryString ? `?${queryString}` : ''}`);
}

/**
 * Get volume details by entity ID
 */
export async function getVolumeDetails(
  volumeId: string, 
  options: { homeLibrary?: string | undefined } = {}
): Promise<BookDetails> {
  const encoded = encodeURIComponent(volumeId);
  const params = new URLSearchParams();
  if (options.homeLibrary) params.set('homeLibrary', options.homeLibrary);
  const queryString = params.toString();
  return fetchApi<BookDetails>(`/manga/volumes/${encoded}${queryString ? `?${queryString}` : ''}`);
}

/**
 * Get book details by ISBN (legacy - prefer getVolumeDetails)
 */
export async function getBookDetails(
  isbn: string, 
  options: { homeLibrary?: string | undefined } = {}
): Promise<BookDetails> {
  const params = new URLSearchParams();
  if (options.homeLibrary) params.set('homeLibrary', options.homeLibrary);
  const queryString = params.toString();
  return fetchApi<BookDetails>(`/manga/books/${isbn}${queryString ? `?${queryString}` : ''}`);
}

// ============================================================================
// Autocomplete/Suggestions
// ============================================================================

/**
 * Get popular manga for autocomplete suggestions.
 * Returns top titles by popularity + trending from AniList.
 */
export async function getPopularManga(): Promise<SuggestionItem[]> {
  const response = await fetchApi<SuggestionsResponse>('/manga/popular');
  return response.items;
}

/**
 * Search manga for autocomplete suggestions.
 * Uses AniList search API.
 */
export async function getSuggestions(
  query: string,
  options: { limit?: number | undefined } = {}
): Promise<SuggestionItem[]> {
  const params = new URLSearchParams({ q: query });
  if (options.limit) params.set('limit', options.limit.toString());
  const response = await fetchApi<SuggestionsResponse>(`/manga/suggestions?${params}`);
  return response.items;
}

// ============================================================================
// Cache Management
// ============================================================================

export interface CacheStats {
  type: string;
  entryCount: number;
  totalSizeBytes: number;
}

export interface AllCacheStats {
  caches: CacheStats[];
  totalEntries: number;
  totalSizeBytes: number;
}

export interface CacheClearResult {
  success: boolean;
  deletedCount: number;
  deletedFiles?: string[] | undefined;
  message?: string | undefined;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<AllCacheStats> {
  return fetchApi<AllCacheStats>('/manga/cache/stats');
}

/**
 * Clear all caches
 */
export async function clearAllCache(): Promise<CacheClearResult> {
  const url = `${env.apiUrl}/manga/cache`;
  const response = await fetch(url, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) {
    throw new MangaApiError(response.status, data as ApiError);
  }
  return data as CacheClearResult;
}

/**
 * Clear cache for a specific type
 */
export async function clearCacheByType(type: 'wikipedia' | 'google-books' | 'bookcover' | 'nc-cardinal'): Promise<CacheClearResult> {
  const url = `${env.apiUrl}/manga/cache/type/${type}`;
  const response = await fetch(url, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) {
    throw new MangaApiError(response.status, data as ApiError);
  }
  return data as CacheClearResult;
}

/**
 * Clear cache for a specific book (ISBN)
 */
export async function clearCacheForBook(isbn: string): Promise<CacheClearResult> {
  const url = `${env.apiUrl}/manga/cache/book/${isbn}`;
  const response = await fetch(url, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) {
    throw new MangaApiError(response.status, data as ApiError);
  }
  return data as CacheClearResult;
}

/**
 * Clear cache for a specific series
 */
export async function clearCacheForSeries(seriesId: string): Promise<CacheClearResult> {
  const url = `${env.apiUrl}/manga/cache/series/${encodeURIComponent(seriesId)}`;
  const response = await fetch(url, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) {
    throw new MangaApiError(response.status, data as ApiError);
  }
  return data as CacheClearResult;
}

/**
 * Clear cache for a specific search query
 */
export async function clearCacheForSearch(query: string): Promise<CacheClearResult> {
  const url = `${env.apiUrl}/manga/cache/search/${encodeURIComponent(query)}`;
  const response = await fetch(url, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) {
    throw new MangaApiError(response.status, data as ApiError);
  }
  return data as CacheClearResult;
}

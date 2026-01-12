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
  
  const response = await fetch(url);
  const data = await response.json();
  
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
  seriesSlug: string, 
  options: { debug?: boolean | undefined; homeLibrary?: string | undefined } = {}
): Promise<SeriesDetails> {
  const encoded = encodeURIComponent(seriesSlug);
  const params = new URLSearchParams();
  if (options.debug) params.set('debug', 'true');
  if (options.homeLibrary) params.set('homeLibrary', options.homeLibrary);
  const queryString = params.toString();
  return fetchApi<SeriesDetails>(`/manga/series/${encoded}${queryString ? `?${queryString}` : ''}`);
}

/**
 * Get book details by ISBN
 */
export async function getBookDetails(
  isbn: string, 
  options: { slug?: string | undefined; homeLibrary?: string | undefined } = {}
): Promise<BookDetails> {
  const path = options.slug 
    ? `/manga/books/${isbn}/${encodeURIComponent(options.slug)}` 
    : `/manga/books/${isbn}`;
  const params = new URLSearchParams();
  if (options.homeLibrary) params.set('homeLibrary', options.homeLibrary);
  const queryString = params.toString();
  return fetchApi<BookDetails>(`${path}${queryString ? `?${queryString}` : ''}`);
}

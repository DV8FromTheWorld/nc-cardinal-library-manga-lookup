/**
 * Manga API Client
 * 
 * Type-safe client for the manga search API endpoints.
 */

import { env } from '../config/env';

// ============================================================================
// Types (matching the API response schemas)
// ============================================================================

export interface VolumeAvailability {
  available: boolean;
  notInCatalog?: boolean;
  totalCopies: number;
  availableCopies: number;
  checkedOutCopies?: number;
  inTransitCopies?: number;
  libraries: string[];
  // Local vs remote breakdown
  localCopies?: number;
  localAvailable?: number;
  remoteCopies?: number;
  remoteAvailable?: number;
  catalogUrl?: string;
}

export interface VolumeInfo {
  volumeNumber: number;
  title?: string;
  isbn?: string;
  coverImage?: string;
  availability?: VolumeAvailability;
}

export interface DebugInfo {
  sources: string[];
  timing: {
    total: number;
    wikipedia?: number;
    googleBooks?: number;
    ncCardinal?: number;
  };
  errors: string[];
  warnings: string[];
  cacheHits: string[];
}

export interface SeriesResult {
  id: string;
  slug: string;
  title: string;
  totalVolumes: number;
  availableVolumes: number;
  isComplete: boolean;
  author?: string;
  coverImage?: string;
  source: 'wikipedia' | 'google-books';
  volumes?: VolumeInfo[];
}

export interface VolumeResult {
  title: string;
  volumeNumber?: number;
  seriesTitle?: string;
  isbn?: string;
  coverImage?: string;
  availability?: VolumeAvailability;
  source: 'wikipedia' | 'google-books' | 'nc-cardinal';
}

export interface ParsedQuery {
  originalQuery: string;
  title: string;
  volumeNumber?: number;
}

export interface BestMatch {
  type: 'series' | 'volume';
  series?: SeriesResult;
  volume?: VolumeResult;
}

export interface SearchResult {
  query: string;
  parsedQuery: ParsedQuery;
  series: SeriesResult[];
  volumes: VolumeResult[];
  bestMatch?: BestMatch;
  _debug?: DebugInfo;
}

export interface SeriesDetails {
  id: string;
  slug: string;
  title: string;
  totalVolumes: number;
  isComplete: boolean;
  author?: string;
  coverImage?: string;
  volumes: VolumeInfo[];
  availableCount: number;
  missingVolumes: number[];
  relatedSeries?: string[];
  _debug?: DebugInfo;
}

export interface Holding {
  libraryCode: string;
  libraryName: string;
  location: string;
  callNumber: string;
  status: string;
  barcode?: string;
  available: boolean;
}

export interface BookDetails {
  id: string;
  title: string;
  authors: string[];
  isbns: string[];
  subjects: string[];
  summary?: string;
  coverImage?: string;
  holdings: Holding[];
  availability: {
    available: boolean;
    notInCatalog?: boolean;
    totalCopies: number;
    availableCopies: number;
    checkedOutCopies?: number;
    libraries: string[];
    // Local vs remote breakdown
    localCopies?: number;
    localAvailable?: number;
    remoteCopies?: number;
    remoteAvailable?: number;
  };
  seriesInfo?: {
    title: string;
    volumeNumber?: number;
  };
  catalogUrl?: string;
}

// Library info for home library selection
export interface Library {
  code: string;
  name: string;
}

export interface LibrariesResponse {
  libraries: Library[];
  defaultLibrary: string;
}

export interface ApiError {
  error: string;
  message?: string;
}

// ============================================================================
// API Client
// ============================================================================

class MangaApiError extends Error {
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
  options: { debug?: boolean; homeLibrary?: string } = {}
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
  options: { debug?: boolean; homeLibrary?: string } = {}
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
  options: { slug?: string; homeLibrary?: string } = {}
): Promise<BookDetails> {
  const path = options.slug 
    ? `/manga/books/${isbn}/${encodeURIComponent(options.slug)}` 
    : `/manga/books/${isbn}`;
  const params = new URLSearchParams();
  if (options.homeLibrary) params.set('homeLibrary', options.homeLibrary);
  const queryString = params.toString();
  return fetchApi<BookDetails>(`${path}${queryString ? `?${queryString}` : ''}`);
}

export { MangaApiError };

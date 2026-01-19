/**
 * Types for the manga search feature.
 * Matches the API response schemas.
 */

export type EditionFormat = 'digital' | 'physical';
export type EditionLanguage = 'ja' | 'en';

/**
 * A specific published edition of a volume.
 */
export interface Edition {
  isbn: string;
  format: EditionFormat;
  language: EditionLanguage;
  releaseDate?: string | undefined;
}

/**
 * VolumeStatus is derived on the frontend from editions array.
 * NOT sent from API - computed client-side.
 */
export enum VolumeStatus {
  JapanOnly = 'japan_only',      // No English edition exists
  Upcoming = 'upcoming',          // English edition exists, release date in future
  DigitalOnly = 'digital_only',   // Only digital English available  
  Released = 'released',          // Physical English released
}

export interface VolumeAvailability {
  available: boolean;
  notInCatalog?: boolean | undefined;
  totalCopies: number;
  availableCopies: number;
  checkedOutCopies?: number | undefined;
  inTransitCopies?: number | undefined;
  onOrderCopies?: number | undefined;
  onHoldCopies?: number | undefined;
  unavailableCopies?: number | undefined;
  libraries: string[];
  localCopies?: number | undefined;
  localAvailable?: number | undefined;
  remoteCopies?: number | undefined;
  remoteAvailable?: number | undefined;
  catalogUrl?: string | undefined;
}

export interface VolumeInfo {
  id: string;  // Volume entity ID (required)
  volumeNumber: number;
  title?: string | undefined;
  editions: Edition[];  // All known editions
  primaryIsbn?: string | undefined;  // First English physical ISBN for library lookups
  coverImage?: string | undefined;
  availability?: VolumeAvailability | undefined;
}

export interface SourceSummary {
  wikipedia?: {
    found: boolean;
    volumeCount?: number | undefined;
    seriesTitle?: string | undefined;
    error?: string | undefined;
  } | undefined;
  googleBooks?: {
    found: boolean;
    totalItems?: number | undefined;
    volumesReturned?: number | undefined;
    volumesWithSeriesId?: number | undefined;
    seriesCount?: number | undefined;
    error?: string | undefined;
  } | undefined;
  ncCardinal?: {
    found: boolean;
    recordCount?: number | undefined;
    volumesExtracted?: number | undefined;
    error?: string | undefined;
  } | undefined;
}

export interface DebugInfo {
  sources: string[];
  timing: {
    total: number;
    wikipedia?: number | undefined;
    googleBooks?: number | undefined;
    ncCardinal?: number | undefined;
  };
  errors: string[];
  warnings: string[];
  cacheHits: string[];
  log: string[];
  dataIssues: string[];
  sourceSummary: SourceSummary;
}

export type MediaType = 'manga' | 'light_novel' | 'unknown';
export type SeriesRelationship = 'adaptation' | 'spinoff' | 'sequel' | 'side_story' | 'anthology' | 'prequel';

export interface SeriesResult {
  /** Entity ID (e.g., "s_V1StGXR8Z") - stable across data source updates */
  id: string;
  title: string;
  totalVolumes: number;
  availableVolumes: number;
  isComplete: boolean;
  author?: string | undefined;
  coverImage?: string | undefined;
  source: 'wikipedia' | 'google-books' | 'nc-cardinal';
  volumes?: VolumeInfo[] | undefined;
  /** Media type: manga, light_novel, or unknown */
  mediaType?: MediaType | undefined;
  /** Relationship to parent series (for spin-offs, sequels, etc.) */
  relationship?: SeriesRelationship | undefined;
}

export interface VolumeResult {
  id: string;  // Volume entity ID (required)
  title: string;
  volumeNumber?: number | undefined;
  seriesTitle?: string | undefined;
  isbn?: string | undefined;
  coverImage?: string | undefined;
  availability?: VolumeAvailability | undefined;
  source: 'wikipedia' | 'google-books' | 'nc-cardinal';
}

export interface ParsedQuery {
  originalQuery: string;
  title: string;
  volumeNumber?: number | undefined;
}

export interface BestMatch {
  type: 'series' | 'volume';
  series?: SeriesResult | undefined;
  volume?: VolumeResult | undefined;
}

export interface SearchResult {
  query: string;
  parsedQuery: ParsedQuery;
  series: SeriesResult[];
  volumes: VolumeResult[];
  bestMatch?: BestMatch | undefined;
  _debug?: DebugInfo | undefined;
}

export interface SeriesDetails {
  /** Entity ID (e.g., "s_V1StGXR8Z") - stable across data source updates */
  id: string;
  title: string;
  /** Series description/preamble from Vol 1 */
  description?: string | undefined;
  totalVolumes: number;
  isComplete: boolean;
  author?: string | undefined;
  coverImage?: string | undefined;
  volumes: VolumeInfo[];
  availableCount: number;
  missingVolumes: number[];
  relatedSeries?: string[] | undefined;
  _debug?: DebugInfo | undefined;
}

export interface Holding {
  libraryCode: string;
  libraryName: string;
  location: string;
  callNumber: string;
  status: string;
  barcode?: string | undefined;
  available: boolean;
}

export interface BookDetails {
  id: string;
  title: string;
  authors: string[];
  isbns: string[];
  subjects: string[];
  summary?: string | undefined;
  coverImage?: string | undefined;
  holdings: Holding[];
  availability: {
    available: boolean;
    notInCatalog?: boolean | undefined;
    totalCopies: number;
    availableCopies: number;
    checkedOutCopies?: number | undefined;
    libraries: string[];
    localCopies?: number | undefined;
    localAvailable?: number | undefined;
    remoteCopies?: number | undefined;
    remoteAvailable?: number | undefined;
  };
  seriesInfo?: {
    id?: string | undefined; // Entity ID for navigation
    title: string;
    volumeNumber?: number | undefined;
  } | undefined;
  catalogUrl?: string | undefined;
}

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
  message?: string | undefined;
}

// ============================================================================
// Streaming Search Progress Types
// ============================================================================

/**
 * Events sent during a streaming search to indicate progress.
 * Uses Server-Sent Events (SSE) format.
 */
export type SearchProgressEvent =
  | { type: 'started'; query: string; parsedQuery: ParsedQuery }
  | { type: 'wikipedia:searching' }
  | { type: 'wikipedia:found'; seriesTitle: string; volumeCount: number }
  | { type: 'wikipedia:not-found'; fallback: 'nc-cardinal' }
  | { type: 'wikipedia:error'; message: string }
  | { type: 'nc-cardinal:searching' }
  | { type: 'nc-cardinal:found'; recordCount: number }
  | { type: 'availability:start'; total: number }
  | { type: 'availability:progress'; completed: number; total: number; foundInCatalog: number }
  | { type: 'availability:complete'; foundInCatalog: number; total: number }
  | { type: 'covers:start'; total: number }
  | { type: 'covers:progress'; completed: number; total: number }
  | { type: 'covers:complete' }
  | { type: 'complete'; result: SearchResult }
  | { type: 'error'; message: string };

/**
 * Current state of a streaming search, derived from progress events.
 */
export interface StreamingSearchProgress {
  status: 'idle' | 'searching' | 'complete' | 'error';
  currentStep: 'wikipedia' | 'nc-cardinal' | 'availability' | 'covers' | 'done' | null;
  message: string;
  // Progress details
  seriesFound?: string | undefined;
  volumeCount?: number | undefined;
  availabilityProgress?: { completed: number; total: number; foundInCatalog: number } | undefined;
  coversProgress?: { completed: number; total: number } | undefined;
}

// ============================================================================
// Autocomplete/Suggestions Types
// ============================================================================

/**
 * Format of a suggestion item from AniList.
 */
export type SuggestionFormat = 'MANGA' | 'NOVEL' | 'ONE_SHOT';

/**
 * A suggestion item for the autocomplete dropdown.
 * From AniList API.
 */
export interface SuggestionItem {
  anilistId: number;
  title: string;           // English or Romaji
  titleRomaji: string;
  format: SuggestionFormat;
  volumes: number | null;
  status: string;
  coverUrl: string | null;
}

/**
 * Response from /manga/popular and /manga/suggestions endpoints.
 */
export interface SuggestionsResponse {
  items: SuggestionItem[];
}

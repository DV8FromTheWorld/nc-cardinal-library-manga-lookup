/**
 * Entity types for the manga data layer
 * 
 * These entities provide stable IDs that persist across data source updates.
 * Series get generated IDs, books use ISBN as their ID.
 */

export type MediaType = 'manga' | 'light_novel' | 'artbook' | 'guidebook' | 'unknown';

export type SeriesStatus = 'ongoing' | 'completed' | 'hiatus' | 'unknown';

/**
 * External IDs linking to various data sources
 */
export interface SeriesExternalIds {
  /** Wikipedia page ID (numeric) */
  wikipedia?: number | undefined;
  /** MyAnimeList ID */
  myanimelist?: number | undefined;
  /** AniList ID */
  anilist?: number | undefined;
}

export interface BookExternalIds {
  /** NC Cardinal record ID */
  ncCardinalRecordId?: string | undefined;
  /** Google Books volume ID */
  googleBooksId?: string | undefined;
}

/**
 * A manga/light novel series entity
 */
export interface Series {
  /** Unique ID for this series (generated, e.g., "s_V1StGXR8Z") */
  id: string;
  
  /** Display title */
  title: string;
  
  /** Type of media */
  mediaType: MediaType;
  
  /** Links to external data sources */
  externalIds: SeriesExternalIds;
  
  /** Ordered list of book ISBNs in this series */
  bookIds: string[];
  
  /** Total expected volumes (may be more than bookIds if some volumes lack ISBNs) */
  totalVolumes?: number | undefined;
  
  /** Author name */
  author?: string | undefined;
  
  /** Artist name (if different from author) */
  artist?: string | undefined;
  
  /** Publication status */
  status: SeriesStatus;
  
  /** ISO timestamp when entity was created */
  createdAt: string;
  
  /** ISO timestamp when entity was last updated */
  updatedAt: string;
}

/**
 * A book/volume entity
 */
export interface Book {
  /** ISBN-13 (primary identifier) */
  id: string;
  
  /** Series this book belongs to */
  seriesId: string;
  
  /** Volume number within the series */
  volumeNumber: number;
  
  /** Display title */
  title: string;
  
  /** Type of media */
  mediaType: MediaType;
  
  /** Links to external data sources */
  externalIds: BookExternalIds;
  
  /** ISBN-10 (alternative identifier) */
  isbn10?: string | undefined;
  
  /** Release date (ISO format) */
  releaseDate?: string | undefined;
  
  /** ISO timestamp when entity was created */
  createdAt: string;
  
  /** ISO timestamp when entity was last updated */
  updatedAt: string;
}

/**
 * The complete entity store structure
 */
export interface EntityStore {
  /** All series, keyed by series ID */
  series: Record<string, Series>;
  
  /** All books, keyed by ISBN-13 */
  books: Record<string, Book>;
  
  /** Index: Wikipedia page ID -> Series ID */
  wikipediaIndex: Record<number, string>;
  
  /** Index: Series title (normalized) -> Series ID */
  titleIndex: Record<string, string>;
}

/**
 * Input for creating a new series (without auto-generated fields)
 */
export interface CreateSeriesInput {
  title: string;
  mediaType: MediaType;
  externalIds?: SeriesExternalIds | undefined;
  bookIds?: string[] | undefined;
  totalVolumes?: number | undefined;
  author?: string | undefined;
  artist?: string | undefined;
  status?: SeriesStatus | undefined;
}

/**
 * Input for creating a new book (without auto-generated fields)
 */
export interface CreateBookInput {
  id: string; // ISBN-13
  seriesId: string;
  volumeNumber: number;
  title: string;
  mediaType: MediaType;
  externalIds?: BookExternalIds | undefined;
  isbn10?: string | undefined;
  releaseDate?: string | undefined;
}

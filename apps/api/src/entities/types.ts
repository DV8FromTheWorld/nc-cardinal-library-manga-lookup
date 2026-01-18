/**
 * Entity types for the manga data layer
 * 
 * These entities provide stable IDs that persist across data source updates.
 * Series get generated IDs, volumes get generated IDs with ISBN index for lookups.
 */

export type MediaType = 'manga' | 'light_novel' | 'artbook' | 'guidebook' | 'unknown';

export type SeriesStatus = 'ongoing' | 'completed' | 'hiatus' | 'unknown';

export type SeriesRelationship = 'spinoff' | 'sequel' | 'side_story' | 'anthology' | 'prequel' | 'adaptation';

export type EditionFormat = 'digital' | 'physical';

export type EditionLanguage = 'ja' | 'en';

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

/**
 * A specific published edition of a volume.
 * Each format/language combination gets its own ISBN.
 */
export interface Edition {
  /** ISBN-13 for this edition */
  isbn: string;
  
  /** Physical book or ebook */
  format: EditionFormat;
  
  /** Language of this edition */
  language: EditionLanguage;
  
  /** Release date (ISO format) */
  releaseDate?: string | undefined;
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
  
  /** 
   * Ordered list of Volume IDs in this series.
   * Includes ALL volumes, even Japan-only ones without English ISBNs.
   */
  volumeIds: string[];
  
  /** Author name */
  author?: string | undefined;
  
  /** Artist name (if different from author) */
  artist?: string | undefined;
  
  /** Publication status */
  status: SeriesStatus;
  
  /** IDs of related series (spin-offs, side stories, sequels) */
  relatedSeriesIds?: string[] | undefined;
  
  /** If this is a related series, the parent series ID */
  parentSeriesId?: string | undefined;
  
  /** Relationship type if this is a related series */
  relationship?: SeriesRelationship | undefined;
  
  /** Series description (the common preamble from volume descriptions) */
  description?: string | undefined;
  
  /** ISO timestamp when entity was created */
  createdAt: string;
  
  /** ISO timestamp when entity was last updated */
  updatedAt: string;
}

/**
 * A volume in a series (the creative work, not a specific physical product).
 */
export interface Volume {
  /** Generated ID: "v_abc123" */
  id: string;
  
  /** Series this volume belongs to */
  seriesId: string;
  
  /** Volume number within the series (1, 2, 3...) */
  volumeNumber: number;
  
  /** Display title (e.g., "Goodbye Parakeet, Good Night My Sister") */
  title?: string | undefined;
  
  /** 
   * All known editions of this volume.
   * Can be empty (Japan-only, no ISBN known yet).
   * Can have 1-4+ entries (JP digital, JP physical, EN digital, EN physical).
   */
  editions: Edition[];
  
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
  
  /** All volumes, keyed by volume ID */
  volumes: Record<string, Volume>;
  
  /** 
   * Index from ISBN to Volume ID.
   * Allows lookups like "given ISBN 978-xxx, which volume is this?"
   */
  isbnIndex: Record<string, string>;
  
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
  volumeIds?: string[] | undefined;
  author?: string | undefined;
  artist?: string | undefined;
  status?: SeriesStatus | undefined;
  relatedSeriesIds?: string[] | undefined;
  parentSeriesId?: string | undefined;
  relationship?: SeriesRelationship | undefined;
  description?: string | undefined;
}

/**
 * Input for creating a new volume (without auto-generated fields)
 */
export interface CreateVolumeInput {
  seriesId: string;
  volumeNumber: number;
  title?: string | undefined;
  editions: Edition[];
}

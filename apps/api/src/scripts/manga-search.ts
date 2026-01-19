/**
 * Manga Search Service
 *
 * Unified search orchestrator that combines:
 * - Wikipedia for canonical series data and ISBNs
 * - NC Cardinal for library availability (also fallback when Wikipedia fails)
 * - Bookcover API for cover images
 *
 * NOTE: Google Books was previously used as a fallback but has been disabled.
 * The code is commented out but preserved for potential future use.
 *
 * Features:
 * - Fuzzy search (handles typos, romanized names)
 * - Query parsing (extracts volume numbers)
 * - Series grouping
 * - Volume-level availability
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  getSeries as getWikipediaSeries,
  searchSeries as searchWikipedia,
  type WikiSeries,
  type WikiVolume,
} from './wikipedia-client.js';

import {
  createEntitiesFromWikipedia,
  createEntitiesFromNCCardinal,
  findOrCreateSeriesByTitle,
  detectMediaType,
  getSeriesById,
  getVolumesBySeriesId,
  getVolumeEditionData,
  type Series as EntitySeries,
  type Volume as EntityVolume,
  type EditionData,
  type MediaType,
} from '../entities/index.js';

// DISABLED: Google Books as a data source - relying on Wikipedia only
// import {
//   searchMangaVolumes as searchGoogleBooks,
//   type GoogleBooksSeries,
//   type GoogleBooksVolume,
// } from './google-books-client.js';

import {
  getAvailabilityByISBNs,
  searchCatalog,
  getAvailabilitySummary,
  getDetailedAvailabilitySummary,
  getCatalogUrl,
  type CatalogRecord,
} from './opensearch-client.js';

// ============================================================================
// Types
// ============================================================================

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
  /** Detailed log of what happened during the search */
  log: string[];
  /** Data quality issues detected */
  dataIssues: string[];
  /** Summary of what each source returned */
  sourceSummary: {
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
  };
}

export interface SearchResult {
  query: string;
  parsedQuery: ParsedQuery;
  series: SeriesResult[];
  volumes: VolumeResult[];
  bestMatch?: BestMatch | undefined;
  _debug?: DebugInfo | undefined;
}

export interface ParsedQuery {
  originalQuery: string;
  title: string;
  volumeNumber?: number | undefined;
}

export interface SeriesResult {
  id: string;  // Entity ID (e.g., "s_V1StGXR8Z") - stable across data source updates
  title: string;
  totalVolumes: number;
  availableVolumes: number;
  isComplete: boolean;
  author?: string | undefined;
  coverImage?: string | undefined;
  source: 'wikipedia' | 'google-books' | 'nc-cardinal';
  volumes?: VolumeInfo[] | undefined;
  /** Media type: manga, light_novel, or unknown */
  mediaType?: 'manga' | 'light_novel' | 'unknown' | undefined;
  /** Relationship to parent series (for spin-offs, sequels, etc.) */
  relationship?: 'adaptation' | 'spinoff' | 'sequel' | 'side_story' | 'anthology' | 'prequel' | undefined;
}

export interface VolumeInfo {
  id: string;  // Volume entity ID (required)
  volumeNumber: number;
  title?: string | undefined;
  editions: EditionData[];  // All known editions (JP, EN digital, EN physical)
  primaryIsbn?: string | undefined;  // First English physical ISBN for library lookups
  coverImage?: string | undefined;
  availability?: VolumeAvailability | undefined;
}

export interface VolumeAvailability {
  available: boolean;
  notInCatalog?: boolean | undefined;
  totalCopies: number;
  availableCopies: number;
  checkedOutCopies: number;
  inTransitCopies: number;
  onOrderCopies: number;
  onHoldCopies: number;
  unavailableCopies: number;
  libraries: string[];
  // Local vs remote breakdown
  localCopies?: number | undefined;
  localAvailable?: number | undefined;
  remoteCopies?: number | undefined;
  remoteAvailable?: number | undefined;
  catalogUrl?: string | undefined;
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

export interface BestMatch {
  type: 'series' | 'volume';
  series?: SeriesResult | undefined;
  volume?: VolumeResult | undefined;
}

export interface SeriesDetails {
  id: string;  // Entity ID (e.g., "s_V1StGXR8Z") - stable across data source updates
  title: string;
  description?: string | undefined;  // Series description/preamble from Vol 1
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get cover image URL from various sources
 * Priority: Google Books > Open Library > AniList
 */
// Cache directory for bookcover API results
const BOOKCOVER_CACHE_DIR = path.join(process.cwd(), '.cache', 'bookcover');

// Cache TTLs for cover images
const COVER_CACHE_HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days for successful covers
const COVER_CACHE_MISS_TTL_MS = 24 * 60 * 60 * 1000;     // 24 hours for cache misses

/**
 * Check if a cache file is still valid based on TTL
 * Returns { valid: true, content } if cache is valid
 * Returns { valid: false } if cache is expired or doesn't exist
 */
function checkCacheWithTTL(cacheFile: string): { valid: true; content: string } | { valid: false } {
  if (!fs.existsSync(cacheFile)) {
    return { valid: false };
  }
  
  try {
    const stat = fs.statSync(cacheFile);
    const content = fs.readFileSync(cacheFile, 'utf-8').trim();
    const age = Date.now() - stat.mtimeMs;
    
    // Use different TTLs for hits vs misses
    const ttl = content ? COVER_CACHE_HIT_TTL_MS : COVER_CACHE_MISS_TTL_MS;
    
    if (age > ttl) {
      // Cache expired - delete and return invalid
      fs.unlinkSync(cacheFile);
      return { valid: false };
    }
    
    return { valid: true, content };
  } catch {
    return { valid: false };
  }
}

/**
 * Fetch cover URL from Bookcover API (aggregates Amazon, Google, OpenLibrary, etc.)
 * Results are cached to avoid repeated API calls
 * 
 * Cache TTLs:
 * - Successful covers: 7 days (URLs can become stale)
 * - Cache misses: 24 hours (covers might become available)
 * 
 * NOTE: The Bookcover API can take 25+ seconds to return "not found" because it
 * searches multiple sources. We use a 5-second timeout since successful responses
 * typically come back in <1 second.
 */
export async function fetchBookcoverUrl(isbn: string): Promise<string | null> {
  // Ensure cache directory exists
  if (!fs.existsSync(BOOKCOVER_CACHE_DIR)) {
    fs.mkdirSync(BOOKCOVER_CACHE_DIR, { recursive: true });
  }

  const cacheFile = path.join(BOOKCOVER_CACHE_DIR, `${isbn}.txt`);
  
  // Check cache first (with TTL)
  const cached = checkCacheWithTTL(cacheFile);
  if (cached.valid) {
    return cached.content || null;
  }

  try {
    // Use a 5-second timeout - successful responses are usually <1 second
    // If it takes longer, it's likely going to return "not found" after 25+ seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`https://bookcover.longitood.com/bookcover/${isbn}`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      fs.writeFileSync(cacheFile, ''); // Cache the miss
      return null;
    }
    
    const data = await response.json() as { url?: string };
    const url = data.url ?? null;
    
    // Cache the result (empty string for misses)
    fs.writeFileSync(cacheFile, url ?? '');
    return url;
  } catch {
    // On timeout or error, don't cache - might succeed next time
    return null;
  }
}

/**
 * Batch fetch cover URLs for multiple ISBNs
 */
async function fetchBookcoverUrls(isbns: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Fetch in parallel with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < isbns.length; i += CONCURRENCY) {
    const batch = isbns.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (isbn) => {
      const url = await fetchBookcoverUrl(isbn);
      if (url) {
        results.set(isbn, url);
      }
    });
    await Promise.all(promises);
  }
  
  return results;
}

// ============================================================================
// Google Books Cover Fetching (with placeholder detection)
// ============================================================================

const GOOGLE_BOOKS_CACHE_DIR = path.join(process.cwd(), '.cache', 'google-books-covers');

/**
 * Fetch cover URL from Google Books API
 * Returns null if book not found or if cover is a placeholder (grayscale PNG)
 * 
 * Cache TTLs:
 * - Successful covers: 7 days (URLs can become stale)
 * - Cache misses: 24 hours (covers might become available)
 * 
 * Detection: Google Books returns grayscale PNG images (128x170, 1269 bytes) 
 * when no cover is available. Real covers are always JPEGs.
 */
export async function fetchGoogleBooksCoverUrl(isbn: string): Promise<string | null> {
  // Ensure cache directory exists
  if (!fs.existsSync(GOOGLE_BOOKS_CACHE_DIR)) {
    fs.mkdirSync(GOOGLE_BOOKS_CACHE_DIR, { recursive: true });
  }

  const cacheFile = path.join(GOOGLE_BOOKS_CACHE_DIR, `${isbn}.txt`);
  
  // Check cache first (with TTL)
  const cached = checkCacheWithTTL(cacheFile);
  if (cached.valid) {
    return cached.content || null;
  }

  try {
    // Step 1: Get book info from Google Books API
    const searchResponse = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
    );
    if (!searchResponse.ok) {
      fs.writeFileSync(cacheFile, '');
      return null;
    }

    const searchData = await searchResponse.json() as { 
      items?: Array<{ 
        id: string;
        volumeInfo?: { imageLinks?: { thumbnail?: string } };
      }>;
    };
    
    const book = searchData.items?.[0];
    if (!book?.volumeInfo?.imageLinks?.thumbnail) {
      fs.writeFileSync(cacheFile, '');
      return null;
    }

    // Step 2: Check if the image is a placeholder by doing a HEAD request
    // IMPORTANT: Must check zoom=2 because Google Books can return JPEG at zoom=1 but PNG at zoom=2
    // (placeholder images are PNG, real covers are JPEG)
    // Using HEAD instead of GET to avoid downloading the entire image just to check content-type
    const imageUrl = `https://books.google.com/books/content?id=${book.id}&printsec=frontcover&img=1&zoom=2&source=gbs_api`;
    const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
    
    if (!imageResponse.ok) {
      fs.writeFileSync(cacheFile, '');
      return null;
    }

    const contentType = imageResponse.headers.get('content-type') || '';
    
    // Detection: Google Books placeholders are always PNG images
    // Real covers are always JPEGs
    if (contentType.includes('png')) {
      console.log(`[GoogleBooks] Placeholder detected for ISBN ${isbn} (PNG image)`);
      fs.writeFileSync(cacheFile, '');
      return null;
    }

    // It's a real cover! Return the larger zoom=2 version (HTTPS to avoid mixed content blocking)
    const coverUrl = `https://books.google.com/books/content?id=${book.id}&printsec=frontcover&img=1&zoom=2&source=gbs_api`;
    fs.writeFileSync(cacheFile, coverUrl);
    return coverUrl;
  } catch (error) {
    console.error(`[GoogleBooks] Error fetching cover for ISBN ${isbn}:`, error);
    return null;
  }
}

/**
 * Batch fetch Google Books cover URLs for multiple ISBNs
 * Only returns URLs for books with real covers (not placeholders)
 */
async function fetchGoogleBooksCoverUrls(isbns: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Fetch in parallel with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < isbns.length; i += CONCURRENCY) {
    const batch = isbns.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (isbn) => {
      const url = await fetchGoogleBooksCoverUrl(isbn);
      if (url) {
        results.set(isbn, url);
      }
    });
    await Promise.all(promises);
  }
  
  return results;
}

/**
 * Build a series result from NC Cardinal catalog records when Wikipedia and Google Books fail
 * This extracts volume information from the catalog titles and availability
 */
/**
 * Detect media type from a catalog record title (for NC Cardinal fallback)
 */
function detectMediaTypeFromTitle(title: string): 'manga' | 'light_novel' | 'unknown' {
  const titleLower = title.toLowerCase();
  
  // Check for explicit manga markers
  if (titleLower.includes('(manga)') || 
      titleLower.includes('[manga]') ||
      titleLower.includes('manga version') ||
      titleLower.includes('comic version')) {
    return 'manga';
  }
  
  // Check for explicit light novel markers
  if (titleLower.includes('light novel') ||
      titleLower.includes('(novel)') ||
      titleLower.includes('[novel]') ||
      titleLower.includes('(ln)')) {
    return 'light_novel';
  }
  
  return 'unknown';
}

/**
 * Build a single series from a set of catalog records
 * Internal helper used by buildMultipleSeriesFromNCCardinal
 * Creates entities in the store to ensure all volumes have IDs
 */
async function buildSingleSeriesFromRecords(
  seriesTitle: string,
  records: CatalogRecord[],
  mediaType: 'manga' | 'light_novel' | 'mixed',
  homeLibrary?: string | undefined
): Promise<SeriesResult | null> {
  
  // Clean up the series title
  let cleanTitle = seriesTitle
    .replace(/\[manga\]/gi, '')
    .replace(/\(manga\)/gi, '')
    .replace(/\s+\/\s*$/, '')
    .replace(/\.$/, '')
    .trim();
  
  // Title case the clean title (capitalize first letter of major words)
  // Small words like "of", "a", "the", "and" stay lowercase unless first
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet']);
  cleanTitle = cleanTitle.split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0 || !smallWords.has(lower)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return lower;
    })
    .join(' ');
  
  // Add media type suffix if not already present
  if (mediaType === 'manga' && !cleanTitle.toLowerCase().includes('manga')) {
    cleanTitle = `${cleanTitle} (Manga)`;
  } else if (mediaType === 'light_novel' && !cleanTitle.toLowerCase().includes('novel')) {
    cleanTitle = `${cleanTitle} (Light Novel)`;
  }
  
  // First pass: Group records by volume number (if available)
  const volumeRecords = new Map<number, CatalogRecord>();
  const isbnToRecord = new Map<string, CatalogRecord>();
  const recordsWithoutVolumeNumber: CatalogRecord[] = [];
  
  for (const record of records) {
    const titleLower = record.title.toLowerCase();
    
    // Skip if this doesn't look like our series (check if it contains the first word of the query)
    const firstWord = seriesTitle.toLowerCase().split(' ')[0];
    if (!firstWord || !titleLower.includes(firstWord)) {
      continue;
    }
    
    // Extract volume number from title or volumeNumber field
    const volMatch = record.volumeNumber 
      || record.title.match(/(?:vol\.?|v\.?|#)\s*(\d+)/i)?.[1]
      || record.title.match(/\.\s*(\d+)\s*$/)?.[1]
      || record.title.match(/part\s*(\d+)/i)?.[1];
    
    const volNum = volMatch ? parseInt(String(volMatch), 10) : undefined;
    
    if (volNum && volNum > 0 && volNum < 1000) {
      // If we don't have this volume yet, or this record has more ISBNs, use it
      if (!volumeRecords.has(volNum) || record.isbns.length > (volumeRecords.get(volNum)?.isbns.length ?? 0)) {
        volumeRecords.set(volNum, record);
      }
    } else {
      // Track by ISBN for records without volume numbers
      recordsWithoutVolumeNumber.push(record);
      for (const isbn of record.isbns) {
        if (!isbnToRecord.has(isbn)) {
          isbnToRecord.set(isbn, record);
        }
      }
    }
  }
  
  // If no records have volume numbers, fall back to counting unique ISBNs
  if (volumeRecords.size === 0 && isbnToRecord.size > 0) {
    // Get unique records by ISBN (preferring ISBN-13)
    const uniqueRecords: CatalogRecord[] = [];
    const seenIsbns = new Set<string>();
    
    for (const record of recordsWithoutVolumeNumber) {
      const isbn13 = record.isbns.find(i => i.startsWith('978'));
      const isbn = isbn13 ?? record.isbns[0];
      if (isbn && !seenIsbns.has(isbn)) {
        seenIsbns.add(isbn);
        uniqueRecords.push(record);
      }
    }
    
    // Assign volume numbers sequentially (1, 2, 3, ...)
    for (let i = 0; i < uniqueRecords.length; i++) {
      const record = uniqueRecords[i];
      if (record) {
        volumeRecords.set(i + 1, record);
      }
    }
  }
  
  if (volumeRecords.size === 0) {
    return null;
  }
  
  // Build availability map
  const availability = new Map<string, VolumeAvailability>();
  for (const [, record] of volumeRecords) {
    const isbn = record.isbns.find(i => i.startsWith('978')) ?? record.isbns[0];
    if (isbn) {
      const detailedSummary = getDetailedAvailabilitySummary(record, homeLibrary);
      availability.set(isbn, detailedSummary);
    }
  }
  
  // Build preliminary volume data (without IDs)
  const volumeNums = Array.from(volumeRecords.keys()).sort((a, b) => a - b);
  interface PreliminaryVolume {
    volumeNumber: number;
    title: string;
    editions: EditionData[];
    primaryIsbn: string | undefined;
    availability: VolumeAvailability | undefined;
  }
  const preliminaryVolumes: PreliminaryVolume[] = [];
  let availableCount = 0;
  
  for (const volNum of volumeNums) {
    const record = volumeRecords.get(volNum);
    if (!record) continue;
    
    const isbn = record.isbns.find(i => i.startsWith('978')) ?? record.isbns[0];
    const volAvail = isbn ? availability.get(isbn) : undefined;
    
    if (volAvail?.available) {
      availableCount++;
    }
    
    // Build editions array (NC Cardinal only knows about English physical)
    const editions: EditionData[] = isbn ? [{
      isbn,
      format: 'physical',
      language: 'en',
    }] : [];
    
    preliminaryVolumes.push({
      volumeNumber: volNum,
      title: `${cleanTitle}, Vol. ${volNum}`,
      editions,
      primaryIsbn: isbn,
      availability: volAvail,
    });
  }
  
  // Create entities in the store to get proper IDs
  const entityMediaType = mediaType === 'mixed' ? 'unknown' : mediaType;
  const { series: entity, volumes: entityVolumes } = await createEntitiesFromNCCardinal(
    cleanTitle,
    preliminaryVolumes.map(v => ({
      volumeNumber: v.volumeNumber,
      isbn: v.primaryIsbn,
      title: v.title,
    })),
    entityMediaType
  );
  
  // Map entity IDs to volume info
  const volumes: VolumeInfo[] = preliminaryVolumes.map(vol => {
    const entityVolume = entityVolumes.find(ev => ev.volumeNumber === vol.volumeNumber);
    return {
      ...vol,
      id: entityVolume?.id ?? `tmp-${vol.volumeNumber}`,
    };
  });
  
  return {
    id: entity.id,
    title: cleanTitle,
    totalVolumes: volumes.length,
    availableVolumes: availableCount,
    isComplete: false, // Can't determine from catalog data
    volumes,
    source: 'nc-cardinal',
  };
}

/**
 * Build multiple series from NC Cardinal records (separates manga and light novels)
 * Returns an array of series, one for each detected media type
 * Creates entities in the store to ensure all volumes have IDs
 */
async function buildMultipleSeriesFromNCCardinal(
  seriesTitle: string,
  records: CatalogRecord[],
  homeLibrary?: string | undefined
): Promise<SeriesResult[]> {
  // Separate records by media type
  const mangaRecords: CatalogRecord[] = [];
  const lightNovelRecords: CatalogRecord[] = [];
  const unknownRecords: CatalogRecord[] = [];
  
  for (const record of records) {
    const mediaType = detectMediaTypeFromTitle(record.title);
    if (mediaType === 'manga') {
      mangaRecords.push(record);
    } else if (mediaType === 'light_novel') {
      lightNovelRecords.push(record);
    } else {
      unknownRecords.push(record);
    }
  }
  
  console.log(`[MangaSearch] Detected media types - Manga: ${mangaRecords.length}, Light Novel: ${lightNovelRecords.length}, Unknown: ${unknownRecords.length}`);
  
  const results: SeriesResult[] = [];
  
  // Build manga series if we have manga records
  if (mangaRecords.length > 0) {
    const mangaSeries = await buildSingleSeriesFromRecords(seriesTitle, mangaRecords, 'manga', homeLibrary);
    if (mangaSeries && mangaSeries.totalVolumes > 0) {
      results.push(mangaSeries);
    }
  }
  
  // Build light novel series if we have light novel records
  if (lightNovelRecords.length > 0) {
    const lnSeries = await buildSingleSeriesFromRecords(seriesTitle, lightNovelRecords, 'light_novel', homeLibrary);
    if (lnSeries && lnSeries.totalVolumes > 0) {
      results.push(lnSeries);
    }
  }
  
  // If we only have unknown records, build a single mixed series
  if (results.length === 0 && unknownRecords.length > 0) {
    const mixedSeries = await buildSingleSeriesFromRecords(seriesTitle, unknownRecords, 'mixed', homeLibrary);
    if (mixedSeries && mixedSeries.totalVolumes > 0) {
      results.push(mixedSeries);
    }
  }
  
  // If we found explicit types, also add unknown records to the appropriate series
  // by guessing based on typical patterns (if manga has more volumes in library, unknown is likely manga)
  if (results.length > 0 && unknownRecords.length > 0) {
    // Try to guess: if manga series exists and has multiple volumes, unknown is likely manga
    // This is a heuristic - might need refinement
    console.log(`[MangaSearch] ${unknownRecords.length} records without explicit media type detected`);
  }
  
  return results;
}

/**
 * Build a single series from NC Cardinal (backwards compatibility)
 * Used when we only want one series (e.g., for simple cases)
 */
async function buildSeriesFromNCCardinal(
  seriesTitle: string,
  records: CatalogRecord[],
  homeLibrary?: string | undefined
): Promise<SeriesResult | null> {
  const allSeries = await buildMultipleSeriesFromNCCardinal(seriesTitle, records, homeLibrary);
  // Return the first series (preferring manga if multiple)
  return allSeries[0] ?? null;
}

function getCoverImageUrl(
  isbn?: string, 
  bookcoverUrl?: string, 
  googleBooksCoverUrl?: string
): string | undefined {
  // Priority 1: Bookcover API - best quality, aggregates Amazon/Goodreads
  if (bookcoverUrl) {
    return bookcoverUrl;
  }
  
  // Priority 2: Google Books - good fallback, placeholder detection filters out bad images
  if (googleBooksCoverUrl) {
    return googleBooksCoverUrl;
  }
  
  // Priority 3: OpenLibrary - may return 1x1 placeholder GIFs, frontend handles via onLoad check
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  }
  
  return undefined;
}

/**
 * Resolve editions for a batch of entity volumes
 * Returns a map of volumeId -> EditionData[]
 */
async function resolveEditionsForVolumes(volumes: EntityVolume[]): Promise<Map<string, EditionData[]>> {
  const result = new Map<string, EditionData[]>();
  
  for (const vol of volumes) {
    const editions = await getVolumeEditionData(vol.id);
    result.set(vol.id, editions);
  }
  
  return result;
}

/**
 * Get the primary ISBN (first English physical) from resolved edition data
 */
function getPrimaryIsbn(editions: EditionData[]): string | undefined {
  return editions.find(e => e.language === 'en' && e.format === 'physical')?.isbn;
}

/**
 * Create a debug info object for tracking
 */
function createDebugInfo(): DebugInfo & { startTime: number } {
  return {
    startTime: Date.now(),
    sources: [],
    timing: { total: 0 },
    errors: [],
    warnings: [],
    cacheHits: [],
    log: [],
    dataIssues: [],
    sourceSummary: {},
  };
}

/** Add a log entry to debug info */
function debugLog(debug: DebugInfo & { startTime: number }, message: string): void {
  const elapsed = Date.now() - debug.startTime;
  debug.log.push(`[${elapsed}ms] ${message}`);
}

/**
 * Finalize debug info with total timing
 */
function finalizeDebugInfo(debug: DebugInfo & { startTime: number }): DebugInfo {
  const { startTime, ...rest } = debug;
  return {
    ...rest,
    timing: {
      ...rest.timing,
      total: Date.now() - startTime,
    },
  };
}

// ============================================================================
// Query Parsing
// ============================================================================

/**
 * Parse a search query to extract title and volume number
 * Examples:
 *   "demon slayer 12" -> { title: "demon slayer", volumeNumber: 12 }
 *   "demon slayer vol 12" -> { title: "demon slayer", volumeNumber: 12 }
 *   "demon slayer" -> { title: "demon slayer" }
 */
export function parseQuery(query: string): ParsedQuery {
  const original = query.trim();
  let title = original;
  let volumeNumber: number | undefined;

  // Patterns to match volume numbers at the end of the query
  const patterns = [
    /\s+(?:vol\.?|volume|v\.?|#)\s*(\d+)\s*$/i, // "vol 12", "volume 12", "v12", "#12"
    /\s+(\d+)\s*$/,                               // "12" (just a number at the end)
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num < 1000) { // Sanity check for volume numbers
        volumeNumber = num;
        title = title.replace(pattern, '').trim();
        break;
      }
    }
  }

  return {
    originalQuery: original,
    title,
    volumeNumber,
  };
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Main search function - searches for manga by query
 */
export async function search(
  query: string,
  options: { includeDebug?: boolean; homeLibrary?: string | undefined } = {}
): Promise<SearchResult> {
  const { includeDebug = false, homeLibrary } = options;
  const debug = createDebugInfo();
  
  const parsedQuery = parseQuery(query);
  console.log(`[MangaSearch] Query: "${query}" -> title: "${parsedQuery.title}", vol: ${parsedQuery.volumeNumber ?? 'N/A'}`);

  const result: SearchResult = {
    query,
    parsedQuery,
    series: [],
    volumes: [],
  };

  // Step 1: Try Wikipedia first (better structured data)
  debugLog(debug, `Starting Wikipedia search for "${parsedQuery.title}"`);
  let wikiSeries: WikiSeries | null = null;
  const wikiStart = Date.now();
  try {
    wikiSeries = await getWikipediaSeries(parsedQuery.title);
    if (wikiSeries) {
      debug.sources.push('wikipedia');
      debug.sourceSummary.wikipedia = {
        found: true,
        volumeCount: wikiSeries.volumes.length,
        seriesTitle: wikiSeries.title,
      };
      debugLog(debug, `Wikipedia found: "${wikiSeries.title}" with ${wikiSeries.volumes.length} volumes`);
    } else {
      debug.sourceSummary.wikipedia = { found: false };
      debugLog(debug, 'Wikipedia: no series found');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[MangaSearch] Wikipedia search failed:', error);
    debug.errors.push(`Wikipedia: ${errorMsg}`);
    debug.sourceSummary.wikipedia = { found: false, error: errorMsg };
    
    // Detect specific error types for better debugging
    if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
      debug.dataIssues.push('Wikipedia rate limited (429) - using fallback sources');
      debugLog(debug, 'Wikipedia RATE LIMITED (429) - will try fallback sources');
    } else {
      debugLog(debug, `Wikipedia ERROR: ${errorMsg}`);
    }
  }
  debug.timing.wikipedia = Date.now() - wikiStart;

  // DISABLED: Google Books as a fallback source - relying on Wikipedia + NC Cardinal only
  // Step 2: If Wikipedia didn't find anything, try NC Cardinal directly
  // let googleSeries: GoogleBooksSeries[] = [];
  let ncCardinalFallbackSeries: SeriesResult[] = []; // Array to support multiple series (manga + light novel)
  
  if (!wikiSeries || wikiSeries.volumes.length === 0) {
    // DISABLED: Google Books fallback
    // debugLog(debug, 'Wikipedia unavailable or empty, trying Google Books');
    // const gbStart = Date.now();
    // try {
    //   googleSeries = await searchGoogleBooks(parsedQuery.title);
    //   if (googleSeries.length > 0) {
    //     debug.sources.push('google-books');
    //     const firstSeries = googleSeries[0];
    //     const totalVolumes = googleSeries.reduce((sum, s) => sum + s.volumes.length, 0);
    //     
    //     // Check for data quality issues
    //     const volumesWithSeriesId = googleSeries.flatMap(s => s.volumes).filter(v => v.seriesId).length;
    //     const volumesWithVolNum = googleSeries.flatMap(s => s.volumes).filter(v => v.volumeNumber !== undefined).length;
    //     
    //     debug.sourceSummary.googleBooks = {
    //       found: true,
    //       seriesCount: googleSeries.length,
    //       volumesReturned: totalVolumes,
    //       volumesWithSeriesId,
    //     };
    //     
    //     debugLog(debug, `Google Books found ${googleSeries.length} series, ${totalVolumes} volumes (${volumesWithSeriesId} with seriesId, ${volumesWithVolNum} with volumeNumber)`);
    //     
    //     if (volumesWithSeriesId < totalVolumes * 0.5) {
    //       debug.dataIssues.push(`Google Books: Only ${volumesWithSeriesId}/${totalVolumes} volumes have seriesId - data quality is poor`);
    //     }
    //     if (firstSeries && firstSeries.volumes.length < 5) {
    //       debug.dataIssues.push(`Google Books: Only found ${firstSeries.volumes.length} volumes - likely incomplete`);
    //     }
    //   } else {
    //     debug.sourceSummary.googleBooks = { found: false };
    //     debugLog(debug, 'Google Books: no series found');
    //   }
    // } catch (error) {
    //   const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    //   console.warn('[MangaSearch] Google Books search failed:', error);
    //   debug.errors.push(`Google Books: ${errorMsg}`);
    //   debug.sourceSummary.googleBooks = { found: false, error: errorMsg };
    //   debugLog(debug, `Google Books ERROR: ${errorMsg}`);
    // }
    // debug.timing.googleBooks = Date.now() - gbStart;
    
    // Step 2b: Try NC Cardinal title search directly (was previously fallback after Google Books)
    debugLog(debug, 'Wikipedia unavailable or empty, trying NC Cardinal title search');
    try {
      const fallbackResults = await searchCatalog(`${parsedQuery.title}`, {
        searchClass: 'title',
        count: 60, // Increased to capture both manga and light novel
      });
      
      if (fallbackResults.records.length > 0) {
        debugLog(debug, `NC Cardinal found ${fallbackResults.records.length} records`);
        ncCardinalFallbackSeries = await buildMultipleSeriesFromNCCardinal(
          parsedQuery.title,
          fallbackResults.records,
          homeLibrary
        );
        if (ncCardinalFallbackSeries.length > 0) {
          const totalVolumes = ncCardinalFallbackSeries.reduce((sum, s) => sum + s.totalVolumes, 0);
          debug.sources.push('nc-cardinal-fallback');
          debug.sourceSummary.ncCardinal = {
            found: true,
            recordCount: fallbackResults.records.length,
            volumesExtracted: totalVolumes,
          };
          debugLog(debug, `NC Cardinal built ${ncCardinalFallbackSeries.length} series with ${totalVolumes} total volumes`);
        } else {
          debug.sourceSummary.ncCardinal = { 
            found: false,
            recordCount: fallbackResults.records.length,
            volumesExtracted: 0,
          };
          debug.dataIssues.push(`NC Cardinal: Found ${fallbackResults.records.length} records but couldn't extract volumes`);
          debugLog(debug, 'NC Cardinal: Could not extract volumes from records');
        }
      } else {
        debug.sourceSummary.ncCardinal = { found: false, recordCount: 0 };
        debugLog(debug, 'NC Cardinal: no records found');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[MangaSearch] NC Cardinal fallback search failed:', error);
      debug.sourceSummary.ncCardinal = { found: false, error: errorMsg };
      debugLog(debug, `NC Cardinal ERROR: ${errorMsg}`);
    }
  }

  // Step 3: Collect ISBNs for availability lookup
  const isbnsToCheck: string[] = [];

  if (wikiSeries && wikiSeries.volumes.length > 0) {
    // Add Wikipedia ISBNs
    for (const vol of wikiSeries.volumes) {
      if (vol.englishISBN) {
        isbnsToCheck.push(vol.englishISBN);
      }
    }
  }
  // DISABLED: Google Books ISBNs - relying on Wikipedia + NC Cardinal only
  // } else if (googleSeries.length > 0) {
  //   // Add Google Books ISBNs
  //   for (const series of googleSeries.slice(0, 2)) {
  //     for (const vol of series.volumes) {
  //       if (vol.isbn13) {
  //         isbnsToCheck.push(vol.isbn13);
  //       } else if (vol.isbn10) {
  //         isbnsToCheck.push(vol.isbn10);
  //       }
  //     }
  //   }
  // }

  // Step 4: Check availability in NC Cardinal
  console.log(`[MangaSearch] Checking availability for ${isbnsToCheck.length} ISBNs...`);
  let availability = new Map<string, VolumeAvailability>();
  const ncStart = Date.now();
  if (isbnsToCheck.length > 0) {
    try {
      availability = await getAvailabilityByISBNs(isbnsToCheck, { org: 'CARDINAL', homeLibrary });
      debug.sources.push('nc-cardinal');
      
      // DISABLED: Google Books ISBN fallback logic - no longer using Google Books
      // Step 4b was: If all ISBNs came back as "not in catalog", try a title search on NC Cardinal
      // This is now handled directly in Step 2 above
    } catch (error) {
      console.warn('[MangaSearch] NC Cardinal availability check failed:', error);
      debug.errors.push(`NC Cardinal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  debug.timing.ncCardinal = Date.now() - ncStart;

  // Step 4.5: Fetch cover URLs (Bookcover API first, then Google Books for missing ones)
  const bookcoverUrls = await fetchBookcoverUrls(isbnsToCheck);
  if (bookcoverUrls.size > 0) {
    debug.sources.push('bookcover-api');
  }
  
  // Fetch Google Books covers for ISBNs that Bookcover doesn't have
  const missingCoverIsbns = isbnsToCheck.filter(isbn => !bookcoverUrls.has(isbn));
  let googleBooksUrls = new Map<string, string>();
  if (missingCoverIsbns.length > 0) {
    googleBooksUrls = await fetchGoogleBooksCoverUrls(missingCoverIsbns);
    if (googleBooksUrls.size > 0) {
      debug.sources.push('google-books-covers');
      console.log(`[MangaSearch] Google Books provided ${googleBooksUrls.size} covers for ISBNs missing from Bookcover`);
    }
  }

  // Step 5: Build results
  if (wikiSeries && wikiSeries.volumes.length > 0) {
    const seriesResult = await buildSeriesResultFromWikipedia(wikiSeries, availability, bookcoverUrls, googleBooksUrls);
    result.series.push(seriesResult);

    // Build volume results for main series (use seriesResult.volumes which have IDs)
    for (const vol of seriesResult.volumes ?? []) {
      result.volumes.push({
        id: vol.id,
        title: `${wikiSeries.title}, Vol. ${vol.volumeNumber}${vol.title ? `: ${vol.title}` : ''}`,
        volumeNumber: vol.volumeNumber,
        seriesTitle: wikiSeries.title,
        isbn: vol.primaryIsbn,
        coverImage: vol.coverImage,
        availability: vol.availability,
        source: 'wikipedia',
      });
    }
    
    // Step 5a: Add related series (adaptations, spin-offs, etc.) from Wikipedia
    if (wikiSeries.relatedSeries && wikiSeries.relatedSeries.length > 0) {
      console.log(`[MangaSearch] Processing ${wikiSeries.relatedSeries.length} related series from Wikipedia`);
      
      for (const related of wikiSeries.relatedSeries) {
        // Get availability for related series volumes
        const relatedIsbns = related.volumes
          .map(v => v.englishISBN)
          .filter((isbn): isbn is string => !!isbn);
        
        // If we don't have availability for these ISBNs yet, fetch them
        const missingIsbns = relatedIsbns.filter(isbn => !availability.has(isbn));
        if (missingIsbns.length > 0) {
          const relatedAvailability = await getAvailabilityByISBNs(missingIsbns, { org: 'CARDINAL', homeLibrary });
          for (const [isbn, avail] of relatedAvailability) {
            availability.set(isbn, avail);
          }
        }
        
        // Build series result using title-based entity ID (not Wikipedia ID)
        const relatedSeriesResult = await buildRelatedSeriesResult(
          related,
          wikiSeries.title,
          wikiSeries.author,
          availability, 
          bookcoverUrls,
          googleBooksUrls
        );
        result.series.push(relatedSeriesResult);
        
        // Build volume results for related series (use relatedSeriesResult.volumes which have IDs)
        for (const vol of relatedSeriesResult.volumes ?? []) {
          result.volumes.push({
            id: vol.id,
            title: `${relatedSeriesResult.title}, Vol. ${vol.volumeNumber}${vol.title ? `: ${vol.title}` : ''}`,
            volumeNumber: vol.volumeNumber,
            seriesTitle: relatedSeriesResult.title,
            isbn: vol.primaryIsbn,
            coverImage: vol.coverImage,
            availability: vol.availability,
            source: 'wikipedia',
          });
        }
        
        console.log(`[MangaSearch] Added related series: "${relatedSeriesResult.title}" (${related.relationship}, ${related.mediaType}) with ${related.volumes.length} volumes`);
      }
    }
    
    // Step 5b: Check NC Cardinal for alternate media types (e.g., manga vs light novel)
    // Wikipedia typically only returns one type, so we search for the other
    try {
      const wikiTitleLower = wikiSeries.title.toLowerCase();
      const isWikiManga = wikiTitleLower.includes('manga');
      
      // If Wikipedia doesn't explicitly say "manga", assume it might be light novel 
      // and search NC Cardinal for manga adaptation
      const searchTerms = isWikiManga 
        ? [`${parsedQuery.title}`] // If wiki found manga, search for any (might find LN)
        : [`${parsedQuery.title} manga`, `${parsedQuery.title}`]; // Search for manga first, then general
      
      for (const alternateSearchTerm of searchTerms) {
        console.log(`[MangaSearch] Checking for alternate media types: "${alternateSearchTerm}"`);
        const alternateResults = await searchCatalog(alternateSearchTerm, {
          searchClass: 'title',
          count: 40,
        });
        
        if (alternateResults.records.length > 0) {
          const alternateSeries = await buildMultipleSeriesFromNCCardinal(
            parsedQuery.title,
            alternateResults.records,
            homeLibrary
          );
          
          // Collect all ISBNs from existing series for duplicate detection
          const existingIsbns = new Set<string>();
          for (const vol of result.volumes) {
            if (vol.isbn) existingIsbns.add(vol.isbn);
          }
          
          // Add any series that is explicitly a different media type
          for (const altSeries of alternateSeries) {
            const altTitleLower = altSeries.title.toLowerCase();
            const isAltLightNovel = altTitleLower.includes('light novel') || altTitleLower.includes('novel');
            
            // PRIMARY: ISBN-based duplicate detection
            // If any ISBNs overlap, these are the same series regardless of title
            const altIsbns = altSeries.volumes?.map(v => v.primaryIsbn).filter((isbn): isbn is string => !!isbn) ?? [];
            const overlappingIsbns = altIsbns.filter(isbn => existingIsbns.has(isbn));
            const hasIsbnOverlap = overlappingIsbns.length > 0;
            
            if (hasIsbnOverlap) {
              console.log(`[MangaSearch] Skipping "${altSeries.title}" - ${overlappingIsbns.length} ISBNs overlap with existing series`);
              continue;
            }
            
            // SECONDARY: Title-based duplicate detection (fallback when ISBNs don't match)
            const normalizeTitle = (title: string) => title.toLowerCase()
              .replace(/\s*\(manga\)\s*/gi, '')
              .replace(/\s*\(light novel\)\s*/gi, '')
              .replace(/\s*\(novel\)\s*/gi, '')
              .replace(/\s*manga\s*$/gi, '')
              .replace(/\s*light novel\s*$/gi, '')
              .trim();
            
            const normalizedWikiTitle = normalizeTitle(wikiTitleLower);
            const normalizedAltTitle = normalizeTitle(altTitleLower);
            
            // Check if this is actually the same series with a different name format
            const isSameSeriesByTitle = normalizedWikiTitle === normalizedAltTitle ||
              normalizedWikiTitle.includes(normalizedAltTitle) ||
              normalizedAltTitle.includes(normalizedWikiTitle);
            
            // Only add if it's a genuinely different media type (e.g., light novel vs manga)
            // AND not just the same series with a different naming convention
            const isGenuinelyDifferentType = isAltLightNovel && !wikiTitleLower.includes('light novel') && !wikiTitleLower.includes('novel');
            const shouldAdd = isGenuinelyDifferentType && !isSameSeriesByTitle;
            
            // Also check we're not adding a duplicate by normalized title
            const isDuplicate = result.series.some(s => 
              normalizeTitle(s.title) === normalizedAltTitle
            );
            
            if (shouldAdd && altSeries.totalVolumes > 0 && !isDuplicate) {
              console.log(`[MangaSearch] Found alternate media type: ${altSeries.title} (${altSeries.totalVolumes} volumes)`);
              
              // Fetch cover images for alternate series (Bookcover + Google Books fallback)
              const altIsbns = altSeries.volumes?.map(v => v.primaryIsbn).filter((isbn): isbn is string => !!isbn) ?? [];
              const altBookcovers = await fetchBookcoverUrls(altIsbns);
              const altMissingIsbns = altIsbns.filter(isbn => !altBookcovers.has(isbn));
              const altGoogleBooks = altMissingIsbns.length > 0 
                ? await fetchGoogleBooksCoverUrls(altMissingIsbns)
                : new Map<string, string>();
              
              const firstAltIsbn = altSeries.volumes?.[0]?.primaryIsbn ?? '';
              
              // Build volumes with cover images
              const altVolumesWithCovers: VolumeInfo[] = (altSeries.volumes ?? []).map(vol => {
                const bookcoverCover = vol.primaryIsbn ? altBookcovers.get(vol.primaryIsbn) : undefined;
                const googleBooksCover = vol.primaryIsbn ? altGoogleBooks.get(vol.primaryIsbn) : undefined;
                return {
                  ...vol,
                  coverImage: getCoverImageUrl(vol.primaryIsbn, bookcoverCover, googleBooksCover),
                };
              });
              
              result.series.push({
                ...altSeries,
                coverImage: getCoverImageUrl(firstAltIsbn, altBookcovers.get(firstAltIsbn), altGoogleBooks.get(firstAltIsbn)),
                volumes: altVolumesWithCovers,
              });
              
              // Add volumes
              for (const vol of altVolumesWithCovers) {
                result.volumes.push({
                  id: vol.id,
                  title: vol.title ?? `${altSeries.title}, Vol. ${vol.volumeNumber}`,
                  volumeNumber: vol.volumeNumber,
                  seriesTitle: altSeries.title,
                  isbn: vol.primaryIsbn,
                  coverImage: vol.coverImage,
                  availability: vol.availability,
                  source: 'nc-cardinal',
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('[MangaSearch] Failed to check for alternate media types:', error);
    }
  } else if (ncCardinalFallbackSeries.length > 0) {
    // Use NC Cardinal fallback when Wikipedia and Google Books both failed
    // This may include multiple series (e.g., manga + light novel variants)
    console.log(`[MangaSearch] Using ${ncCardinalFallbackSeries.length} NC Cardinal fallback series`);
    
    // Collect all ISBNs from all series for cover image lookup
    const allNcIsbns = ncCardinalFallbackSeries.flatMap(series => 
      series.volumes?.map(v => v.primaryIsbn).filter((isbn): isbn is string => !!isbn) ?? []
    );
    const ncBookcovers = await fetchBookcoverUrls(allNcIsbns);
    const ncMissingIsbns = allNcIsbns.filter(isbn => !ncBookcovers.has(isbn));
    const ncGoogleBooks = ncMissingIsbns.length > 0 
      ? await fetchGoogleBooksCoverUrls(ncMissingIsbns)
      : new Map<string, string>();
    
    // Add each series and its volumes, creating entities
    for (const ncSeries of ncCardinalFallbackSeries) {
      // Determine media type for entity
      const entityMediaType: MediaType = ncSeries.title.toLowerCase().includes('light novel') 
        ? 'light_novel' 
        : ncSeries.title.toLowerCase().includes('manga') 
          ? 'manga' 
          : 'unknown';
      
      // Create entity from NC Cardinal data
      const { series: entity } = await createEntitiesFromNCCardinal(
        ncSeries.title,
        ncSeries.volumes?.map(v => ({
          volumeNumber: v.volumeNumber,
          isbn: v.primaryIsbn,
          title: v.title,
        })) ?? [],
        entityMediaType
      );
      
      const firstNcIsbn = ncSeries.volumes?.[0]?.primaryIsbn ?? '';
      
      // Build volumes with cover images
      const volumesWithCovers: VolumeInfo[] = (ncSeries.volumes ?? []).map(vol => {
        const bookcoverCover = vol.primaryIsbn ? ncBookcovers.get(vol.primaryIsbn) : undefined;
        const googleBooksCover = vol.primaryIsbn ? ncGoogleBooks.get(vol.primaryIsbn) : undefined;
        return {
          ...vol,
          coverImage: getCoverImageUrl(vol.primaryIsbn, bookcoverCover, googleBooksCover),
        };
      });
      
      result.series.push({
        ...ncSeries,
        id: entity.id,
        coverImage: getCoverImageUrl(firstNcIsbn, ncBookcovers.get(firstNcIsbn), ncGoogleBooks.get(firstNcIsbn)),
        volumes: volumesWithCovers,
      });
      
      // Build volume results for this series
      for (const vol of volumesWithCovers) {
        result.volumes.push({
          id: vol.id,
          title: vol.title ?? `${ncSeries.title}, Vol. ${vol.volumeNumber}`,
          volumeNumber: vol.volumeNumber,
          seriesTitle: ncSeries.title,
          isbn: vol.primaryIsbn,
          coverImage: vol.coverImage,
          availability: vol.availability,
          source: 'nc-cardinal',
        });
      }
    }
  }
  // DISABLED: Google Books results - relying on Wikipedia + NC Cardinal only
  // } else if (googleSeries.length > 0) {
  //   // Use Google Books results
  //   for (const series of googleSeries.slice(0, 3)) {
  //     const seriesResult = buildSeriesResultFromGoogle(series, availability, bookcoverUrls);
  //     result.series.push(seriesResult);
  //
  //     // Build volume results
  //     for (const vol of series.volumes) {
  //       const isbn = vol.isbn13 ?? vol.isbn10;
  //       const volAvail = isbn ? availability.get(isbn) : undefined;
  //       const bookcoverCover = isbn ? bookcoverUrls.get(isbn) : undefined;
  //       result.volumes.push({
  //         title: vol.title,
  //         volumeNumber: vol.volumeNumber,
  //         seriesTitle: series.title,
  //         isbn,
  //         coverImage: getCoverImageUrl(isbn, vol.thumbnail, bookcoverCover),
  //         availability: volAvail,
  //         source: 'google-books',
  //       });
  //     }
  //   }
  // }

  // Step 6: Determine best match
  if (parsedQuery.volumeNumber) {
    // User searched for a specific volume
    const matchingVolume = result.volumes.find(v => v.volumeNumber === parsedQuery.volumeNumber);
    if (matchingVolume) {
      result.bestMatch = { type: 'volume', volume: matchingVolume };
    }
  } else if (result.series.length > 0) {
    // User searched for a series
    result.bestMatch = { type: 'series', series: result.series[0] };
  }

  // Add debug info if requested
  if (includeDebug) {
    result._debug = finalizeDebugInfo(debug);
  }

  return result;
}

/**
 * Get detailed series information with all volumes and availability
 */
export async function getSeriesDetails(
  seriesTitle: string,
  options: { includeDebug?: boolean; homeLibrary?: string | undefined; entityId?: string | undefined } = {}
): Promise<SeriesDetails | null> {
  const { includeDebug = false, homeLibrary, entityId } = options;
  const debug = createDebugInfo();
  
  // If we have an entityId, load directly from entity store (skip Wikipedia lookup)
  // This is much faster for related series that don't have their own Wikipedia pages
  if (entityId) {
    console.log(`[MangaSearch] Loading series directly from entity: ${entityId}`);
    const entityResult = await getSeriesDetailsFromEntity(entityId, { includeDebug, homeLibrary });
    if (entityResult) {
      return entityResult;
    }
    // If entity lookup fails, fall through to try Wikipedia
    console.log(`[MangaSearch] Entity lookup failed for ${entityId}, trying Wikipedia...`);
  }
  
  // Try Wikipedia lookup
  const wikiStart = Date.now();
  const wikiSeries = await getWikipediaSeries(seriesTitle);
  debug.timing.wikipedia = Date.now() - wikiStart;

  if (!wikiSeries || wikiSeries.volumes.length === 0) {
    console.log(`[MangaSearch] Wikipedia lookup failed for "${seriesTitle}"`);
    debug.errors.push(`Series not found: "${seriesTitle}"`);
    return null;
  }
  
  debug.sources.push('wikipedia');

  // Collect ISBNs
  const isbns = wikiSeries.volumes
    .map(v => v.englishISBN)
    .filter((isbn): isbn is string => isbn !== undefined);

  // Fetch availability and cover images in parallel
  console.log(`[MangaSearch] Checking availability for ${isbns.length} volumes...`);
  const ncStart = Date.now();
  const [availability, bookcoverUrls] = await Promise.all([
    getAvailabilityByISBNs(isbns, { org: 'CARDINAL', homeLibrary }),
    fetchBookcoverUrls(isbns),
  ]);
  debug.timing.ncCardinal = Date.now() - ncStart;
  debug.sources.push('nc-cardinal');

  if (bookcoverUrls.size > 0) {
    debug.sources.push('bookcover-api');
  }
  
  // Fetch Google Books covers for ISBNs that Bookcover doesn't have
  const missingCoverIsbns = isbns.filter(isbn => !bookcoverUrls.has(isbn));
  let googleBooksUrls = new Map<string, string>();
  if (missingCoverIsbns.length > 0) {
    googleBooksUrls = await fetchGoogleBooksCoverUrls(missingCoverIsbns);
    if (googleBooksUrls.size > 0) {
      debug.sources.push('google-books-covers');
      console.log(`[MangaSearch] Google Books provided ${googleBooksUrls.size} covers for ISBNs missing from Bookcover`);
    }
  }

  // Get first volume's ISBN for cover image
  const firstVolumeIsbn = wikiSeries.volumes[0]?.englishISBN;

  // Create/update entities - now returns volumes with edition references
  const { series: entity, volumes: entityVolumes } = await createEntitiesFromWikipedia(wikiSeries);

  // Resolve editions for all volumes
  const editionsMap = await resolveEditionsForVolumes(entityVolumes);

  // Get series cover from first volume
  const firstVolBookcover = firstVolumeIsbn ? bookcoverUrls.get(firstVolumeIsbn) : undefined;
  const firstVolGoogleBooks = firstVolumeIsbn ? googleBooksUrls.get(firstVolumeIsbn) : undefined;

  // Build volume info with covers from Bookcover API, Google Books, or OpenLibrary fallback
  const volumes: VolumeInfo[] = entityVolumes.map(vol => {
    const editions = editionsMap.get(vol.id) ?? [];
    const primaryIsbn = getPrimaryIsbn(editions);
    const bookcoverCover = primaryIsbn ? bookcoverUrls.get(primaryIsbn) : undefined;
    const googleBooksCover = primaryIsbn ? googleBooksUrls.get(primaryIsbn) : undefined;
    
    return {
      id: vol.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editions,
      primaryIsbn,
      coverImage: getCoverImageUrl(primaryIsbn, bookcoverCover, googleBooksCover),
      availability: primaryIsbn ? availability.get(primaryIsbn) : undefined,
    };
  });

  // Count available volumes and find missing ones
  let availableCount = 0;
  const missingVolumes: number[] = [];

  for (const vol of volumes) {
    if (vol.availability?.available) {
      availableCount++;
    } else {
      missingVolumes.push(vol.volumeNumber);
    }
  }

  const result: SeriesDetails = {
    id: entity.id,
    title: wikiSeries.title,
    description: entity.description,  // Series description/preamble from Vol 1
    totalVolumes: entityVolumes.length,
    isComplete: wikiSeries.isComplete,
    author: wikiSeries.author,
    coverImage: getCoverImageUrl(firstVolumeIsbn, firstVolBookcover, firstVolGoogleBooks),
    volumes,
    availableCount,
    missingVolumes,
  };
  
  if (includeDebug) {
    result._debug = finalizeDebugInfo(debug);
  }
  
  return result;
}

/**
 * Load series details from entity data (fallback for related series without Wikipedia pages)
 */
async function getSeriesDetailsFromEntity(
  entityId: string,
  options: { includeDebug?: boolean; homeLibrary?: string | undefined } = {}
): Promise<SeriesDetails | null> {
  const { includeDebug = false, homeLibrary } = options;
  const debug = createDebugInfo();
  
  // Load entity
  const entity = await getSeriesById(entityId);
  if (!entity) {
    console.log(`[MangaSearch] Entity not found: ${entityId}`);
    return null;
  }
  
  // Load volume entities for this series
  const entityVolumes = await getVolumesBySeriesId(entityId);
  if (entityVolumes.length === 0 && (!entity.volumeIds || entity.volumeIds.length === 0)) {
    console.log(`[MangaSearch] No volumes found for entity: ${entityId}`);
    return null;
  }
  
  debug.sources.push('entity-store');
  
  // Resolve editions for all volumes
  const editionsMap = await resolveEditionsForVolumes(entityVolumes);
  
  // Collect English physical ISBNs for availability lookup
  const isbns: string[] = [];
  for (const editions of editionsMap.values()) {
    for (const e of editions) {
      if (e.language === 'en' && e.format === 'physical') {
        isbns.push(e.isbn);
      }
    }
  }
  
  // Fetch availability and covers
  console.log(`[MangaSearch] Loading from entity: ${entity.title} (${entityVolumes.length} volumes, ${isbns.length} with English ISBNs)`);
  const ncStart = Date.now();
  const [availability, bookcoverUrls] = await Promise.all([
    isbns.length > 0 ? getAvailabilityByISBNs(isbns, { org: 'CARDINAL', homeLibrary }) : Promise.resolve(new Map<string, VolumeAvailability>()),
    isbns.length > 0 ? fetchBookcoverUrls(isbns) : Promise.resolve(new Map<string, string>()),
  ]);
  debug.timing.ncCardinal = Date.now() - ncStart;
  debug.sources.push('nc-cardinal');
  
  if (bookcoverUrls.size > 0) {
    debug.sources.push('bookcover-api');
  }
  
  // Fetch Google Books covers for ISBNs that Bookcover doesn't have
  const missingCoverIsbns = isbns.filter(isbn => !bookcoverUrls.has(isbn));
  let googleBooksUrls = new Map<string, string>();
  if (missingCoverIsbns.length > 0) {
    googleBooksUrls = await fetchGoogleBooksCoverUrls(missingCoverIsbns);
    if (googleBooksUrls.size > 0) {
      debug.sources.push('google-books-covers');
    }
  }
  
  // Build volume info from entity volumes
  const sortedVolumes = [...entityVolumes].sort((a, b) => a.volumeNumber - b.volumeNumber);
  const volumes: VolumeInfo[] = sortedVolumes.map(vol => {
    const editions = editionsMap.get(vol.id) ?? [];
    const primaryIsbn = getPrimaryIsbn(editions);
    const bookcoverCover = primaryIsbn ? bookcoverUrls.get(primaryIsbn) : undefined;
    const googleBooksCover = primaryIsbn ? googleBooksUrls.get(primaryIsbn) : undefined;
    return {
      id: vol.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editions,
      primaryIsbn,
      coverImage: getCoverImageUrl(primaryIsbn, bookcoverCover, googleBooksCover),
      availability: primaryIsbn ? availability.get(primaryIsbn) : undefined,
    };
  });
  
  // Count available volumes and find missing ones
  let availableCount = 0;
  const missingVolumes: number[] = [];
  
  for (const vol of volumes) {
    if (vol.availability?.available) {
      availableCount++;
    } else {
      missingVolumes.push(vol.volumeNumber);
    }
  }
  
  // Get cover from first volume
  const firstVolumeIsbn = volumes[0]?.primaryIsbn;
  const firstVolBookcover = firstVolumeIsbn ? bookcoverUrls.get(firstVolumeIsbn) : undefined;
  const firstVolGoogleBooks = firstVolumeIsbn ? googleBooksUrls.get(firstVolumeIsbn) : undefined;
  
  const result: SeriesDetails = {
    id: entity.id,
    title: entity.title,
    description: entity.description,  // Series description/preamble from Vol 1
    totalVolumes: volumes.length,
    isComplete: entity.status === 'completed',
    author: entity.author,
    coverImage: getCoverImageUrl(firstVolumeIsbn, firstVolBookcover, firstVolGoogleBooks),
    volumes,
    availableCount,
    missingVolumes,
  };
  
  if (includeDebug) {
    result._debug = finalizeDebugInfo(debug);
  }
  
  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function buildSeriesResultFromWikipedia(
  wiki: WikiSeries,
  availability: Map<string, VolumeAvailability>,
  bookcoverUrls: Map<string, string> = new Map(),
  googleBooksUrls: Map<string, string> = new Map()
): Promise<SeriesResult> {
  let availableVolumes = 0;
  
  // Create/update entities - now returns volumes with edition references
  const { series: entity, volumes: entityVolumes } = await createEntitiesFromWikipedia(wiki);
  
  // Resolve editions for all volumes
  const editionsMap = await resolveEditionsForVolumes(entityVolumes);
  
  // Get first volume's English ISBN for cover image
  const firstVolumeIsbn = wiki.volumes[0]?.englishISBN;
  const firstVolBookcover = firstVolumeIsbn ? bookcoverUrls.get(firstVolumeIsbn) : undefined;
  const firstVolGoogleBooks = firstVolumeIsbn ? googleBooksUrls.get(firstVolumeIsbn) : undefined;

  // Build VolumeInfo from entity volumes (includes all volumes, even Japan-only)
  const volumes: VolumeInfo[] = entityVolumes.map(vol => {
    const editions = editionsMap.get(vol.id) ?? [];
    // Find primary English physical ISBN for library lookup
    const primaryIsbn = getPrimaryIsbn(editions);
    const volAvail = primaryIsbn ? availability.get(primaryIsbn) : undefined;
    if (volAvail?.available) {
      availableVolumes++;
    }
    const bookcoverCover = primaryIsbn ? bookcoverUrls.get(primaryIsbn) : undefined;
    const googleBooksCover = primaryIsbn ? googleBooksUrls.get(primaryIsbn) : undefined;
    return {
      id: vol.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editions,
      primaryIsbn,
      coverImage: getCoverImageUrl(primaryIsbn, bookcoverCover, googleBooksCover),
      availability: volAvail,
    };
  });

  return {
    id: entity.id,
    title: wiki.title,
    totalVolumes: entityVolumes.length,  // Now computed from actual volumes
    availableVolumes,
    isComplete: wiki.isComplete,
    author: wiki.author,
    coverImage: getCoverImageUrl(firstVolumeIsbn, firstVolBookcover, firstVolGoogleBooks),
    source: 'wikipedia',
    volumes,
    mediaType: wiki.mediaType,
  };
}

/**
 * Build a SeriesResult for a related series (spin-off, adaptation, etc.)
 * Uses findOrCreateSeriesByTitle instead of Wikipedia ID to ensure unique entity IDs
 */
export async function buildRelatedSeriesResult(
  related: import('./wikipedia-client.js').WikiRelatedSeries,
  parentTitle: string,
  parentAuthor: string | undefined,
  availability: Map<string, VolumeAvailability>,
  bookcoverUrls: Map<string, string> = new Map(),
  googleBooksUrls: Map<string, string> = new Map()
): Promise<SeriesResult> {
  let availableVolumes = 0;
  
  // Determine media type
  const mediaType = detectMediaType(related.title, {
    isManga: related.mediaType === 'manga',
    isLightNovel: related.mediaType === 'light_novel',
  });
  
  // Generate full title - prefix with parent title if not included
  let relatedTitle = related.title;
  const parentBase = parentTitle.toLowerCase().split(/[:(]/)[0]?.trim() ?? '';
  if (!related.title.toLowerCase().includes(parentBase)) {
    relatedTitle = `${parentTitle}: ${related.title}`;
  }
  
  // Add media type suffix for light novels to distinguish from manga with same title
  // Use related.mediaType directly since detectMediaType may not have correct hints
  if (related.mediaType === 'light_novel' && !relatedTitle.toLowerCase().includes('light novel')) {
    relatedTitle = `${relatedTitle} (Light Novel)`;
  }
  
  // Create/find entity using title (not Wikipedia ID) to get unique ID
  const entity = await findOrCreateSeriesByTitle({
    title: relatedTitle,
    mediaType,
    author: parentAuthor,
    status: 'unknown',
  });
  
  // Get volumes from entity store, or create them if they don't exist
  let entityVolumes = await getVolumesBySeriesId(entity.id);
  
  // If no entity volumes exist, create them from related.volumes
  if (entityVolumes.length === 0 && related.volumes.length > 0) {
    const { findOrCreateVolumes } = await import('../entities/volumes.js');
    const { findOrCreateEditions } = await import('../entities/editions.js');
    
    // First create volumes without edition links
    entityVolumes = await findOrCreateVolumes(related.volumes.map(vol => ({
      seriesId: entity.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editionIds: [],
    })));
    
    // Build a map of volume number -> volume ID for linking
    const volumeByNumber = new Map<number, string>();
    for (const vol of entityVolumes) {
      volumeByNumber.set(vol.volumeNumber, vol.id);
    }
    
    // Create editions and link them to volumes
    const editionInputs: Array<{isbn: string; format: 'physical'; language: 'ja' | 'en'; volumeIds: string[]; releaseDate?: string}> = [];
    for (const relVol of related.volumes) {
      const volumeId = volumeByNumber.get(relVol.volumeNumber);
      if (!volumeId) continue;
      
      if (relVol.japaneseISBN) {
        editionInputs.push({ isbn: relVol.japaneseISBN, format: 'physical', language: 'ja', volumeIds: [volumeId], releaseDate: relVol.japaneseReleaseDate });
      }
      if (relVol.englishISBN) {
        editionInputs.push({ isbn: relVol.englishISBN, format: 'physical', language: 'en', volumeIds: [volumeId], releaseDate: relVol.englishReleaseDate });
      }
    }
    
    if (editionInputs.length > 0) {
      const editions = await findOrCreateEditions(editionInputs);
      // Link editions back to volumes
      const { saveVolumes } = await import('../entities/store.js');
      for (const edition of editions) {
        for (const volumeId of edition.volumeIds) {
          const vol = entityVolumes.find(v => v.id === volumeId);
          if (vol && !vol.editionIds.includes(edition.id)) {
            vol.editionIds.push(edition.id);
          }
        }
      }
      await saveVolumes(entityVolumes);
    }
  }
  
  // Resolve editions for all volumes
  const editionsMap = await resolveEditionsForVolumes(entityVolumes);
  
  // Get first volume's ISBN for cover image
  const firstVolumeIsbn = related.volumes[0]?.englishISBN;
  const firstVolBookcover = firstVolumeIsbn ? bookcoverUrls.get(firstVolumeIsbn) : undefined;
  const firstVolGoogleBooks = firstVolumeIsbn ? googleBooksUrls.get(firstVolumeIsbn) : undefined;

  // Build VolumeInfo from entity volumes
  const volumes: VolumeInfo[] = entityVolumes.map(vol => {
    const editions = editionsMap.get(vol.id) ?? [];
    const primaryIsbn = getPrimaryIsbn(editions);
    const volAvail = primaryIsbn ? availability.get(primaryIsbn) : undefined;
    if (volAvail?.available) {
      availableVolumes++;
    }
    const bookcoverCover = primaryIsbn ? bookcoverUrls.get(primaryIsbn) : undefined;
    const googleBooksCover = primaryIsbn ? googleBooksUrls.get(primaryIsbn) : undefined;
    return {
      id: vol.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editions,
      primaryIsbn,
      coverImage: getCoverImageUrl(primaryIsbn, bookcoverCover, googleBooksCover),
      availability: volAvail,
    };
  });

  return {
    id: entity.id,
    title: relatedTitle,
    totalVolumes: volumes.length,
    availableVolumes,
    isComplete: false,
    author: parentAuthor,
    coverImage: getCoverImageUrl(firstVolumeIsbn, firstVolBookcover, firstVolGoogleBooks),
    source: 'wikipedia',
    volumes,
    mediaType: related.mediaType,
    relationship: related.relationship,
  };
}

// DISABLED: Google Books as a data source - function kept for potential future use
// function buildSeriesResultFromGoogle(
//   series: GoogleBooksSeries,
//   availability: Map<string, VolumeAvailability>,
//   bookcoverUrls: Map<string, string> = new Map()
// ): SeriesResult {
//   let availableVolumes = 0;
//   
//   // Get first volume for cover image
//   const firstVolume = series.volumes[0];
//   const firstIsbn = firstVolume?.isbn13 ?? firstVolume?.isbn10;
//   const firstVolBookcover = firstIsbn ? bookcoverUrls.get(firstIsbn) : undefined;
//
//   const volumes: VolumeInfo[] = series.volumes.map(vol => {
//     const isbn = vol.isbn13 ?? vol.isbn10;
//     const volAvail = isbn ? availability.get(isbn) : undefined;
//     if (volAvail?.available) {
//       availableVolumes++;
//     }
//     const bookcoverCover = isbn ? bookcoverUrls.get(isbn) : undefined;
//     return {
//       volumeNumber: vol.volumeNumber ?? 0,
//       title: vol.subtitle,
//       isbn,
//       coverImage: getCoverImageUrl(isbn, vol.thumbnail, bookcoverCover),
//       availability: volAvail,
//     };
//   });
//
//   return {
//     id: `gbooks-${series.seriesId}`,
//     slug: generateSlug(series.title),
//     title: series.title,
//     totalVolumes: series.totalVolumesFound,
//     availableVolumes,
//     isComplete: false, // Google Books doesn't tell us this
//     coverImage: getCoverImageUrl(firstIsbn, firstVolume?.thumbnail, firstVolBookcover),
//     source: 'google-books',
//     volumes,
//   };
// }

// ============================================================================
// Test/Demo execution
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Manga Search Service Test');
  console.log('='.repeat(60));

  try {
    // Test 1: Basic series search
    console.log('\n--- Test 1: Search "demon slayer" ---');
    const demonSlayerResults = await search('demon slayer');
    console.log(`\nFound ${demonSlayerResults.series.length} series, ${demonSlayerResults.volumes.length} volumes`);
    if (demonSlayerResults.series[0]) {
      const series = demonSlayerResults.series[0];
      console.log(`Best match: ${series.title}`);
      console.log(`  Total volumes: ${series.totalVolumes}`);
      console.log(`  Available in NC Cardinal: ${series.availableVolumes}`);
      console.log(`  Complete: ${series.isComplete}`);
    }

    // Test 2: Search with volume number
    console.log('\n--- Test 2: Search "demon slayer 12" ---');
    const vol12Results = await search('demon slayer 12');
    console.log(`Parsed: title="${vol12Results.parsedQuery.title}", vol=${vol12Results.parsedQuery.volumeNumber}`);
    if (vol12Results.bestMatch?.type === 'volume') {
      const vol = vol12Results.bestMatch.volume;
      console.log(`Best match: ${vol?.title}`);
      console.log(`  ISBN: ${vol?.isbn}`);
      console.log(`  Available: ${vol?.availability?.available ?? 'Unknown'}`);
      console.log(`  Copies: ${vol?.availability?.totalCopies ?? 0}`);
    }

    // Test 3: Typo handling
    console.log('\n--- Test 3: Search "demonslayer" (typo) ---');
    const typoResults = await search('demonslayer');
    console.log(`Found ${typoResults.series.length} series`);
    if (typoResults.series[0]) {
      console.log(`Best match: ${typoResults.series[0].title}`);
    }

    // Test 4: Romanized name
    console.log('\n--- Test 4: Search "Kimetsu no Yaiba" (romanized) ---');
    const romanizedResults = await search('Kimetsu no Yaiba');
    console.log(`Found ${romanizedResults.series.length} series`);
    if (romanizedResults.series[0]) {
      console.log(`Best match: ${romanizedResults.series[0].title}`);
    }

    // Test 5: Smaller series
    console.log('\n--- Test 5: Search "Hirayasumi" ---');
    const hirayasumiResults = await search('Hirayasumi');
    console.log(`Found ${hirayasumiResults.series.length} series, ${hirayasumiResults.volumes.length} volumes`);
    if (hirayasumiResults.series[0]) {
      const series = hirayasumiResults.series[0];
      console.log(`Best match: ${series.title}`);
      console.log(`  Total volumes: ${series.totalVolumes}`);
      console.log(`  Available in NC Cardinal: ${series.availableVolumes}`);
    }

    // Test 6: Get series details
    console.log('\n--- Test 6: Get series details for "Given" ---');
    const givenDetails = await getSeriesDetails('Given manga');
    if (givenDetails) {
      console.log(`Series: ${givenDetails.title}`);
      console.log(`  Total volumes: ${givenDetails.totalVolumes}`);
      console.log(`  Available: ${givenDetails.availableCount}`);
      console.log(`  Missing volumes: ${givenDetails.missingVolumes.join(', ') || 'None!'}`);
      console.log(`  Volumes:`);
      for (const vol of givenDetails.volumes.slice(0, 5)) {
        const status = vol.availability?.available ? '✅' : '❌';
        console.log(`    Vol ${vol.volumeNumber}: ${status} ${vol.availability?.totalCopies ?? 0} copies`);
      }
      if (givenDetails.volumes.length > 5) {
        console.log(`    ... and ${givenDetails.volumes.length - 5} more`);
      }
    }

  } catch (error) {
    console.error('Error during testing:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete!');
  console.log('='.repeat(60));
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(console.error);
}

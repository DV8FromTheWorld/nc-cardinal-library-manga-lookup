/**
 * Manga Search Service
 *
 * Unified search orchestrator that combines:
 * - Wikipedia for canonical series data and ISBNs
 * - Google Books as fallback
 * - NC Cardinal for library availability
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
  getMangaSeries as getWikipediaSeries,
  searchManga as searchWikipedia,
  type WikiMangaSeries,
  type WikiVolume,
} from './wikipedia-client.js';

import {
  searchMangaVolumes as searchGoogleBooks,
  type GoogleBooksSeries,
  type GoogleBooksVolume,
} from './google-books-client.js';

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
  id: string;  // Wikipedia pageid or generated slug
  slug: string; // URL-friendly slug
  title: string;
  totalVolumes: number;
  availableVolumes: number;
  isComplete: boolean;
  author?: string | undefined;
  coverImage?: string | undefined;
  source: 'wikipedia' | 'google-books';
  volumes?: VolumeInfo[] | undefined;
}

export interface VolumeInfo {
  volumeNumber: number;
  title?: string | undefined;
  isbn?: string | undefined;
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
  id: string;  // Wikipedia pageid or generated slug
  slug: string; // URL-friendly slug
  title: string;
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
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')  // Remove apostrophes
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '')  // Trim dashes from start/end
    .slice(0, 100);  // Limit length
}

/**
 * Get cover image URL from various sources
 * Priority: Google Books > Open Library > AniList
 */
function getCoverImageUrl(isbn?: string, googleThumbnail?: string): string | undefined {
  // Google Books thumbnail (if available)
  if (googleThumbnail) {
    // Upgrade to larger image
    return googleThumbnail.replace('zoom=1', 'zoom=2').replace('&edge=curl', '');
  }
  
  // Open Library cover (reliable fallback for ISBNs)
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  }
  
  return undefined;
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
  };
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
  let wikiSeries: WikiMangaSeries | null = null;
  const wikiStart = Date.now();
  try {
    wikiSeries = await getWikipediaSeries(parsedQuery.title);
    if (wikiSeries) {
      debug.sources.push('wikipedia');
    }
  } catch (error) {
    console.warn('[MangaSearch] Wikipedia search failed:', error);
    debug.errors.push(`Wikipedia: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  debug.timing.wikipedia = Date.now() - wikiStart;

  // Step 2: If Wikipedia didn't find anything, try Google Books
  let googleSeries: GoogleBooksSeries[] = [];
  if (!wikiSeries || wikiSeries.volumes.length === 0) {
    const gbStart = Date.now();
    try {
      googleSeries = await searchGoogleBooks(parsedQuery.title);
      if (googleSeries.length > 0) {
        debug.sources.push('google-books');
      }
    } catch (error) {
      console.warn('[MangaSearch] Google Books search failed:', error);
      debug.errors.push(`Google Books: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    debug.timing.googleBooks = Date.now() - gbStart;
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
  } else if (googleSeries.length > 0) {
    // Add Google Books ISBNs
    for (const series of googleSeries.slice(0, 2)) {
      for (const vol of series.volumes) {
        if (vol.isbn13) {
          isbnsToCheck.push(vol.isbn13);
        } else if (vol.isbn10) {
          isbnsToCheck.push(vol.isbn10);
        }
      }
    }
  }

  // Step 4: Check availability in NC Cardinal
  console.log(`[MangaSearch] Checking availability for ${isbnsToCheck.length} ISBNs...`);
  let availability = new Map<string, VolumeAvailability>();
  const ncStart = Date.now();
  if (isbnsToCheck.length > 0) {
    try {
      availability = await getAvailabilityByISBNs(isbnsToCheck, { org: 'CARDINAL', homeLibrary });
      debug.sources.push('nc-cardinal');
      
      // Step 4b: If all ISBNs came back as "not in catalog", try a title search on NC Cardinal
      // This handles the case where Google Books has different ISBNs than the library
      const foundInCatalog = Array.from(availability.values()).some(a => !a.notInCatalog);
      if (!foundInCatalog && googleSeries.length > 0) {
        console.log(`[MangaSearch] ISBNs not found, trying direct title search on NC Cardinal...`);
        const titleSearchResults = await searchCatalog(`${parsedQuery.title} manga`, {
          searchClass: 'title',
          count: 40,
        });
        
        if (titleSearchResults.records.length > 0) {
          console.log(`[MangaSearch] Found ${titleSearchResults.records.length} records via title search!`);
          
          // Build availability from the title search results
          // Group records by extracted volume number
          const volumeRecords = new Map<number, CatalogRecord>();
          for (const record of titleSearchResults.records) {
            // Try to extract volume number from title
            const titleLower = record.title.toLowerCase();
            // Skip if this doesn't look like our series
            if (!titleLower.includes(parsedQuery.title.toLowerCase().split(' ')[0] || '')) {
              continue;
            }
            
            const volMatch = record.volumeNumber 
              || record.title.match(/(?:vol\.?|v\.?|#)\s*(\d+)/i)?.[1]
              || record.title.match(/\.\s*(\d+)\s*$/)?.[1];
            const volNum = volMatch ? parseInt(String(volMatch), 10) : undefined;
            
            if (volNum && volNum > 0 && volNum < 1000) {
              // If we don't have this volume yet, or this record has more ISBNs, use it
              if (!volumeRecords.has(volNum) || record.isbns.length > (volumeRecords.get(volNum)?.isbns.length ?? 0)) {
                volumeRecords.set(volNum, record);
              }
            }
          }
          
          // Now update the Google Books series with the found ISBNs and availability
          if (volumeRecords.size > 0 && googleSeries[0]) {
            console.log(`[MangaSearch] Mapped ${volumeRecords.size} volumes from NC Cardinal title search`);
            
            // Update the volumes in the Google Books series with NC Cardinal ISBNs
            for (const vol of googleSeries[0].volumes) {
              if (vol.volumeNumber) {
                const ncRecord = volumeRecords.get(vol.volumeNumber);
                if (ncRecord) {
                  // Replace Google Books ISBN with NC Cardinal ISBN
                  const ncIsbn = ncRecord.isbns.find(i => i.startsWith('978')) ?? ncRecord.isbns[0];
                  if (ncIsbn) {
                    vol.isbn13 = ncIsbn;
                    vol.isbn10 = undefined;
                    
                    // Build availability from this record with local/remote breakdown
                    const detailedSummary = getDetailedAvailabilitySummary(ncRecord, homeLibrary);
                    availability.set(ncIsbn, detailedSummary);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('[MangaSearch] NC Cardinal availability check failed:', error);
      debug.errors.push(`NC Cardinal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  debug.timing.ncCardinal = Date.now() - ncStart;

  // Step 5: Build results
  if (wikiSeries && wikiSeries.volumes.length > 0) {
    const seriesResult = buildSeriesResultFromWikipedia(wikiSeries, availability);
    result.series.push(seriesResult);

    // Build volume results
    for (const vol of wikiSeries.volumes) {
      const volAvail = vol.englishISBN ? availability.get(vol.englishISBN) : undefined;
      result.volumes.push({
        title: `${wikiSeries.title}, Vol. ${vol.volumeNumber}${vol.title ? `: ${vol.title}` : ''}`,
        volumeNumber: vol.volumeNumber,
        seriesTitle: wikiSeries.title,
        isbn: vol.englishISBN,
        coverImage: getCoverImageUrl(vol.englishISBN),
        availability: volAvail,
        source: 'wikipedia',
      });
    }
  } else if (googleSeries.length > 0) {
    // Use Google Books results
    for (const series of googleSeries.slice(0, 3)) {
      const seriesResult = buildSeriesResultFromGoogle(series, availability);
      result.series.push(seriesResult);

      // Build volume results
      for (const vol of series.volumes) {
        const isbn = vol.isbn13 ?? vol.isbn10;
        const volAvail = isbn ? availability.get(isbn) : undefined;
        result.volumes.push({
          title: vol.title,
          volumeNumber: vol.volumeNumber,
          seriesTitle: series.title,
          isbn,
          coverImage: getCoverImageUrl(isbn, vol.thumbnail),
          availability: volAvail,
          source: 'google-books',
        });
      }
    }
  }

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
  options: { includeDebug?: boolean; homeLibrary?: string | undefined } = {}
): Promise<SeriesDetails | null> {
  const { includeDebug = false, homeLibrary } = options;
  const debug = createDebugInfo();
  
  // Try Wikipedia first
  const wikiStart = Date.now();
  const wikiSeries = await getWikipediaSeries(seriesTitle);
  debug.timing.wikipedia = Date.now() - wikiStart;

  if (!wikiSeries || wikiSeries.volumes.length === 0) {
    console.log(`[MangaSearch] Series not found: "${seriesTitle}"`);
    debug.errors.push(`Series not found: "${seriesTitle}"`);
    return null;
  }
  
  debug.sources.push('wikipedia');

  // Collect ISBNs
  const isbns = wikiSeries.volumes
    .map(v => v.englishISBN)
    .filter((isbn): isbn is string => isbn !== undefined);

  // Check availability
  console.log(`[MangaSearch] Checking availability for ${isbns.length} volumes...`);
  const ncStart = Date.now();
  const availability = await getAvailabilityByISBNs(isbns, { org: 'CARDINAL', homeLibrary });
  debug.timing.ncCardinal = Date.now() - ncStart;
  debug.sources.push('nc-cardinal');

  // Get first volume's ISBN for cover image
  const firstVolumeIsbn = wikiSeries.volumes[0]?.englishISBN;

  // Build volume info
  const volumes: VolumeInfo[] = wikiSeries.volumes.map(vol => ({
    volumeNumber: vol.volumeNumber,
    title: vol.title,
    isbn: vol.englishISBN,
    coverImage: getCoverImageUrl(vol.englishISBN),
    availability: vol.englishISBN ? availability.get(vol.englishISBN) : undefined,
  }));

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
    id: `wiki-${wikiSeries.pageid}`,
    slug: generateSlug(wikiSeries.title),
    title: wikiSeries.title,
    totalVolumes: wikiSeries.totalVolumes,
    isComplete: wikiSeries.isComplete,
    author: wikiSeries.author,
    coverImage: getCoverImageUrl(firstVolumeIsbn),
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

function buildSeriesResultFromWikipedia(
  wiki: WikiMangaSeries,
  availability: Map<string, VolumeAvailability>
): SeriesResult {
  let availableVolumes = 0;
  
  // Get first volume's ISBN for cover image
  const firstVolumeIsbn = wiki.volumes[0]?.englishISBN;

  const volumes: VolumeInfo[] = wiki.volumes.map(vol => {
    const volAvail = vol.englishISBN ? availability.get(vol.englishISBN) : undefined;
    if (volAvail?.available) {
      availableVolumes++;
    }
    return {
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      isbn: vol.englishISBN,
      coverImage: getCoverImageUrl(vol.englishISBN),
      availability: volAvail,
    };
  });

  return {
    id: `wiki-${wiki.pageid}`,
    slug: generateSlug(wiki.title),
    title: wiki.title,
    totalVolumes: wiki.totalVolumes,
    availableVolumes,
    isComplete: wiki.isComplete,
    author: wiki.author,
    coverImage: getCoverImageUrl(firstVolumeIsbn),
    source: 'wikipedia',
    volumes,
  };
}

function buildSeriesResultFromGoogle(
  series: GoogleBooksSeries,
  availability: Map<string, VolumeAvailability>
): SeriesResult {
  let availableVolumes = 0;
  
  // Get first volume for cover image
  const firstVolume = series.volumes[0];
  const firstIsbn = firstVolume?.isbn13 ?? firstVolume?.isbn10;

  const volumes: VolumeInfo[] = series.volumes.map(vol => {
    const isbn = vol.isbn13 ?? vol.isbn10;
    const volAvail = isbn ? availability.get(isbn) : undefined;
    if (volAvail?.available) {
      availableVolumes++;
    }
    return {
      volumeNumber: vol.volumeNumber ?? 0,
      title: vol.subtitle,
      isbn,
      coverImage: getCoverImageUrl(isbn, vol.thumbnail),
      availability: volAvail,
    };
  });

  return {
    id: `gbooks-${series.seriesId}`,
    slug: generateSlug(series.title),
    title: series.title,
    totalVolumes: series.totalVolumesFound,
    availableVolumes,
    isComplete: false, // Google Books doesn't tell us this
    coverImage: getCoverImageUrl(firstIsbn, firstVolume?.thumbnail),
    source: 'google-books',
    volumes,
  };
}

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

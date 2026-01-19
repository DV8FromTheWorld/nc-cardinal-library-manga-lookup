/**
 * Manga Search Service
 *
 * Unified search service that combines:
 * - LibraryThing Talpa API for ISBN lookups
 * - AniList API for series metadata
 * - NC Cardinal OpenSearch for availability
 *
 * This provides the core functionality for:
 * 1. Searching manga (returns series + books)
 * 2. Getting series details with all volumes
 * 3. Checking availability in NC Cardinal
 */

import * as fs from 'fs';
import * as path from 'path';

// Import clients
import * as anilist from './anilist-client.js';
import * as opensearch from './opensearch-client.js';

// Try to import librarything (may fail if API key not set)
let _librarything: typeof import('./librarything-client.js') | null = null;
try {
  _librarything = await import('./librarything-client.js');
} catch {
  console.warn('⚠️  LibraryThing client not available (missing API key?)');
}

// ============================================================================
// Types
// ============================================================================

export interface SeriesMatch {
  id: number;                    // AniList ID
  name: string;
  slug: string;
  volumes: number | null;        // Total volumes in series
  status: string;                // FINISHED, RELEASING, etc.
  isMainSeries: boolean;
  volumesInLibrary?: number;     // Volumes found in NC Cardinal
  coverImage?: string;
}

export interface BookMatch {
  title: string;
  volumeNumber?: number | undefined;
  series?: {
    id: number;
    name: string;
    slug: string;
  } | undefined;
  isbns: string[];
  ncCardinalRecordId?: string | undefined;
  availability?: AvailabilityInfo | undefined;
}

export interface AvailabilityInfo {
  totalCopies: number;
  availableCopies: number;
  locations: string[];
}

export interface SearchResponse {
  series: SeriesMatch[];
  books: BookMatch[];
}

export interface SeriesBooksResponse {
  series: SeriesMatch;
  volumes: VolumeInfo[];
  missingVolumes: number[];
}

export interface VolumeInfo {
  volumeNumber: number;
  title: string;
  isbns: string[];
  ncCardinalRecordId?: string | undefined;
  availability?: AvailabilityInfo | undefined;
}

// ============================================================================
// Cache
// ============================================================================

const CACHE_DIR = path.join(process.cwd(), '.cache', 'search-service');

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(type: string, query: string): string {
  const sanitized = query.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${type}_${sanitized}.json`;
}

function loadFromCache<T>(cacheKey: string): T | null {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  if (fs.existsSync(cachePath)) {
    try {
      const data = fs.readFileSync(cachePath, 'utf-8');
      console.log(`  📁 Cache hit: ${cacheKey}`);
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function saveToCache<T>(cacheKey: string, data: T): void {
  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, cacheKey);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  console.log(`  💾 Cached: ${cacheKey}`);
}

// ============================================================================
// Main Search Function
// ============================================================================

/**
 * Search for manga by query
 *
 * Returns both series matches and individual book matches.
 * Example: searching "demon slayer" returns:
 * - Series: "Demon Slayer: Kimetsu no Yaiba", "Demon Slayer: Kimetsu Academy"
 * - Books: Specific volumes found in NC Cardinal
 */
export async function searchManga(
  query: string,
  options: { skipCache?: boolean; checkAvailability?: boolean } = {}
): Promise<SearchResponse> {
  const { skipCache = false, checkAvailability = true } = options;
  const cacheKey = getCacheKey('search', query);

  // Check cache
  if (!skipCache) {
    const cached = loadFromCache<SearchResponse>(cacheKey);
    if (cached) return cached;
  }

  console.log(`\n🔍 Searching for: "${query}"`);

  // Step 1: Search AniList for series info
  console.log('  Step 1: Searching AniList for series...');
  const anilistResults = await anilist.searchManga(query, { perPage: 10, skipCache });

  // Convert to SeriesMatch
  const series: SeriesMatch[] = anilistResults.series.map((s) => ({
    id: s.id,
    name: s.title,
    slug: anilist.createSlug(s.title),
    volumes: s.volumes,
    status: s.status,
    isMainSeries: s.isMainSeries,
  }));

  // Step 2: Search NC Cardinal for books
  console.log('  Step 2: Searching NC Cardinal for books...');
  const ncResults = await opensearch.searchCatalog(query, {
    searchClass: 'keyword',
    count: 20,
  });

  // Convert NC Cardinal results to BookMatch
  const books: BookMatch[] = ncResults.records.map((record) => {
    // Try to match with a series from AniList
    const matchedSeries = findMatchingSeries(record.title, series);
    
    // Get volume number from MARC data first, then try extracting from title
    let volumeNumber = record.volumeNumber != null ? parseInt(record.volumeNumber, 10) : null;
    if (volumeNumber === null || isNaN(volumeNumber)) {
      volumeNumber = extractVolumeNumber(record.title);
    }

    // Calculate availability from holdings
    const totalCopies = record.holdings.length;
    const availableCopies = record.holdings.filter((h) => h.available).length;
    const locations = [...new Set(record.holdings.map((h) => h.libraryName))];

    return {
      title: record.title,
      volumeNumber: volumeNumber ?? undefined,
      series: matchedSeries
        ? {
            id: matchedSeries.id,
            name: matchedSeries.name,
            slug: matchedSeries.slug,
          }
        : undefined,
      isbns: record.isbns,
      ncCardinalRecordId: record.id,
      availability: checkAvailability
        ? {
            totalCopies,
            availableCopies,
            locations,
          }
        : undefined,
    };
  });

  // Update series with library counts
  if (checkAvailability) {
    for (const s of series) {
      const seriesBooks = books.filter((b) => b.series?.id === s.id);
      s.volumesInLibrary = new Set(seriesBooks.map((b) => b.volumeNumber).filter(Boolean)).size;
    }
  }

  const response: SearchResponse = { series, books };

  // Cache the result
  if (!skipCache) {
    saveToCache(cacheKey, response);
  }

  return response;
}

/**
 * Get all books in a series with NC Cardinal availability
 *
 * This is for the "Part of series: X" detail view.
 */
export async function getSeriesBooks(
  seriesId: number,
  options: { skipCache?: boolean } = {}
): Promise<SeriesBooksResponse | null> {
  const { skipCache = false } = options;
  const cacheKey = getCacheKey('series-books', seriesId.toString());

  // Check cache
  if (!skipCache) {
    const cached = loadFromCache<SeriesBooksResponse>(cacheKey);
    if (cached) return cached;
  }

  console.log(`\n📚 Getting series ${seriesId} books...`);

  // Get series info from AniList
  const seriesInfo = await anilist.getMangaById(seriesId, { skipCache });
  if (!seriesInfo) {
    console.log('  ❌ Series not found in AniList');
    return null;
  }

  const series: SeriesMatch = {
    id: seriesInfo.id,
    name: seriesInfo.title,
    slug: anilist.createSlug(seriesInfo.title),
    volumes: seriesInfo.volumes,
    status: seriesInfo.status,
    isMainSeries: seriesInfo.isMainSeries,
  };

  // Search NC Cardinal for all volumes
  console.log(`  Searching NC Cardinal for "${seriesInfo.title}"...`);
  const ncResults = await opensearch.searchCatalog(seriesInfo.title, {
    searchClass: 'title',
    count: 50,
  });

  // Group by volume number
  const volumeMap = new Map<number, VolumeInfo>();

  for (const record of ncResults.records) {
    // Get volume number from MARC data first, then try extracting from title
    let volNum = record.volumeNumber != null ? parseInt(record.volumeNumber, 10) : null;
    if (volNum === null || isNaN(volNum)) {
      volNum = extractVolumeNumber(record.title);
    }
    if (volNum === null) continue;

    // Only include if it matches the series
    if (!titleMatchesSeries(record.title, seriesInfo.title)) continue;

    // Calculate availability from holdings
    const totalCopies = record.holdings.length;
    const availableCopies = record.holdings.filter((h) => h.available).length;
    const locations = [...new Set(record.holdings.map((h) => h.libraryName))];

    const existing = volumeMap.get(volNum);
    if (!existing) {
      volumeMap.set(volNum, {
        volumeNumber: volNum,
        title: record.title,
        isbns: record.isbns,
        ncCardinalRecordId: record.id,
        availability: {
          totalCopies,
          availableCopies,
          locations,
        },
      });
    } else {
      // Merge ISBNs and add copies
      existing.isbns = [...new Set([...existing.isbns, ...record.isbns])];
      if (existing.availability) {
        existing.availability.totalCopies += totalCopies;
        existing.availability.availableCopies += availableCopies;
        existing.availability.locations = [
          ...new Set([
            ...existing.availability.locations,
            ...locations,
          ]),
        ];
      }
    }
  }

  const volumes = Array.from(volumeMap.values()).sort((a, b) => a.volumeNumber - b.volumeNumber);

  // Calculate missing volumes
  const missingVolumes: number[] = [];
  if (seriesInfo.volumes != null && seriesInfo.volumes > 0) {
    const foundVolumes = new Set(volumes.map((v) => v.volumeNumber));
    for (let i = 1; i <= seriesInfo.volumes; i++) {
      if (!foundVolumes.has(i)) {
        missingVolumes.push(i);
      }
    }
  }

  series.volumesInLibrary = volumes.length;

  const response: SeriesBooksResponse = {
    series,
    volumes,
    missingVolumes,
  };

  // Cache the result
  if (!skipCache) {
    saveToCache(cacheKey, response);
  }

  return response;
}

/**
 * Quick lookup: given an ISBN, find what series it belongs to
 */
export async function findSeriesByISBN(isbn: string): Promise<SeriesMatch | null> {
  // First, search NC Cardinal by ISBN (use keyword search since ISBN isn't a valid search class)
  const ncResults = await opensearch.searchCatalog(isbn, {
    searchClass: 'keyword',
    count: 5,
  });

  if (ncResults.records.length === 0) {
    console.log(`  No NC Cardinal results for ISBN ${isbn}`);
    return null;
  }

  const record = ncResults.records[0]!;
  const title = record.title;

  // Search AniList with the title
  const anilistResults = await anilist.searchManga(title, { perPage: 5 });

  // Find the best match
  for (const series of anilistResults.series) {
    if (titleMatchesSeries(title, series.title)) {
      return {
        id: series.id,
        name: series.title,
        slug: anilist.createSlug(series.title),
        volumes: series.volumes,
        status: series.status,
        isMainSeries: series.isMainSeries,
      };
    }
  }

  return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract volume number from a title
 */
function extractVolumeNumber(title: string): number | null {
  const patterns = [
    /Volume\s+(\d+)/i,
    /Vol\.?\s*(\d+)/i,
    /,\s*(\d+)(?:$|:|\s)/,
    /#(\d+)/,
    /\s(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match != null && match[1] != null) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Find a matching series from a list based on title
 */
function findMatchingSeries(title: string, series: SeriesMatch[]): SeriesMatch | null {
  const normalizedTitle = normalizeTitle(title);

  for (const s of series) {
    const normalizedSeriesName = normalizeTitle(s.name);
    if (normalizedTitle.includes(normalizedSeriesName)) {
      return s;
    }
  }

  return null;
}

/**
 * Check if a title matches a series name
 */
function titleMatchesSeries(title: string, seriesName: string): boolean {
  const normalizedTitle = normalizeTitle(title);
  const normalizedSeries = normalizeTitle(seriesName);

  // Check if the title starts with the series name
  return normalizedTitle.startsWith(normalizedSeries) ||
         normalizedTitle.includes(normalizedSeries);
}

/**
 * Normalize a title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Test/Demo
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Manga Search Service Test');
  console.log('='.repeat(60));

  try {
    // Test 1: Search for "demon slayer"
    console.log('\n--- Test 1: Search for "demon slayer" ---');
    const searchResults = await searchManga('demon slayer');
    
    console.log('\nSeries found:');
    for (const s of searchResults.series) {
      const mainLabel = s.isMainSeries ? '📚 Main' : '📖 Spin-off';
      console.log(`  ${mainLabel}: ${s.name}`);
      console.log(`    Volumes: ${s.volumes ?? '?'}, In library: ${s.volumesInLibrary ?? '?'}`);
    }

    console.log('\nBooks in NC Cardinal:');
    for (const book of searchResults.books.slice(0, 5)) {
      const seriesInfo = book.series != null ? ` (${book.series.name})` : '';
      const volInfo = book.volumeNumber != null ? `Vol ${book.volumeNumber}` : '';
      console.log(`  📖 ${book.title}`);
      console.log(`    ${volInfo}${seriesInfo}`);
      if (book.availability) {
        console.log(`    Available: ${book.availability.availableCopies}/${book.availability.totalCopies}`);
      }
    }

    // Test 2: Get series books
    console.log('\n--- Test 2: Get "Demon Slayer" series books ---');
    const demonSlayerId = 87216;
    const seriesBooks = await getSeriesBooks(demonSlayerId);
    
    if (seriesBooks) {
      console.log(`\nSeries: ${seriesBooks.series.name}`);
      console.log(`Total volumes: ${seriesBooks.series.volumes}`);
      console.log(`In library: ${seriesBooks.volumes.length}`);
      console.log(`Missing: ${seriesBooks.missingVolumes.length > 0 ? seriesBooks.missingVolumes.join(', ') : 'None'}`);
      
      console.log('\nAvailable volumes:');
      for (const vol of seriesBooks.volumes.slice(0, 5)) {
        const avail = vol.availability;
        console.log(`  Vol ${vol.volumeNumber}: ${avail?.availableCopies ?? '?'}/${avail?.totalCopies ?? '?'} available`);
      }
      if (seriesBooks.volumes.length > 5) {
        console.log(`  ... and ${seriesBooks.volumes.length - 5} more`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
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

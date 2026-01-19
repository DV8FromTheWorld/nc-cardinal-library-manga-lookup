/**
 * LibraryThing Talpa Search API Client
 *
 * Uses the Talpa Search API for natural language book searches.
 * Returns work IDs and ISBNs that can be cross-referenced with NC Cardinal.
 *
 * API Documentation: https://www.librarything.com/developer/documentation/talpa
 *
 * Rate Limits:
 * - Talpa: 50 queries/day, 1 query/second
 *
 * NOTE: LibraryThing web pages are protected by Cloudflare, so scraping
 * is not possible. Use AniList for series metadata instead.
 */

import * as fs from 'fs';
import * as path from 'path';

const TALPA_API_URL = 'https://www.librarything.com/api/talpa.php';
const API_TOKEN = process.env.LIBRARYTHING_API_KEY ?? '';

// Cache directory for storing API responses
const CACHE_DIR = path.join(process.cwd(), '.cache', 'talpa');

// Ensure cache directory exists
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Generate cache key from query params
function getCacheKey(query: string, page: number, limit: number): string {
  const sanitized = query.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${sanitized}_p${page}_l${limit}.json`;
}

// Load from cache if exists
function loadFromCache(cacheKey: string): TalpaSearchResult | null {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  if (fs.existsSync(cachePath)) {
    try {
      const data = fs.readFileSync(cachePath, 'utf-8');
      const cached = JSON.parse(data) as TalpaSearchResult;
      console.log(`  📁 Loaded from cache: ${cacheKey}`);
      return cached;
    } catch {
      return null;
    }
  }
  return null;
}

// Save to cache
function saveToCache(cacheKey: string, data: TalpaSearchResult): void {
  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, cacheKey);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  console.log(`  💾 Saved to cache: ${cacheKey}`);
}

const API_TOKEN_MISSING = API_TOKEN === '' || API_TOKEN === 'your_key_here';

if (API_TOKEN_MISSING) {
  console.warn('⚠️  LIBRARYTHING_API_KEY not set or is default value.');
  console.warn('   LibraryThing Talpa API calls will fail.');
  console.warn('   Get an API key at: https://www.librarything.com/services/keys.php');
}

// ============================================================================
// Types
// ============================================================================

export interface TalpaSearchResult {
  request: {
    query: string;
    page: number;
    limit: number;
    token: string;
    developer: {
      dailyquota: number;
      remaining: number;
    };
  };
  response: {
    query_id: string;
    searchtook: number;
    results: number;
    pages: number;
    version: string;
    resultlist: TalpaWork[];
  };
}

export interface TalpaWork {
  rank: number;
  title: string;
  work_id: number;
  score: number;
  isbns?: string[];
  upcs?: string[];
}

// ============================================================================
// API Functions
// ============================================================================

export interface SearchOptions {
  page?: number;
  limit?: number;
  nocaching?: boolean;
  skipLocalCache?: boolean; // Skip local file cache (still respects API nocaching)
}

/**
 * Search LibraryThing using Talpa natural language search
 * Results are cached locally to preserve API quota (50/day)
 */
export async function searchTalpa(
  query: string,
  options: SearchOptions = {}
): Promise<TalpaSearchResult> {
  if (API_TOKEN_MISSING) {
    throw new Error('LIBRARYTHING_API_KEY is not configured');
  }

  const { page = 1, limit = 20, nocaching = false, skipLocalCache = false } = options;
  const effectiveLimit = Math.min(limit, 50); // Max 50

  // Check local cache first (unless explicitly skipped)
  const cacheKey = getCacheKey(query, page, effectiveLimit);
  if (!skipLocalCache) {
    const cached = loadFromCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Make API request
  const params = new URLSearchParams({
    search: query,
    token: API_TOKEN,
    page: page.toString(),
    limit: effectiveLimit.toString(),
  });

  if (nocaching) {
    params.set('nocaching', '1');
  }

  const url = `${TALPA_API_URL}?${params}`;
  console.log(`🌐 Talpa API: ${query} (page ${page}, limit ${effectiveLimit})`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Talpa API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as TalpaSearchResult;

  // Save to local cache
  if (!skipLocalCache) {
    saveToCache(cacheKey, data);
  }

  return data;
}

/**
 * Clear the local cache
 */
export function clearCache(): void {
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true });
    console.log('Cache cleared');
  }
}

/**
 * List cached queries
 */
export function listCache(): string[] {
  if (!fs.existsSync(CACHE_DIR)) {
    return [];
  }
  return fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
}

/**
 * Search for a specific manga series
 */
export async function searchMangaSeries(
  seriesName: string,
  options: SearchOptions = {}
): Promise<TalpaWork[]> {
  const result = await searchTalpa(`${seriesName} manga`, options);
  return result.response.resultlist;
}

/**
 * Search by ISBN to find work details
 */
export async function searchByISBN(isbn: string): Promise<TalpaWork | null> {
  const cleanISBN = isbn.replace(/[-\s]/g, '');
  const result = await searchTalpa(cleanISBN, { limit: 5 });

  // Find the work that has this ISBN
  const match = result.response.resultlist.find((work) =>
    work.isbns?.some((i) => i.replace(/[-\s]/g, '') === cleanISBN)
  );

  return match ?? result.response.resultlist[0] ?? null;
}

/**
 * Get all ISBNs for works matching a query
 * Useful for cross-referencing with NC Cardinal
 */
export async function getAllISBNsForQuery(
  query: string,
  maxPages: number = 3
): Promise<string[]> {
  const allISBNs: Set<string> = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const result = await searchTalpa(query, { page, limit: 50 });

    // Handle empty or missing resultlist
    const resultlist = result.response.resultlist ?? [];
    for (const work of resultlist) {
      if (work.isbns) {
        work.isbns.forEach((isbn) => allISBNs.add(isbn));
      }
    }

    // Stop if we've seen all results
    if (page >= result.response.pages || resultlist.length === 0) break;

    // Rate limit: 1 query per second
    await new Promise((r) => setTimeout(r, 1000));
  }

  return Array.from(allISBNs);
}

/**
 * Get remaining API quota
 */
export async function getQuotaStatus(): Promise<{ dailyquota: number; remaining: number }> {
  // Make a minimal search to get quota info
  const result = await searchTalpa('test', { limit: 1 });
  return result.request.developer;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract volume number from a title
 * e.g., "One Piece, Volume 1: Romance Dawn" -> "1"
 */
export function extractVolumeNumber(title: string): string | null {
  const patterns = [
    /Volume\s+(\d+)/i,
    /Vol\.?\s*(\d+)/i,
    /,\s*(\d+):/,
    /#(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return match[1]!;
    }
  }

  return null;
}

/**
 * Group works by likely series (based on title prefix)
 */
export function groupWorksBySeries(works: TalpaWork[]): Map<string, TalpaWork[]> {
  const seriesMap = new Map<string, TalpaWork[]>();

  for (const work of works) {
    // Extract series name (text before volume/number indicators)
    const seriesMatch = work.title.match(/^(.+?)(?:,?\s*(?:Volume|Vol\.?|#)\s*\d+|$)/i);
    const seriesName = seriesMatch?.[1]?.trim() ?? work.title;

    const existing = seriesMap.get(seriesName) ?? [];
    existing.push(work);
    seriesMap.set(seriesName, existing);
  }

  return seriesMap;
}

// ============================================================================
// Test/Demo
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('LibraryThing Talpa API Client Test');
  console.log('='.repeat(60));
  console.log(`API Token configured: ${!API_TOKEN_MISSING ? 'Yes' : 'No'}\n`);

  if (API_TOKEN_MISSING) {
    console.log('\n❌ Cannot run Talpa tests without API token.');
    console.log('Add to .env: LIBRARYTHING_API_KEY=your_token');
    return;
  }

  try {
    console.log('\n--- Test 1: Search for "One Piece manga" ---');
    const result = await searchTalpa('One Piece manga', { limit: 5 });
    console.log(`Total results: ${result.response.results}`);
    console.log(`Query took: ${result.response.searchtook}s`);
    console.log(`Quota remaining: ${result.request.developer.remaining}/${result.request.developer.dailyquota}`);
    console.log('\nResults:');
    const resultlist = result.response.resultlist ?? [];
    if (resultlist.length === 0) {
      console.log('  (No results - may have hit rate limit)');
    }
    for (const work of resultlist) {
      const volNum = extractVolumeNumber(work.title);
      console.log(`  ${work.rank}. [${work.work_id}] ${work.title}`);
      console.log(`     Volume: ${volNum ?? 'N/A'}`);
      console.log(`     ISBNs: ${work.isbns?.slice(0, 3).join(', ') ?? 'None'}`);
    }

    // Test series grouping
    console.log('\n--- Test 2: Group works by series ---');
    const seriesGroups = groupWorksBySeries(resultlist);
    for (const [seriesName, works] of seriesGroups) {
      console.log(`  ${seriesName}: ${works.length} works`);
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

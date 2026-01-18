/**
 * Google Books API Client for Manga Series Data
 *
 * Uses the Google Books API as a fallback source for manga volume information.
 * The public API (no auth required) provides:
 * - Volume search with ISBNs
 * - Series grouping via seriesInfo.seriesId
 * - Volume numbers via seriesInfo.bookDisplayNumber
 *
 * Note: For full series metadata (title, total volumes), OAuth is required.
 * This client uses the public endpoint for volume lookups.
 */

import * as fs from 'fs';
import * as path from 'path';

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
const CACHE_DIR = path.join(process.cwd(), '.cache', 'google-books');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ============================================================================
// Types
// ============================================================================

export interface GoogleBooksVolume {
  id: string;
  title: string;
  subtitle?: string | undefined;
  authors: string[];
  publisher?: string | undefined;
  publishedDate?: string | undefined;
  pageCount?: number | undefined;
  isbn10?: string | undefined;
  isbn13?: string | undefined;
  thumbnail?: string | undefined;
  seriesId?: string | undefined;
  volumeNumber?: number | undefined;
  description?: string | undefined;
}

export interface GoogleBooksSeries {
  seriesId: string;
  title: string; // Derived from volume titles
  volumes: GoogleBooksVolume[];
  totalVolumesFound: number;
}

export interface GoogleBooksSearchResult {
  totalItems: number;
  volumes: GoogleBooksVolume[];
}

interface GoogleBooksAPIResponse {
  kind?: string;
  totalItems?: number;
  items?: GoogleBooksAPIItem[];
}

interface GoogleBooksAPIItem {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    seriesInfo?: {
      kind?: string;
      shortSeriesBookTitle?: string;
      bookDisplayNumber?: string;
      volumeSeries?: Array<{
        seriesId?: string;
        seriesBookType?: string;
        orderNumber?: number;
      }>;
    };
  };
}

// ============================================================================
// Cache Helpers
// ============================================================================

function getCacheKey(query: string): string {
  const sanitized = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 100);
  return `search_${sanitized}.json`;
}

function readCache<T>(cacheKey: string): T | null {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  try {
    if (!fs.existsSync(cachePath)) return null;
    
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) {
      fs.unlinkSync(cachePath);
      return null;
    }
    
    const data = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

function writeCache<T>(cacheKey: string, data: T): void {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Search for volumes by query
 */
export async function searchVolumes(
  query: string,
  options: { maxResults?: number } = {}
): Promise<GoogleBooksSearchResult> {
  const { maxResults = 40 } = options;
  
  const cacheKey = getCacheKey(`${query}_${maxResults}`);
  const cached = readCache<GoogleBooksSearchResult>(cacheKey);
  if (cached) {
    console.log(`[GoogleBooks] Cache hit for: "${query}"`);
    return cached;
  }

  const params = new URLSearchParams({
    q: query,
    maxResults: maxResults.toString(),
    printType: 'books',
  });

  const url = `${GOOGLE_BOOKS_API}?${params}`;
  console.log(`[GoogleBooks] Searching: "${query}"`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status}`);
  }

  const data = await response.json() as GoogleBooksAPIResponse;
  
  const volumes = (data.items ?? []).map(parseVolume).filter((v): v is GoogleBooksVolume => v !== null);
  
  const result: GoogleBooksSearchResult = {
    totalItems: data.totalItems ?? 0,
    volumes,
  };

  writeCache(cacheKey, result);
  return result;
}

/**
 * Parse a Google Books API item into our volume type
 */
function parseVolume(item: GoogleBooksAPIItem): GoogleBooksVolume | null {
  const info = item.volumeInfo;
  if (!info?.title) return null;

  // Extract ISBNs
  let isbn10: string | undefined;
  let isbn13: string | undefined;
  
  for (const id of info.industryIdentifiers ?? []) {
    if (id.type === 'ISBN_10') {
      isbn10 = id.identifier;
    } else if (id.type === 'ISBN_13') {
      isbn13 = id.identifier;
    }
  }

  // Extract series info
  const seriesInfo = info.seriesInfo?.volumeSeries?.[0];
  const volumeNumber = info.seriesInfo?.bookDisplayNumber 
    ? parseInt(info.seriesInfo.bookDisplayNumber, 10) 
    : undefined;

  return {
    id: item.id,
    title: info.title,
    subtitle: info.subtitle,
    authors: info.authors ?? [],
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    pageCount: info.pageCount,
    isbn10,
    isbn13,
    thumbnail: info.imageLinks?.thumbnail,
    seriesId: seriesInfo?.seriesId,
    volumeNumber: isNaN(volumeNumber ?? NaN) ? undefined : volumeNumber,
    description: info.description,
  };
}

/**
 * Extract a normalized series title from a volume title
 * "Ascendance of a Bookworm (Manga) Part 2 Volume 1" → "Ascendance of a Bookworm (Manga)"
 */
function extractSeriesTitle(volumeTitle: string): string {
  return volumeTitle
    // Remove volume number patterns
    .replace(/,?\s*Vol(?:ume)?\.?\s*\d+.*$/i, '')
    .replace(/\s*Volume\s*\d+.*$/i, '')
    // Remove part indicators but keep them for grouping
    .replace(/\s*Part\s*\d+\s*Volume.*$/i, match => {
      const partMatch = match.match(/Part\s*(\d+)/i);
      return partMatch ? ` Part ${partMatch[1]}` : '';
    })
    // Remove trailing parenthetical info that's volume-specific
    .replace(/\s*\([^)]*\d+[^)]*\)\s*$/, '')
    .trim();
}

/**
 * Extract volume number from a title
 * "Ascendance of a Bookworm (Manga) Part 2 Volume 1" → 1
 * "Demon Slayer, Vol. 5" → 5
 */
function extractVolumeNumber(title: string): number | undefined {
  // Try various patterns
  const patterns = [
    /Vol(?:ume)?\.?\s*(\d+)/i,
    /Volume\s*(\d+)/i,
    /Part\s*\d+\s*Volume\s*(\d+)/i,
    /#\s*(\d+)/,
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num < 1000) return num;
    }
  }
  
  return undefined;
}

/**
 * Search for manga volumes and group by series
 */
export async function searchMangaVolumes(
  seriesTitle: string,
  options: { maxResults?: number } = {}
): Promise<GoogleBooksSeries[]> {
  const { maxResults = 40 } = options;
  
  // Search with "manga" to filter results (unless already included)
  const query = seriesTitle.toLowerCase().includes('manga') 
    ? seriesTitle 
    : `${seriesTitle} manga`;
  const searchResult = await searchVolumes(query, { maxResults });
  
  console.log(`[GoogleBooks] Search returned ${searchResult.totalItems} total, ${searchResult.volumes.length} volumes`);
  
  // Group volumes by series ID OR by normalized title pattern
  const seriesMap = new Map<string, GoogleBooksVolume[]>();
  
  for (const volume of searchResult.volumes) {
    // Filter out non-manga items (coloring books, notebooks, etc.)
    const titleLower = volume.title.toLowerCase();
    if (titleLower.includes('coloring') || 
        titleLower.includes('notebook') || 
        titleLower.includes('composition') ||
        titleLower.includes('box set') ||
        titleLower.includes('collection set')) {
      continue;
    }
    
    // Determine grouping key: prefer seriesId, fall back to title pattern
    let groupKey: string;
    if (volume.seriesId) {
      groupKey = `id:${volume.seriesId}`;
    } else {
      // Use normalized title as grouping key
      const normalizedTitle = extractSeriesTitle(volume.title).toLowerCase();
      groupKey = `title:${normalizedTitle}`;
    }
    
    // If volume doesn't have a volume number, try to extract it from title
    if (volume.volumeNumber === undefined) {
      volume.volumeNumber = extractVolumeNumber(volume.title);
    }
    
    const existing = seriesMap.get(groupKey) ?? [];
    existing.push(volume);
    seriesMap.set(groupKey, existing);
  }

  console.log(`[GoogleBooks] Grouped into ${seriesMap.size} potential series`);

  // Convert map to array of series
  const series: GoogleBooksSeries[] = [];
  
  for (const [groupKey, volumes] of seriesMap) {
    // Deduplicate volumes by ISBN (prefer volumes with more metadata)
    const uniqueVolumes = new Map<string, GoogleBooksVolume>();
    for (const vol of volumes) {
      const isbn = vol.isbn13 ?? vol.isbn10 ?? vol.id;
      const existing = uniqueVolumes.get(isbn);
      if (!existing || (vol.volumeNumber !== undefined && existing.volumeNumber === undefined)) {
        uniqueVolumes.set(isbn, vol);
      }
    }
    const dedupedVolumes = Array.from(uniqueVolumes.values());
    
    // Sort volumes by volume number
    dedupedVolumes.sort((a, b) => (a.volumeNumber ?? 999) - (b.volumeNumber ?? 999));
    
    // Derive series title from the first volume's title
    const firstVolume = dedupedVolumes[0];
    let title = firstVolume ? extractSeriesTitle(firstVolume.title) : seriesTitle;
    
    // Use actual seriesId if available, otherwise generate one from title
    const seriesId = groupKey.startsWith('id:') 
      ? groupKey.slice(3) 
      : `title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    
    series.push({
      seriesId,
      title,
      volumes: dedupedVolumes,
      totalVolumesFound: dedupedVolumes.length,
    });
  }

  // Sort series by number of volumes found (most complete first)
  series.sort((a, b) => b.totalVolumesFound - a.totalVolumesFound);

  console.log(`[GoogleBooks] Returning ${series.length} series, best has ${series[0]?.totalVolumesFound ?? 0} volumes`);

  return series;
}

/**
 * Get volumes for a specific series with ISBNs
 */
export async function getSeriesVolumes(
  seriesTitle: string,
  options: { maxResults?: number } = {}
): Promise<GoogleBooksVolume[]> {
  const series = await searchMangaVolumes(seriesTitle, options);
  
  // Return volumes from the best matching series
  if (series.length > 0 && series[0]) {
    return series[0].volumes;
  }
  
  return [];
}

/**
 * Get ISBNs for all volumes of a series
 */
export async function getSeriesISBNs(
  seriesTitle: string,
  options: { prefer13?: boolean } = {}
): Promise<Array<{ volumeNumber?: number | undefined; isbn: string }>> {
  const { prefer13 = true } = options;
  
  const volumes = await getSeriesVolumes(seriesTitle);
  
  const results: Array<{ volumeNumber?: number | undefined; isbn: string }> = [];
  
  for (const v of volumes) {
    const isbn = prefer13 ? (v.isbn13 ?? v.isbn10) : (v.isbn10 ?? v.isbn13);
    if (isbn) {
      results.push({ volumeNumber: v.volumeNumber, isbn });
    }
  }
  
  return results;
}

/**
 * Search by ISBN
 */
export async function searchByISBN(isbn: string): Promise<GoogleBooksVolume | null> {
  // Clean ISBN
  const cleanISBN = isbn.replace(/[-\s]/g, '');
  
  const result = await searchVolumes(`isbn:${cleanISBN}`, { maxResults: 5 });
  
  return result.volumes[0] ?? null;
}

/**
 * Get description for a book by ISBN.
 * Returns the description from Google Books, or null if not found.
 * Results are cached via the underlying searchVolumes cache (24 hours).
 */
export async function getDescriptionByISBN(isbn: string): Promise<string | null> {
  try {
    const volume = await searchByISBN(isbn);
    return volume?.description ?? null;
  } catch (error) {
    console.error(`[GoogleBooks] Failed to fetch description for ISBN ${isbn}:`, error);
    return null;
  }
}

/**
 * Find the common prefix (preamble) between two volume descriptions.
 * This identifies the series overview that appears at the start of all volume descriptions.
 * 
 * @param desc1 - First volume description (typically Vol 1)
 * @param desc2 - Second volume description (typically Vol 2)
 * @returns The common prefix (preamble), or null if no significant common prefix
 */
export function findCommonPreamble(
  desc1: string,
  desc2: string
): string | null {
  if (!desc1 || !desc2) {
    return null;
  }
  
  // Find the longest common prefix character by character
  const minLength = Math.min(desc1.length, desc2.length);
  let commonPrefixEnd = 0;
  
  for (let i = 0; i < minLength; i++) {
    if (desc1[i] === desc2[i]) {
      commonPrefixEnd = i + 1;
    } else {
      break;
    }
  }
  
  // Need at least 50 characters of common prefix to be meaningful
  if (commonPrefixEnd < 50) {
    return null;
  }
  
  // Find the last complete sentence boundary within the common prefix
  const commonPart = desc1.slice(0, commonPrefixEnd);
  
  // Look for sentence endings (. ! ?) followed by space or end of string
  const sentenceEndPattern = /[.!?](?:\s|$)/g;
  let lastSentenceEnd = -1;
  let match;
  
  while ((match = sentenceEndPattern.exec(commonPart)) !== null) {
    // Only count as sentence end if there's more text after or it's end of common part
    lastSentenceEnd = match.index + 1;
  }
  
  // If we found a sentence boundary, use it
  if (lastSentenceEnd > 50) {
    return desc1.slice(0, lastSentenceEnd).trim();
  }
  
  // Otherwise, no good preamble found
  return null;
}

/**
 * Extract the unique portion of a volume description by removing the series preamble.
 * 
 * Many manga volumes have descriptions that start with the same series overview
 * (4-5 sentences) followed by volume-specific content.
 * 
 * This function finds where the volume description diverges from the series preamble
 * and returns only the unique portion.
 * 
 * @param volumeDescription - The full description for a specific volume
 * @param seriesPreamble - The series description (common prefix across volumes)
 * @returns The unique portion of the volume description, or the full description if no common prefix
 */
export function extractUniqueVolumeDescription(
  volumeDescription: string,
  seriesPreamble: string | undefined
): string {
  if (!seriesPreamble || !volumeDescription) {
    return volumeDescription;
  }
  
  // Check if volume description starts with the preamble
  if (!volumeDescription.startsWith(seriesPreamble)) {
    // Descriptions don't share the preamble exactly - check for partial match
    const minLength = Math.min(volumeDescription.length, seriesPreamble.length);
    let matchEnd = 0;
    
    for (let i = 0; i < minLength; i++) {
      if (volumeDescription[i] === seriesPreamble[i]) {
        matchEnd = i + 1;
      } else {
        break;
      }
    }
    
    // If less than 80% matches, return full description
    if (matchEnd < seriesPreamble.length * 0.8) {
      return volumeDescription;
    }
    
    // Find sentence boundary near match end
    const partialMatch = volumeDescription.slice(0, matchEnd);
    const lastSentenceEnd = Math.max(
      partialMatch.lastIndexOf('. '),
      partialMatch.lastIndexOf('! '),
      partialMatch.lastIndexOf('? ')
    );
    
    if (lastSentenceEnd > 50) {
      return volumeDescription.slice(lastSentenceEnd + 2).trim();
    }
    
    return volumeDescription;
  }
  
  // Volume description starts with the exact preamble - extract unique part
  const uniquePart = volumeDescription.slice(seriesPreamble.length).trim();
  
  // If the unique part is empty or very short, return full description
  if (!uniquePart || uniquePart.length < 20) {
    return volumeDescription;
  }
  
  return uniquePart;
}


// ============================================================================
// Test/Demo execution
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Google Books Manga Client Test');
  console.log('='.repeat(60));

  try {
    // Test 1: Search for Demon Slayer volumes
    console.log('\n--- Test 1: Search for Demon Slayer manga volumes ---');
    const demonSlayerSeries = await searchMangaVolumes('Demon Slayer Kimetsu no Yaiba');
    
    for (const series of demonSlayerSeries.slice(0, 2)) {
      console.log(`\nSeries: ${series.title} (ID: ${series.seriesId})`);
      console.log(`Found ${series.totalVolumesFound} volumes:`);
      
      for (const vol of series.volumes.slice(0, 5)) {
        console.log(`  Vol ${vol.volumeNumber ?? '?'}: ${vol.title}`);
        console.log(`    ISBN-13: ${vol.isbn13 ?? 'N/A'}`);
      }
      if (series.volumes.length > 5) {
        console.log(`  ... and ${series.volumes.length - 5} more`);
      }
    }

    // Test 2: Search for Hirayasumi
    console.log('\n--- Test 2: Search for Hirayasumi volumes ---');
    const hirayasumiVolumes = await getSeriesVolumes('Hirayasumi');
    console.log(`Found ${hirayasumiVolumes.length} volumes:`);
    for (const vol of hirayasumiVolumes) {
      console.log(`  Vol ${vol.volumeNumber ?? '?'}: ${vol.isbn13 ?? vol.isbn10 ?? 'No ISBN'}`);
    }

    // Test 3: Get ISBNs for Given
    console.log('\n--- Test 3: Get Given ISBNs ---');
    const givenISBNs = await getSeriesISBNs('Given manga');
    console.log(`Found ${givenISBNs.length} ISBNs:`);
    for (const item of givenISBNs.slice(0, 5)) {
      console.log(`  Vol ${item.volumeNumber ?? '?'}: ${item.isbn}`);
    }
    if (givenISBNs.length > 5) {
      console.log(`  ... and ${givenISBNs.length - 5} more`);
    }

    // Test 4: ISBN lookup
    console.log('\n--- Test 4: ISBN lookup ---');
    const byISBN = await searchByISBN('978-1-9747-0052-3');
    if (byISBN) {
      console.log(`Found: ${byISBN.title}`);
      console.log(`  Authors: ${byISBN.authors.join(', ')}`);
      console.log(`  Publisher: ${byISBN.publisher}`);
      console.log(`  Volume #: ${byISBN.volumeNumber}`);
      console.log(`  Series ID: ${byISBN.seriesId}`);
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

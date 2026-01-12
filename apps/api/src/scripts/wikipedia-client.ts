/**
 * Wikipedia API Client for Manga Series Data
 *
 * Uses Wikipedia's API to fetch manga series information including:
 * - OpenSearch API for fuzzy title matching (handles typos, romanized names)
 * - Page content API for wikitext with volume/ISBN data
 * - Parses {{Graphic novel list}} templates for structured volume data
 */

import * as fs from 'fs';
import * as path from 'path';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const CACHE_DIR = path.join(process.cwd(), '.cache', 'wikipedia');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ============================================================================
// Types
// ============================================================================

export interface WikiSearchResult {
  title: string;
  pageid: number;
  url: string;
}

export type MediaType = 'manga' | 'light_novel' | 'unknown';

export interface WikiMangaSeries {
  title: string;
  pageid: number;
  volumes: WikiVolume[];
  totalVolumes: number;
  isComplete: boolean;
  mediaType: MediaType;
  author?: string | undefined;
  publisher?: string | undefined;
  chapterListPageId?: number | undefined;
}

export interface WikiVolume {
  volumeNumber: number;
  japaneseISBN?: string | undefined;
  englishISBN?: string | undefined;
  japaneseReleaseDate?: string | undefined;
  englishReleaseDate?: string | undefined;
  title?: string | undefined; // Volume subtitle/title
  mediaType?: MediaType | undefined; // For pages with mixed content
}

interface WikiPageContent {
  pageid: number;
  title: string;
  wikitext: string;
}

// ============================================================================
// Cache Helpers
// ============================================================================

function getCacheKey(type: string, query: string): string {
  const sanitized = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 100);
  return `${type}_${sanitized}.json`;
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
// Wikipedia API Functions
// ============================================================================

/**
 * Search for manga titles using Wikipedia's OpenSearch API
 * This handles typos and alternate names well (e.g., "demonslayer" finds "Demon Slayer")
 */
export async function searchManga(query: string, limit: number = 10): Promise<WikiSearchResult[]> {
  const cacheKey = getCacheKey('search', query);
  const cached = readCache<WikiSearchResult[]>(cacheKey);
  if (cached) {
    console.log(`[Wikipedia] Cache hit for search: "${query}"`);
    return cached;
  }

  const params = new URLSearchParams({
    action: 'opensearch',
    search: query,
    limit: limit.toString(),
    namespace: '0',
    format: 'json',
  });

  const url = `${WIKIPEDIA_API}?${params}`;
  console.log(`[Wikipedia] OpenSearch: ${query}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wikipedia API error: ${response.status}`);
  }

  const data = await response.json() as [string, string[], string[], string[]];
  const [, titles, , urls] = data;

  const results: WikiSearchResult[] = [];
  for (let i = 0; i < titles.length; i++) {
    // Filter to likely manga results
    const title = titles[i];
    if (!title) continue;
    
    results.push({
      title,
      pageid: 0, // We'll get this from the page fetch
      url: urls[i] ?? '',
    });
  }

  writeCache(cacheKey, results);
  return results;
}

/**
 * Search specifically for manga chapter/volume list pages
 */
export async function searchMangaChapterList(seriesTitle: string): Promise<WikiSearchResult | null> {
  // Try various page naming patterns
  const searchPatterns = [
    `List of ${seriesTitle} chapters`,
    `List of ${seriesTitle} manga chapters`,
    `List of ${seriesTitle} volumes`,
    `${seriesTitle} (manga)`,
    seriesTitle,
  ];

  for (const pattern of searchPatterns) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: pattern,
      srlimit: '5',
      format: 'json',
    });

    const url = `${WIKIPEDIA_API}?${params}`;
    const response = await fetch(url);
    if (!response.ok) continue;

    const data = await response.json() as { query?: { search?: Array<{ title: string; pageid: number }> } };
    const results = data.query?.search ?? [];

    // Look for chapter list or manga pages
    for (const result of results) {
      const title = result.title.toLowerCase();
      if (title.includes('chapter') || title.includes('volume') || title.includes('manga')) {
        return {
          title: result.title,
          pageid: result.pageid,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`,
        };
      }
    }
  }

  return null;
}

/**
 * Fetch the wikitext content of a page
 */
async function getPageContent(pageid: number): Promise<WikiPageContent | null> {
  const cacheKey = getCacheKey('page', pageid.toString());
  const cached = readCache<WikiPageContent>(cacheKey);
  if (cached) {
    console.log(`[Wikipedia] Cache hit for page: ${pageid}`);
    return cached;
  }

  const params = new URLSearchParams({
    action: 'query',
    pageids: pageid.toString(),
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    format: 'json',
  });

  const url = `${WIKIPEDIA_API}?${params}`;
  console.log(`[Wikipedia] Fetching page: ${pageid}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wikipedia API error: ${response.status}`);
  }

  const data = await response.json() as {
    query?: {
      pages?: Record<string, {
        pageid?: number;
        title?: string;
        revisions?: Array<{ slots?: { main?: { '*'?: string } } }>;
      }>;
    };
  };

  const page = data.query?.pages?.[pageid.toString()];
  if (!page?.revisions?.[0]?.slots?.main?.['*']) {
    return null;
  }

  const content: WikiPageContent = {
    pageid: page.pageid ?? pageid,
    title: page.title ?? '',
    wikitext: page.revisions[0].slots.main['*'],
  };

  writeCache(cacheKey, content);
  return content;
}

/**
 * Fetch page content by title
 */
async function getPageContentByTitle(title: string): Promise<WikiPageContent | null> {
  const cacheKey = getCacheKey('page_title', title);
  const cached = readCache<WikiPageContent>(cacheKey);
  if (cached) {
    console.log(`[Wikipedia] Cache hit for page: "${title}"`);
    return cached;
  }

  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    redirects: '1', // Follow redirects automatically
    format: 'json',
  });

  const url = `${WIKIPEDIA_API}?${params}`;
  console.log(`[Wikipedia] Fetching page by title: "${title}"`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wikipedia API error: ${response.status}`);
  }

  const data = await response.json() as {
    query?: {
      redirects?: Array<{ from: string; to: string }>;
      pages?: Record<string, {
        pageid?: number;
        title?: string;
        revisions?: Array<{ slots?: { main?: { '*'?: string } } }>;
      }>;
    };
  };

  // Log if we followed a redirect
  if (data.query?.redirects?.length) {
    console.log(`[Wikipedia] Followed redirect: "${data.query.redirects[0]?.from}" → "${data.query.redirects[0]?.to}"`);
  }

  const pages = data.query?.pages;
  if (!pages) return null;

  // Get the first (and should be only) page
  const pageId = Object.keys(pages)[0];
  if (!pageId || pageId === '-1') return null;

  const page = pages[pageId];
  if (!page?.revisions?.[0]?.slots?.main?.['*']) {
    return null;
  }

  const content: WikiPageContent = {
    pageid: page.pageid ?? parseInt(pageId),
    title: page.title ?? title,
    wikitext: page.revisions[0].slots.main['*'],
  };

  writeCache(cacheKey, content);
  return content;
}

// ============================================================================
// Wikitext Parsing
// ============================================================================

/**
 * Detect the media type from a section header
 */
function detectMediaType(header: string): MediaType {
  const lower = header.toLowerCase();
  if (lower.includes('light novel') || lower.includes('novel')) {
    return 'light_novel';
  }
  if (lower.includes('manga')) {
    return 'manga';
  }
  return 'unknown';
}

/**
 * Check if a volume title indicates it's a spin-off/side story
 */
function isSpinoffTitle(title: string | undefined): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return (
    lower.includes('short story') ||
    lower.includes('side story') ||
    lower.includes('anthology') ||
    lower.includes('gaiden') ||
    lower.includes('stories –') ||  // "Royal Academy Stories – First Year"
    lower.includes('stories -') ||
    lower.includes('fan book') ||
    lower.includes('guidebook') ||
    lower.includes('art book')
  );
}

/**
 * Parse volume list from wikitext
 * Handles {{Graphic novel list}} templates used in manga chapter list pages
 * Also detects section headers to differentiate light novels from manga
 */
export function parseVolumeList(wikitext: string): WikiVolume[] {
  const volumes: WikiVolume[] = [];
  
  // Split the wikitext by {{Graphic novel list to get each volume's content
  // The templates have complex nested content, so we extract by field patterns instead
  const lines = wikitext.split('\n');
  
  let currentVolume: Partial<WikiVolume> | null = null;
  let currentMediaType: MediaType = 'unknown';
  let currentPartNumber: number | undefined;
  let partVolumeOffset = 0; // For re-numbering manga parts sequentially
  let lastVolumeInPart = 0;
  
  for (const line of lines) {
    // Detect section headers like ===Light novels=== or ===Manga===
    const sectionMatch = line.match(/^={2,4}\s*(.+?)\s*={2,4}$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1] ?? '';
      const newMediaType = detectMediaType(sectionName);
      if (newMediaType !== 'unknown') {
        currentMediaType = newMediaType;
        // Reset part tracking when switching media types
        currentPartNumber = undefined;
        partVolumeOffset = 0;
        lastVolumeInPart = 0;
      }
      
      // Detect manga parts like ====''Part 1''==== or ====Part 1====
      const partMatch = sectionName.match(/part\s*(\d+)/i);
      if (partMatch) {
        const newPartNumber = parseInt(partMatch[1] ?? '0', 10);
        if (currentPartNumber !== undefined && newPartNumber > currentPartNumber) {
          // Moving to a new part - add the last part's volumes to offset
          partVolumeOffset += lastVolumeInPart;
          lastVolumeInPart = 0;
        }
        currentPartNumber = newPartNumber;
      }
      continue;
    }
    
    // Start of a new volume template
    if (line.includes('{{Graphic novel list') && !line.includes('/header')) {
      // Save previous volume if exists
      if (currentVolume?.volumeNumber !== undefined) {
        const adjustedVolumeNumber = currentPartNumber !== undefined 
          ? currentVolume.volumeNumber + partVolumeOffset 
          : currentVolume.volumeNumber;
        
        lastVolumeInPart = Math.max(lastVolumeInPart, currentVolume.volumeNumber);
        
        volumes.push({
          volumeNumber: adjustedVolumeNumber,
          japaneseISBN: currentVolume.japaneseISBN,
          englishISBN: currentVolume.englishISBN,
          japaneseReleaseDate: currentVolume.japaneseReleaseDate,
          englishReleaseDate: currentVolume.englishReleaseDate,
          title: currentVolume.title,
          mediaType: currentMediaType,
        });
      }
      currentVolume = { mediaType: currentMediaType };
      continue;
    }
    
    // Skip if we're not inside a volume template
    if (!currentVolume) continue;
    
    // Extract field values from lines like "| FieldName = value" or " | FieldName = value"
    const fieldMatch = line.match(/^\s*\|\s*(\w+)\s*=\s*(.+)/);
    if (!fieldMatch) continue;
    
    const [, fieldName, rawValue] = fieldMatch;
    if (!fieldName || !rawValue) continue;
    
    // Clean the value - remove refs, templates, wiki links
    let value = rawValue
      .replace(/<ref[^>]*>.*?<\/ref>/g, '')
      .replace(/<ref[^>]*\/>/g, '')
      .replace(/\{\{[^{}]*\}\}/g, '') // Simple nested templates
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
      .replace(/'''?/g, '')
      .trim();
    
    const fieldLower = fieldName.toLowerCase();
    
    if (fieldLower === 'volumenumber') {
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        currentVolume.volumeNumber = num;
      }
    } else if (fieldLower === 'isbn' || fieldLower === 'originalisbn') {
      currentVolume.japaneseISBN = cleanISBN(value);
    } else if (fieldLower === 'licensedisbn') {
      currentVolume.englishISBN = cleanISBN(value);
    } else if (fieldLower === 'reldate' || fieldLower === 'originalreldate') {
      currentVolume.japaneseReleaseDate = value;
    } else if (fieldLower === 'licensedreldate') {
      currentVolume.englishReleaseDate = value;
    } else if (fieldLower === 'licensedtitle' || fieldLower === 'originaltitle' || fieldLower === 'title') {
      if (!currentVolume.title) {
        currentVolume.title = value;
      }
    }
  }
  
  // Don't forget the last volume
  if (currentVolume?.volumeNumber !== undefined) {
    const adjustedVolumeNumber = currentPartNumber !== undefined 
      ? currentVolume.volumeNumber + partVolumeOffset 
      : currentVolume.volumeNumber;
    
    volumes.push({
      volumeNumber: adjustedVolumeNumber,
      japaneseISBN: currentVolume.japaneseISBN,
      englishISBN: currentVolume.englishISBN,
      japaneseReleaseDate: currentVolume.japaneseReleaseDate,
      englishReleaseDate: currentVolume.englishReleaseDate,
      title: currentVolume.title,
      mediaType: currentVolume.mediaType ?? currentMediaType,
    });
  }
  
  // Filter out spin-offs and side stories
  const mainVolumes = volumes.filter(v => !isSpinoffTitle(v.title));
  
  // Deduplicate by volume number within each media type
  // (keep the first one with an ISBN, which is usually the main series)
  const deduplicatedVolumes: WikiVolume[] = [];
  const seenByTypeAndNumber = new Map<string, WikiVolume>();
  
  for (const vol of mainVolumes) {
    const key = `${vol.mediaType ?? 'unknown'}-${vol.volumeNumber}`;
    const existing = seenByTypeAndNumber.get(key);
    
    if (!existing) {
      seenByTypeAndNumber.set(key, vol);
      deduplicatedVolumes.push(vol);
    } else if (!existing.englishISBN && vol.englishISBN) {
      // Replace if the new one has an ISBN and the old one doesn't
      const idx = deduplicatedVolumes.indexOf(existing);
      if (idx >= 0) {
        deduplicatedVolumes[idx] = vol;
        seenByTypeAndNumber.set(key, vol);
      }
    }
  }
  
  // Sort by volume number within each media type
  deduplicatedVolumes.sort((a, b) => {
    // First sort by media type (manga before light_novel)
    if (a.mediaType !== b.mediaType) {
      if (a.mediaType === 'manga') return -1;
      if (b.mediaType === 'manga') return 1;
      if (a.mediaType === 'light_novel') return -1;
      if (b.mediaType === 'light_novel') return 1;
    }
    return a.volumeNumber - b.volumeNumber;
  });
  
  return deduplicatedVolumes;
}

/**
 * Clean ISBN - normalize to just digits and convert ISBN-10 to ISBN-13
 */
function cleanISBN(isbn: string | undefined): string | undefined {
  if (!isbn) return undefined;
  // Keep only digits and X, remove hyphens and spaces
  let cleaned = isbn.replace(/[^0-9Xx]/g, '');
  
  if (cleaned.length < 10) return undefined;
  
  // Convert ISBN-10 to ISBN-13
  if (cleaned.length === 10) {
    cleaned = convertISBN10to13(cleaned);
  }
  
  return cleaned.length >= 13 ? cleaned : undefined;
}

/**
 * Convert ISBN-10 to ISBN-13
 */
function convertISBN10to13(isbn10: string): string {
  // Remove check digit from ISBN-10
  const base = isbn10.slice(0, 9);
  // Add 978 prefix
  const isbn13Base = '978' + base;
  
  // Calculate ISBN-13 check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(isbn13Base[i] ?? '0', 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return isbn13Base + checkDigit;
}

/**
 * Check if a series appears to be complete based on wikitext
 */
function checkSeriesComplete(wikitext: string): boolean {
  const lowerText = wikitext.toLowerCase();
  
  // Common indicators of completion
  if (lowerText.includes('finished') || 
      lowerText.includes('completed') ||
      lowerText.includes('concluded')) {
    return true;
  }
  
  // Check for end date in the intro
  const statusMatch = wikitext.match(/ran\s+(?:from|until)[^.]*?(\d{4})[^.]*?to[^.]*?(\d{4})/i);
  if (statusMatch) {
    return true; // Has both start and end year
  }
  
  return false;
}

/**
 * Extract author from wikitext
 */
function extractAuthor(wikitext: string): string | undefined {
  // Look for common patterns in infoboxes
  const patterns = [
    /\|\s*author\s*=\s*\[\[([^\]|]+)/i,
    /\|\s*writer\s*=\s*\[\[([^\]|]+)/i,
    /written\s+(?:and\s+illustrated\s+)?by\s+\[\[([^\]|]+)/i,
    /\|\s*author\s*=\s*([^|\n]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = wikitext.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

// ============================================================================
// High-Level Functions
// ============================================================================

/**
 * Get complete manga series information including all volumes
 */
export async function getMangaSeries(query: string): Promise<WikiMangaSeries | null> {
  const cacheKey = getCacheKey('series', query);
  const cached = readCache<WikiMangaSeries>(cacheKey);
  if (cached) {
    console.log(`[Wikipedia] Cache hit for series: "${query}"`);
    return cached;
  }

  // Step 1: Search for the series
  const searchResults = await searchManga(query, 10);
  if (searchResults.length === 0) {
    console.log(`[Wikipedia] No results found for: "${query}"`);
    return null;
  }

  // Step 2: Try multiple strategies to find the best page with volume data
  const pagesToTry: string[] = [];
  
  // Normalize query for comparison (handle x vs × and other special chars)
  const normalizeForCompare = (s: string) => s.toLowerCase()
    .replace(/×/g, 'x')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/:/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const queryLower = normalizeForCompare(query);
  
  // Find the best search result - prefer manga-specific pages
  // (the first result might be a disambiguation page)
  let bestResult: WikiSearchResult | undefined;
  let bestScore = -1;
  
  for (const result of searchResults) {
    const title = result.title;
    const titleLower = normalizeForCompare(title);
    
    // Skip results that are clearly not manga (movies, TV, seasons, episodes, spinoffs)
    if (titleLower.includes('movie') || 
        titleLower.includes('film') || 
        titleLower.includes(' tv ') || 
        titleLower.includes('tv series') ||
        titleLower.includes('season ') || 
        titleLower.includes('episode') ||
        titleLower.includes('stampede') ||
        titleLower.includes('ova') ||
        titleLower.includes('special')) {
      continue;
    }
    
    // Score the result
    let score = 0;
    
    // HUGE bonus for "list of ... volumes" or "list of ... chapters" - always prefer these
    if (titleLower.startsWith('list of') && (titleLower.includes('volumes') || titleLower.includes('chapters'))) {
      score += 500;
    }
    
    // Big bonus for "(manga)" in title - this is THE manga page
    if (titleLower.includes('(manga)')) {
      score += 300;
    }
    
    // Bonus for exact title match, but ONLY if it has "(manga)" qualifier
    // Generic exact matches are often disambiguation pages
    if (titleLower === queryLower) {
      // Exact match without qualifier is likely a disambiguation page - small penalty
      score -= 50;
    } else if (titleLower === `${queryLower} (manga)`) {
      // Exact manga page - big bonus
      score += 200;
    }
    
    // Bonus for containing the query (normalized)
    if (titleLower.includes(queryLower)) {
      score += 50;
    }
    
    // Penalty for subtitles/spinoffs (titles with colons that aren't the main series)
    if (title.includes(':') && !titleLower.startsWith(queryLower)) {
      score -= 100;
    }
    
    // Penalty for titles much longer than query (likely spinoffs)
    if (title.length > query.length * 2) {
      score -= 30;
    }
    
    // Small bonus for shorter titles (simpler is usually the main series)
    if (title.length > 5 && title.length < 40) {
      score += 10;
    }
    
    // Penalty for very short generic titles (likely disambiguation)
    if (title.length < 15 && !titleLower.includes('(manga)')) {
      score -= 50;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }
  
  // Fall back to first non-filtered result
  const firstResult = bestResult ?? searchResults.find(r => {
    const t = normalizeForCompare(r.title);
    return !t.includes('movie') && !t.includes('film') && !t.includes(' tv ') && !t.includes('season');
  }) ?? searchResults[0];
  
  console.log(`[Wikipedia] Best search result: "${firstResult?.title}"`);
  
  // Build list of pages to try - use ACTUAL Wikipedia titles from search results
  // to handle special characters like × in "Spy × Family"
  if (firstResult) {
    const actualTitle = firstResult.title;
    
    // Strip common suffixes to get the base series name
    // e.g., "Blue Box (manga)" -> "Blue Box"
    const cleanTitle = actualTitle
      .replace(/\s*\(manga\)\s*$/i, '')
      .replace(/\s*\(Japanese manga\)\s*$/i, '')
      .trim();
    
    // If the search result is already a chapters page, put it first
    if (actualTitle.toLowerCase().includes('chapters') || actualTitle.toLowerCase().includes('volumes')) {
      pagesToTry.push(actualTitle);
    }
    
    // Try various patterns using the CLEAN title (without "(manga)" suffix)
    pagesToTry.push(
      `List of ${cleanTitle} manga volumes`, // One Piece style
      `List of ${cleanTitle} chapters`, // Common pattern - THIS is what Blue Box uses
      cleanTitle, // The main page itself
      `${cleanTitle} (manga)`, // The manga-specific page
      actualTitle, // Original title as fallback
    );
    
    // Also try without subtitles (e.g., "Demon Slayer" from "Demon Slayer: Kimetsu no Yaiba")
    const baseTitle = cleanTitle.split(':')[0]?.trim();
    if (baseTitle && baseTitle !== cleanTitle) {
      pagesToTry.push(
        `List of ${baseTitle} manga volumes`,
        `List of ${baseTitle} chapters`,
        baseTitle,
        `${baseTitle} (manga)`,
      );
    }
  }
  
  // Also add pages based on ALL search results that might have chapters or volumes
  for (const result of searchResults) {
    const title = result.title;
    if ((title.toLowerCase().includes('chapters') || title.toLowerCase().includes('volumes')) && !pagesToTry.includes(title)) {
      pagesToTry.push(title);
    }
  }
  
  // Also try the raw query (in case nothing else works)
  if (!pagesToTry.some(p => normalizeForCompare(p) === `list of ${queryLower} manga volumes`)) {
    pagesToTry.push(
      `List of ${query} manga volumes`,
      `List of ${query} chapters`,
      query,
      `${query} (manga)`,
    );
  }

  let bestPage: WikiPageContent | null = null;
  let bestVolumes: WikiVolume[] = [];
  let bestFullWikitext: string = '';
  
  for (const pageTitle of pagesToTry) {
    const pageContent = await getPageContentByTitle(pageTitle);
    if (!pageContent) continue;
    
    // Always fetch ALL transcluded subpages upfront (for pages like One Piece volume list)
    let fullWikitext = pageContent.wikitext;
    const transclusionMatches = [...pageContent.wikitext.matchAll(/\{\{:([^}]+)\}\}/g)];
    
    if (transclusionMatches.length > 0) {
      console.log(`[Wikipedia] Page "${pageTitle}" has ${transclusionMatches.length} transcluded pages`);
      
      for (const match of transclusionMatches) {
        const subpageTitle = match[1];
        if (subpageTitle && (subpageTitle.toLowerCase().includes('chapter') || subpageTitle.toLowerCase().includes('volume'))) {
          console.log(`[Wikipedia] Fetching transcluded page: ${subpageTitle}`);
          const subpage = await getPageContentByTitle(subpageTitle);
          if (subpage) {
            fullWikitext += '\n' + subpage.wikitext;
          }
        }
      }
    }
    
    const volumes = parseVolumeList(fullWikitext);
    console.log(`[Wikipedia] Page "${pageTitle}" has ${volumes.length} volumes`);
    
    // Keep the page with the most volumes found
    if (volumes.length > bestVolumes.length) {
      bestPage = pageContent;
      bestVolumes = volumes;
      bestFullWikitext = fullWikitext;
    }
    
    // If we found a good number of volumes, we're done
    if (volumes.length >= 10) {
      break;
    }
  }

  if (!bestPage) {
    console.log(`[Wikipedia] Could not find page with volume data for: "${query}"`);
    return null;
  }

  // Extract metadata from the page
  const isComplete = checkSeriesComplete(bestFullWikitext);
  const author = extractAuthor(bestFullWikitext);
  
  // Determine the canonical series title
  let baseSeriesTitle = bestPage.title
    .replace(/^List of /, '')
    .replace(/ chapters?$/i, '')
    .replace(/ manga volumes?$/i, '')
    .replace(/ manga$/i, '')
    .replace(/ \(manga\)$/i, '')
    .replace(/ light novels?$/i, '')
    .trim();

  // Check if we have mixed media types (both manga and light novels)
  const mediaTypes = new Set(bestVolumes.map(v => v.mediaType).filter(t => t && t !== 'unknown'));
  
  // If there are multiple media types, prefer manga and return those
  if (mediaTypes.size > 1) {
    console.log(`[Wikipedia] Page has multiple media types: ${[...mediaTypes].join(', ')}`);
    
    // Prefer manga over light novels
    const preferredType: MediaType = mediaTypes.has('manga') ? 'manga' : 'light_novel';
    const filteredVolumes = bestVolumes.filter(v => v.mediaType === preferredType);
    
    console.log(`[Wikipedia] Using ${preferredType} volumes: ${filteredVolumes.length}`);
    
    const series: WikiMangaSeries = {
      title: `${baseSeriesTitle}${preferredType === 'light_novel' ? ' (Light Novel)' : ''}`,
      pageid: bestPage.pageid,
      volumes: filteredVolumes,
      totalVolumes: filteredVolumes.length,
      isComplete,
      mediaType: preferredType,
      author,
      chapterListPageId: bestPage.pageid,
    };

    writeCache(cacheKey, series);
    return series;
  }

  // Single media type or unknown
  const mediaType: MediaType = mediaTypes.size === 1 ? [...mediaTypes][0] as MediaType : 'manga';

  const series: WikiMangaSeries = {
    title: baseSeriesTitle,
    pageid: bestPage.pageid,
    volumes: bestVolumes,
    totalVolumes: bestVolumes.length,
    isComplete,
    mediaType,
    author,
    chapterListPageId: bestPage.pageid,
  };

  writeCache(cacheKey, series);
  return series;
}

/**
 * Get ALL series from a page (both manga and light novels)
 * Returns separate series for each media type found
 */
export async function getAllSeriesFromPage(query: string): Promise<WikiMangaSeries[]> {
  // First get the cached/fetched data using getMangaSeries
  // Then parse for multiple media types
  const cacheKey = `all_series_${query.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const cached = readCache<WikiMangaSeries[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Get the main series first to ensure we have the page data
  const mainSeries = await getMangaSeries(query);
  if (!mainSeries) {
    return [];
  }

  // Re-fetch the page to get all volumes (getMangaSeries may have filtered)
  const pageContent = await getPageContentByTitle(mainSeries.title);
  if (!pageContent) {
    return [mainSeries];
  }

  // Also try the direct query page
  const queryPage = await getPageContentByTitle(query);
  let fullWikitext = pageContent.wikitext;
  
  if (queryPage && queryPage.pageid !== pageContent.pageid) {
    fullWikitext += '\n' + queryPage.wikitext;
  }

  // Fetch any transcluded pages
  const transclusionMatches = [...fullWikitext.matchAll(/\{\{:([^}]+)\}\}/g)];
  for (const match of transclusionMatches) {
    const subpageTitle = match[1];
    if (subpageTitle && (subpageTitle.toLowerCase().includes('chapter') || subpageTitle.toLowerCase().includes('volume'))) {
      const subpage = await getPageContentByTitle(subpageTitle);
      if (subpage) {
        fullWikitext += '\n' + subpage.wikitext;
      }
    }
  }

  const allVolumes = parseVolumeList(fullWikitext);
  
  // Group volumes by media type
  const volumesByType = new Map<MediaType, WikiVolume[]>();
  for (const volume of allVolumes) {
    const type = volume.mediaType ?? 'unknown';
    if (!volumesByType.has(type)) {
      volumesByType.set(type, []);
    }
    volumesByType.get(type)!.push(volume);
  }

  // Build series for each media type
  const allSeries: WikiMangaSeries[] = [];
  const isComplete = checkSeriesComplete(fullWikitext);
  const author = extractAuthor(fullWikitext);
  
  let baseSeriesTitle = pageContent.title
    .replace(/^List of /, '')
    .replace(/ chapters?$/i, '')
    .replace(/ manga volumes?$/i, '')
    .replace(/ manga$/i, '')
    .replace(/ \(manga\)$/i, '')
    .replace(/ light novels?$/i, '')
    .trim();

  // Also clean from query if baseSeriesTitle still has artifacts
  if (baseSeriesTitle.toLowerCase() === query.toLowerCase() || baseSeriesTitle.includes('chapters')) {
    baseSeriesTitle = query;
  }

  for (const [type, volumes] of volumesByType) {
    if (volumes.length === 0 || type === 'unknown') continue;
    
    const seriesTitle = type === 'light_novel' 
      ? `${baseSeriesTitle} (Light Novel)` 
      : baseSeriesTitle;
    
    allSeries.push({
      title: seriesTitle,
      pageid: pageContent.pageid,
      volumes,
      totalVolumes: volumes.length,
      isComplete,
      mediaType: type,
      author,
      chapterListPageId: pageContent.pageid,
    });
  }

  // If no typed series found, return the main series
  if (allSeries.length === 0) {
    return [mainSeries];
  }

  writeCache(cacheKey, allSeries);
  return allSeries;
}

/**
 * Get volumes for a series by title (convenience function)
 */
export async function getSeriesVolumes(seriesTitle: string): Promise<WikiVolume[]> {
  const series = await getMangaSeries(seriesTitle);
  return series?.volumes ?? [];
}

/**
 * Get English ISBNs for a series
 */
export async function getSeriesISBNs(seriesTitle: string): Promise<string[]> {
  const volumes = await getSeriesVolumes(seriesTitle);
  return volumes
    .map(v => v.englishISBN)
    .filter((isbn): isbn is string => isbn !== undefined);
}

// ============================================================================
// Test/Demo execution
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Wikipedia Manga Client Test');
  console.log('='.repeat(60));

  try {
    // Test 1: OpenSearch with typo
    console.log('\n--- Test 1: OpenSearch (with typo "demonslayer") ---');
    const searchResults = await searchManga('demonslayer', 5);
    console.log('Results:');
    for (const result of searchResults) {
      console.log(`  - ${result.title}`);
    }

    // Test 2: Search with romanized name
    console.log('\n--- Test 2: OpenSearch (romanized "Kimetsu no Yaiba") ---');
    const romanizedResults = await searchManga('Kimetsu no Yaiba', 5);
    console.log('Results:');
    for (const result of romanizedResults) {
      console.log(`  - ${result.title}`);
    }

    // Test 3: Get full series data
    console.log('\n--- Test 3: Get Demon Slayer series data ---');
    const demonSlayer = await getMangaSeries('Demon Slayer');
    if (demonSlayer) {
      console.log(`Title: ${demonSlayer.title}`);
      console.log(`Author: ${demonSlayer.author}`);
      console.log(`Total Volumes: ${demonSlayer.totalVolumes}`);
      console.log(`Complete: ${demonSlayer.isComplete}`);
      console.log(`\nFirst 5 volumes:`);
      for (const vol of demonSlayer.volumes.slice(0, 5)) {
        console.log(`  Vol ${vol.volumeNumber}: ${vol.title ?? '(no title)'}`);
        console.log(`    JP ISBN: ${vol.japaneseISBN ?? 'N/A'}`);
        console.log(`    EN ISBN: ${vol.englishISBN ?? 'N/A'}`);
      }
      console.log(`  ... and ${demonSlayer.volumes.length - 5} more`);
    }

    // Test 4: Get Hirayasumi (smaller series)
    console.log('\n--- Test 4: Get Hirayasumi series data ---');
    const hirayasumi = await getMangaSeries('Hirayasumi');
    if (hirayasumi) {
      console.log(`Title: ${hirayasumi.title}`);
      console.log(`Total Volumes: ${hirayasumi.totalVolumes}`);
      console.log(`Complete: ${hirayasumi.isComplete}`);
      console.log(`\nVolumes:`);
      for (const vol of hirayasumi.volumes) {
        console.log(`  Vol ${vol.volumeNumber}: EN ISBN ${vol.englishISBN ?? 'N/A'}`);
      }
    }

    // Test 5: Get English ISBNs only
    console.log('\n--- Test 5: Get Given English ISBNs ---');
    const givenISBNs = await getSeriesISBNs('Given manga');
    console.log(`Found ${givenISBNs.length} ISBNs:`);
    for (const isbn of givenISBNs.slice(0, 5)) {
      console.log(`  - ${isbn}`);
    }
    if (givenISBNs.length > 5) {
      console.log(`  ... and ${givenISBNs.length - 5} more`);
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

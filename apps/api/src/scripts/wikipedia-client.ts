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

// Parser version - increment when making changes to parsing logic
// This invalidates parsed series cache while preserving raw wikitext cache
const PARSER_VERSION = 3;

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Rate limiting configuration
const RATE_LIMIT_DELAY_MS = 500; // Minimum delay between requests
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
let lastRequestTime = 0;

/**
 * Throttle requests to avoid rate limiting
 */
async function throttleRequest(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

/**
 * User-Agent header required by Wikipedia API guidelines
 * See: https://www.mediawiki.org/wiki/API:Etiquette
 */
const USER_AGENT = 'NCCardinalManga/1.0 (https://github.com/nc-cardinal-manga; manga-search-app)';

/**
 * Fetch with retry logic for rate limiting
 */
async function fetchWithRetry(url: string, label: string): Promise<Response> {
  await throttleRequest();
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });
    
    if (response.status === 429) {
      // Rate limited - wait and retry with exponential backoff
      const retryDelay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Wikipedia] Rate limited (429) on ${label}, retrying in ${retryDelay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        lastRequestTime = Date.now();
        continue;
      }
    }
    
    return response;
  }
  
  // This shouldn't be reached but TypeScript needs it
  throw new Error(`Failed to fetch ${label} after ${MAX_RETRIES} attempts`);
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

export type SeriesRelationship = 'spinoff' | 'sequel' | 'side_story' | 'anthology' | 'prequel' | 'adaptation';

export interface WikiRelatedSeries {
  title: string;
  relationship: SeriesRelationship;
  volumes: WikiVolume[];
  mediaType: MediaType;
}

export interface WikiSeries {
  title: string;
  pageid: number;
  volumes: WikiVolume[];
  totalVolumes: number;
  isComplete: boolean;
  mediaType: MediaType;
  author?: string | undefined;
  publisher?: string | undefined;
  chapterListPageId?: number | undefined;
  relatedSeries?: WikiRelatedSeries[] | undefined;
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

/**
 * Get a versioned cache key for parsed results.
 * When PARSER_VERSION changes, old parsed caches become stale
 * while raw wikitext caches (page_title_*) remain valid.
 */
function getVersionedCacheKey(type: string, query: string): string {
  const sanitized = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 100);
  return `${type}_v${PARSER_VERSION}_${sanitized}.json`;
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
export async function searchSeries(query: string, limit: number = 10): Promise<WikiSearchResult[]> {
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

  const response = await fetchWithRetry(url, `search "${query}"`);
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
export async function searchSeriesChapterList(seriesTitle: string): Promise<WikiSearchResult | null> {
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
    const response = await fetchWithRetry(url, `chapter list search "${pattern}"`);
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

  const response = await fetchWithRetry(url, `page ${pageid}`);
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

  const response = await fetchWithRetry(url, `page title "${title}"`);
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
 * Classify a section as main series or a type of related series.
 * Uses patterns discovered from research on 10+ popular series.
 * 
 * @param sectionName - The section header text (e.g., "Part 1", "Hannelore's Fifth Year")
 * @param mainSeriesTitle - The main series title for comparison
 * @param parentSection - The parent section name if this is nested (e.g., "Manga", "Light novels")
 */
function classifySection(
  sectionName: string,
  mainSeriesTitle: string,
  parentSection?: string
): 'main' | SeriesRelationship {
  const lower = sectionName.toLowerCase();
  
  // Normalize the main series title for comparison
  // Extract first significant word(s) - handles "Ascendance of a Bookworm" -> "ascendance"
  const mainBase = mainSeriesTitle.toLowerCase()
    .replace(/[:']/g, '')
    .replace(/^list of\s+/i, '')
    .replace(/\s+(chapters?|volumes?|manga|light novels?)$/i, '')
    .split(/\s+/)[0] ?? '';
  
  // 1. Part N / Volumes N-M = Main series continuation (JoJo, Bookworm)
  if (/^part\s*\d/i.test(lower)) return 'main';
  if (/^volumes?\s*\d/i.test(lower)) return 'main';
  
  // 2. Generic volume/chapter list sections are always main series
  // (e.g., "Volume list" under "Light novels" = main LN series)
  if (lower === 'volume list' || lower === 'volumes' || lower === 'chapter list' || 
      lower === 'chapters' || lower === 'manga' || lower === 'light novels') {
    return 'main';
  }
  
  // 2. Explicit spin-off sections (Fate, Frieren)
  if (lower.includes('spin-off') || lower.includes('spinoff')) return 'spinoff';
  
  // 3. Year N = Sequel pattern (Classroom of the Elite: Year 2)
  if (/year\s*\d/i.test(lower)) return 'sequel';
  
  // 4. Explicit keywords for specific relationship types
  if (lower.includes('alternative')) return 'spinoff';
  if (lower.includes('progressive')) return 'spinoff';
  if (lower.includes('side stor')) return 'side_story';
  if (lower.includes('short stor')) return 'anthology';
  if (lower.includes('gaiden')) return 'side_story';
  if (lower.includes('prequel')) return 'prequel';
  
  // 5. Stories/anthology collections
  if (lower.includes('stories') && !lower.includes(mainBase)) return 'anthology';
  
  // 6. Extended title pattern: "Main Title: Subtitle" (Blue Lock: Episode Nagi, SAO: Progressive)
  // If the section contains the main title but has additional text, it's likely a spin-off
  if (sectionName.includes(':') && lower.includes(mainBase) && lower !== mainBase) {
    return 'spinoff';
  }
  
  // 7. Nested under media type but completely different title (Hannelore's Fifth Year under Light novels)
  if (parentSection) {
    const parentLower = parentSection.toLowerCase();
    const isUnderMediaType = parentLower.includes('manga') || 
                             parentLower.includes('novel') ||
                             parentLower === 'media';
    
    if (isUnderMediaType && mainBase && !lower.includes(mainBase)) {
      // Different title under a media type section = likely a spin-off
      return 'spinoff';
    }
  }
  
  // 8. Check existing isSpinoffTitle patterns (for volume titles that are used as section names)
  if (isSpinoffTitle(sectionName)) return 'spinoff';
  
  // 9. If section name matches or contains main series name, it's the main series
  if (mainBase && lower.includes(mainBase)) return 'main';
  
  // Default to main if we can't determine otherwise
  return 'main';
}

/**
 * Internal type for tracking parsed sections with their volumes
 */
interface ParsedSection {
  name: string;
  level: number;
  mediaType: MediaType;
  relationship: 'main' | SeriesRelationship;
  volumes: WikiVolume[];
}

/**
 * Parse volume list from wikitext with full section hierarchy tracking.
 * Returns sections with their volumes grouped, classified as main or related series.
 * 
 * @param wikitext - The raw wikitext content
 * @param mainSeriesTitle - The main series title for classification (optional, used for better detection)
 */
function parseVolumeListWithSections(wikitext: string, mainSeriesTitle: string = ''): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = wikitext.split('\n');
  
  // Track section hierarchy
  let l2Section: string | undefined;
  let l3Section: string | undefined;
  let l4Section: string | undefined;
  
  // Current parsing state
  let currentVolume: Partial<WikiVolume> | null = null;
  let currentMediaType: MediaType = 'unknown';
  let currentSection: ParsedSection | null = null;
  
  // Part numbering for sequential volume numbers
  let currentPartNumber: number | undefined;
  let partVolumeOffset = 0;
  let lastVolumeInPart = 0;
  
  // Helper to save current volume to current section
  const saveCurrentVolume = () => {
    if (!currentVolume?.volumeNumber) return;
    
    const adjustedVolumeNumber = currentPartNumber !== undefined 
      ? currentVolume.volumeNumber + partVolumeOffset 
      : currentVolume.volumeNumber;
    
    lastVolumeInPart = Math.max(lastVolumeInPart, currentVolume.volumeNumber);
    
    const volume: WikiVolume = {
      volumeNumber: adjustedVolumeNumber,
      japaneseISBN: currentVolume.japaneseISBN,
      englishISBN: currentVolume.englishISBN,
      japaneseReleaseDate: currentVolume.japaneseReleaseDate,
      englishReleaseDate: currentVolume.englishReleaseDate,
      title: currentVolume.title,
      mediaType: currentMediaType,
    };
    
    if (currentSection) {
      currentSection.volumes.push(volume);
    } else {
      // Create a default section if we haven't seen any section headers yet
      currentSection = {
        name: mainSeriesTitle || 'Main',
        level: 2,
        mediaType: currentMediaType,
        relationship: 'main',
        volumes: [volume],
      };
      sections.push(currentSection);
    }
  };
  
  // Helper to start or update current section based on header
  const processSection = (sectionName: string, level: number) => {
    // Clean the section name (remove wiki formatting)
    const cleanName = sectionName.replace(/'''?/g, '').trim();
    
    // Update hierarchy tracking
    if (level === 2) {
      l2Section = cleanName;
      l3Section = undefined;
      l4Section = undefined;
    } else if (level === 3) {
      l3Section = cleanName;
      l4Section = undefined;
    } else if (level === 4) {
      l4Section = cleanName;
    }
    
    // Detect media type from section name
    const newMediaType = detectMediaType(cleanName);
      if (newMediaType !== 'unknown') {
        currentMediaType = newMediaType;
        // Reset part tracking when switching media types
        currentPartNumber = undefined;
        partVolumeOffset = 0;
        lastVolumeInPart = 0;
      }
      
    // Detect manga parts (for sequential numbering)
    const partMatch = cleanName.match(/part\s*(\d+)/i);
      if (partMatch) {
        const newPartNumber = parseInt(partMatch[1] ?? '0', 10);
        if (currentPartNumber !== undefined && newPartNumber > currentPartNumber) {
          partVolumeOffset += lastVolumeInPart;
          lastVolumeInPart = 0;
        }
        currentPartNumber = newPartNumber;
    }
    
    // Determine parent section for classification
    const parentSection = level === 4 ? l3Section : level === 3 ? l2Section : undefined;
    
    // Classify this section
    const relationship = classifySection(cleanName, mainSeriesTitle, parentSection);
    
    // Create new section if this looks like a content section (not just a heading)
    // We'll add volumes to it as we parse them
    currentSection = {
      name: cleanName,
      level,
          mediaType: currentMediaType,
      relationship,
      volumes: [],
    };
    sections.push(currentSection);
  };
  
  for (const line of lines) {
    // Detect section headers like ===Light novels=== or ===Manga===
    const sectionMatch = line.match(/^(={2,4})\s*(.+?)\s*={2,4}$/);
    if (sectionMatch) {
      // Save any pending volume before switching sections
      saveCurrentVolume();
      currentVolume = null;
      
      const level = sectionMatch[1]?.length ?? 2;
      const sectionName = sectionMatch[2] ?? '';
      processSection(sectionName, level);
      continue;
    }
    
    // Start of a new volume template
    if (line.includes('{{Graphic novel list') && !line.includes('/header')) {
      saveCurrentVolume();
      currentVolume = { mediaType: currentMediaType };
      continue;
    }
    
    // Skip if we're not inside a volume template
    if (!currentVolume) continue;
    
    // Extract field values from lines like "| FieldName = value"
    const fieldMatch = line.match(/^\s*\|\s*(\w+)\s*=\s*(.+)/);
    if (!fieldMatch) continue;
    
    const [, fieldName, rawValue] = fieldMatch;
    if (!fieldName || !rawValue) continue;
    
    // Clean the value - remove refs, templates, wiki links
    const value = rawValue
      .replace(/<ref[^>]*>.*?<\/ref>/g, '')
      .replace(/<ref[^>]*\/>/g, '')
      .replace(/\{\{[^{}]*\}\}/g, '')
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
  saveCurrentVolume();
  
  // Filter out empty sections
  return sections.filter(s => s.volumes.length > 0);
}

/**
 * Parse volume list from wikitext (legacy function for backwards compatibility).
 * Returns only main series volumes, filtering out spin-offs.
 * 
 * @deprecated Use parseVolumeListWithSections for full section tracking
 */
export function parseVolumeList(wikitext: string): WikiVolume[] {
  const sections = parseVolumeListWithSections(wikitext);
  
  // Collect all volumes from main sections
  const mainVolumes: WikiVolume[] = [];
  for (const section of sections) {
    if (section.relationship === 'main') {
      mainVolumes.push(...section.volumes);
    }
  }
  
  // Also filter by volume title for backwards compatibility
  const filteredVolumes = mainVolumes.filter(v => !isSpinoffTitle(v.title));
  
  // Deduplicate by volume number within each media type
  const deduplicatedVolumes: WikiVolume[] = [];
  const seenByTypeAndNumber = new Map<string, WikiVolume>();
  
  for (const vol of filteredVolumes) {
    const key = `${vol.mediaType ?? 'unknown'}-${vol.volumeNumber}`;
    const existing = seenByTypeAndNumber.get(key);
    
    if (!existing) {
      seenByTypeAndNumber.set(key, vol);
      deduplicatedVolumes.push(vol);
    } else if (!existing.englishISBN && vol.englishISBN) {
      const idx = deduplicatedVolumes.indexOf(existing);
      if (idx >= 0) {
        deduplicatedVolumes[idx] = vol;
        seenByTypeAndNumber.set(key, vol);
      }
    }
  }
  
  // Sort by volume number within each media type
  deduplicatedVolumes.sort((a, b) => {
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
export async function getSeries(query: string): Promise<WikiSeries | null> {
  // Use versioned cache key so parsing changes invalidate old cached results
  const cacheKey = getVersionedCacheKey('series', query);
  const cached = readCache<WikiSeries>(cacheKey);
  if (cached) {
    console.log(`[Wikipedia] Cache hit for series: "${query}" (parser v${PARSER_VERSION})`);
    return cached;
  }

  // Step 1: Search for the series
  const searchResults = await searchSeries(query, 10);
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
  
  // Build list of pages to try, prioritizing chapter/volume list pages
  // because they have the most complete volume data
  
  // FIRST: Try query-based chapter list pages (highest priority)
  // These are most likely to have the main series data
  pagesToTry.push(
    `List of ${query} chapters`,
    `List of ${query} manga volumes`,
  );
  
  // SECOND: Build pages from best search result
  if (firstResult) {
    const actualTitle = firstResult.title;
    
    // Strip common suffixes to get the base series name
    // e.g., "Blue Box (manga)" -> "Blue Box"
    const cleanTitle = actualTitle
      .replace(/\s*\(manga\)\s*$/i, '')
      .replace(/\s*\(Japanese manga\)\s*$/i, '')
      .trim();
    
    // If the search result is already a chapters page, add it high priority
    if (actualTitle.toLowerCase().includes('chapters') || actualTitle.toLowerCase().includes('volumes')) {
      if (!pagesToTry.includes(actualTitle)) {
      pagesToTry.push(actualTitle);
      }
    }
    
    // Try various patterns using the CLEAN title (without "(manga)" suffix)
    const cleanTitlePages = [
      `List of ${cleanTitle} chapters`,
      `List of ${cleanTitle} manga volumes`,
      cleanTitle,
      `${cleanTitle} (manga)`,
      actualTitle,
    ];
    for (const page of cleanTitlePages) {
      if (!pagesToTry.includes(page)) {
        pagesToTry.push(page);
      }
    }
    
    // Also try without subtitles (e.g., "Demon Slayer" from "Demon Slayer: Kimetsu no Yaiba")
    const baseTitle = cleanTitle.split(':')[0]?.trim();
    if (baseTitle && baseTitle !== cleanTitle) {
      const baseTitlePages = [
        `List of ${baseTitle} chapters`,
        `List of ${baseTitle} manga volumes`,
        baseTitle,
        `${baseTitle} (manga)`,
      ];
      for (const page of baseTitlePages) {
        if (!pagesToTry.includes(page)) {
          pagesToTry.push(page);
        }
      }
    }
  }
  
  // THIRD: Add pages from ALL search results that might have chapters or volumes
  for (const result of searchResults) {
    const title = result.title;
    if ((title.toLowerCase().includes('chapters') || title.toLowerCase().includes('volumes')) && !pagesToTry.includes(title)) {
      pagesToTry.push(title);
    }
  }
  
  // FOURTH: Try the main query page and manga variant as fallbacks
  const fallbackPages = [query, `${query} (manga)`];
  for (const page of fallbackPages) {
    if (!pagesToTry.includes(page)) {
      pagesToTry.push(page);
    }
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
    
    // Use section-aware parsing to capture related series
    const sections = parseVolumeListWithSections(fullWikitext, pageTitle);
    const totalVolumes = sections.reduce((sum, s) => sum + s.volumes.length, 0);
    console.log(`[Wikipedia] Page "${pageTitle}" has ${totalVolumes} volumes across ${sections.length} sections`);
    
    // Keep the page with the most volumes found
    if (totalVolumes > bestVolumes.length) {
      bestPage = pageContent;
      bestVolumes = sections.flatMap(s => s.volumes);
      bestFullWikitext = fullWikitext;
    }
    
    // If we found a good number of volumes, we're done
    if (totalVolumes >= 10) {
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
    .replace(/ volumes?$/i, '')  // Handle pages like "Bleach volumes"
    .replace(/ manga$/i, '')
    .replace(/ \(manga\)$/i, '')
    .replace(/ light novels?$/i, '')
    .trim();

  // Re-parse with sections to get proper classification
  const allSections = parseVolumeListWithSections(bestFullWikitext, baseSeriesTitle);
  
  // Separate main sections from related series
  const mainSections = allSections.filter(s => s.relationship === 'main');
  const relatedSections = allSections.filter(s => s.relationship !== 'main');
  
  // Collect main volumes, preferring manga over light novels if both exist
  const mainVolumes: WikiVolume[] = [];
  const mainMediaTypes = new Set<MediaType>();
  
  for (const section of mainSections) {
    mainVolumes.push(...section.volumes);
    if (section.mediaType !== 'unknown') {
      mainMediaTypes.add(section.mediaType);
    }
  }
  
  // Deduplicate main volumes by volume number within each media type
  const deduplicatedMain: WikiVolume[] = [];
  const seenByTypeAndNumber = new Map<string, WikiVolume>();
  
  for (const vol of mainVolumes) {
    const key = `${vol.mediaType ?? 'unknown'}-${vol.volumeNumber}`;
    const existing = seenByTypeAndNumber.get(key);
    
    if (!existing) {
      seenByTypeAndNumber.set(key, vol);
      deduplicatedMain.push(vol);
    } else if (!existing.englishISBN && vol.englishISBN) {
      const idx = deduplicatedMain.indexOf(existing);
      if (idx >= 0) {
        deduplicatedMain[idx] = vol;
        seenByTypeAndNumber.set(key, vol);
      }
    }
  }
  
  // Sort main volumes
  deduplicatedMain.sort((a, b) => {
    if (a.mediaType !== b.mediaType) {
      if (a.mediaType === 'manga') return -1;
      if (b.mediaType === 'manga') return 1;
      if (a.mediaType === 'light_novel') return -1;
      if (b.mediaType === 'light_novel') return 1;
    }
    return a.volumeNumber - b.volumeNumber;
  });
  
  // Build related series array from related sections
  const relatedSeries: WikiRelatedSeries[] = [];
  
  for (const section of relatedSections) {
    if (section.volumes.length === 0) continue;
    if (section.relationship === 'main') continue; // Skip main (shouldn't happen but be safe)
    
    relatedSeries.push({
      title: section.name,
      relationship: section.relationship,
      volumes: section.volumes,
      mediaType: section.mediaType,
    });
  }
  
  if (relatedSeries.length > 0) {
    console.log(`[Wikipedia] Found ${relatedSeries.length} related series: ${relatedSeries.map(r => r.title).join(', ')}`);
  }
  
  // Determine primary media type and handle multiple media types
  let mediaType: MediaType = 'manga';
  if (mainMediaTypes.size > 1) {
    // Prefer manga over light novels for the primary series
    mediaType = mainMediaTypes.has('manga') ? 'manga' : 'light_novel';
    const alternateType: MediaType = mediaType === 'manga' ? 'light_novel' : 'manga';
    
    // Filter main volumes by type
    const filteredVolumes = deduplicatedMain.filter(v => v.mediaType === mediaType);
    const alternateVolumes = deduplicatedMain.filter(v => v.mediaType === alternateType);
    
    // Add the alternate media type as a related series with 'adaptation' relationship
    // This ensures both manga and light novel versions are returned
    if (alternateVolumes.length > 0) {
      const alternateTitle = alternateType === 'light_novel' 
        ? `${baseSeriesTitle} (Light Novel)`
        : baseSeriesTitle;
      
      // Insert at the beginning so the main alternate series comes before spin-offs
      relatedSeries.unshift({
        title: alternateTitle,
        relationship: 'adaptation',
        volumes: alternateVolumes,
        mediaType: alternateType,
      });
      
      console.log(`[Wikipedia] Added ${alternateType} adaptation with ${alternateVolumes.length} volumes`);
    }
    
    const series: WikiSeries = {
      title: `${baseSeriesTitle}${mediaType === 'light_novel' ? ' (Light Novel)' : ''}`,
      pageid: bestPage.pageid,
      volumes: filteredVolumes,
      totalVolumes: filteredVolumes.length,
      isComplete,
      mediaType,
      author,
      chapterListPageId: bestPage.pageid,
      relatedSeries: relatedSeries.length > 0 ? relatedSeries : undefined,
    };

    writeCache(cacheKey, series);
    return series;
  }

  // Single media type or unknown
  mediaType = mainMediaTypes.size === 1 ? [...mainMediaTypes][0] as MediaType : 'manga';

  const series: WikiSeries = {
    title: baseSeriesTitle,
    pageid: bestPage.pageid,
    volumes: deduplicatedMain,
    totalVolumes: deduplicatedMain.length,
    isComplete,
    mediaType,
    author,
    chapterListPageId: bestPage.pageid,
    relatedSeries: relatedSeries.length > 0 ? relatedSeries : undefined,
  };

  writeCache(cacheKey, series);
  return series;
}

/**
 * Get ALL series from a page (both manga and light novels)
 * Returns separate series for each media type found
 */
export async function getAllSeriesFromPage(query: string): Promise<WikiSeries[]> {
  // Use versioned cache key so parsing changes invalidate old cached results
  const cacheKey = getVersionedCacheKey('all_series', query);
  const cached = readCache<WikiSeries[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Get the main series first to ensure we have the page data
  const mainSeries = await getSeries(query);
  if (!mainSeries) {
    return [];
  }

  // Re-fetch the page to get all volumes (getSeries may have filtered)
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
  const allSeries: WikiSeries[] = [];
  const isComplete = checkSeriesComplete(fullWikitext);
  const author = extractAuthor(fullWikitext);
  
  let baseSeriesTitle = pageContent.title
    .replace(/^List of /, '')
    .replace(/ chapters?$/i, '')
    .replace(/ manga volumes?$/i, '')
    .replace(/ volumes?$/i, '')  // Handle pages like "Bleach volumes"
    .replace(/ manga$/i, '')
    .replace(/ \(manga\)$/i, '')
    .replace(/ light novels?$/i, '')
    .trim();

  // Also clean from query if baseSeriesTitle still has artifacts
  if (baseSeriesTitle.toLowerCase() === query.toLowerCase() || baseSeriesTitle.includes('chapters') || baseSeriesTitle.includes('volumes')) {
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
  const series = await getSeries(seriesTitle);
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
    const searchResults = await searchSeries('demonslayer', 5);
    console.log('Results:');
    for (const result of searchResults) {
      console.log(`  - ${result.title}`);
    }

    // Test 2: Search with romanized name
    console.log('\n--- Test 2: OpenSearch (romanized "Kimetsu no Yaiba") ---');
    const romanizedResults = await searchSeries('Kimetsu no Yaiba', 5);
    console.log('Results:');
    for (const result of romanizedResults) {
      console.log(`  - ${result.title}`);
    }

    // Test 3: Get full series data
    console.log('\n--- Test 3: Get Demon Slayer series data ---');
    const demonSlayer = await getSeries('Demon Slayer');
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
    const hirayasumi = await getSeries('Hirayasumi');
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

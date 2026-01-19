/**
 * AniList GraphQL API Client
 *
 * Provides manga series information including:
 * - Series metadata (title, volumes, chapters, status)
 * - Related series (spin-offs, sequels, etc.)
 * - Series search
 *
 * API Documentation: https://anilist.gitbook.io/anilist-apiv2-docs/
 *
 * Rate Limits:
 * - 90 requests per minute
 * - No authentication required for public data
 */

import * as fs from 'fs';
import * as path from 'path';

const ANILIST_API_URL = 'https://graphql.anilist.co';

// Cache directory
const CACHE_DIR = path.join(process.cwd(), '.cache', 'anilist');

// ============================================================================
// Types
// ============================================================================

export interface AniListTitle {
  romaji: string;
  english: string | null;
  native: string | null;
}

export type AniListFormat = 'MANGA' | 'NOVEL' | 'ONE_SHOT';

export interface AniListMedia {
  id: number;
  title: AniListTitle;
  format: AniListFormat | null;
  volumes: number | null;
  chapters: number | null;
  status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  description: string | null;
  coverImage: {
    large: string | null;
    medium: string | null;
  } | null;
  startDate: { year: number | null; month: number | null; day: number | null } | null;
  endDate: { year: number | null; month: number | null; day: number | null } | null;
  genres: string[];
  relations: {
    edges: AniListRelation[];
  } | null;
}

export interface AniListRelation {
  relationType: 'ADAPTATION' | 'PREQUEL' | 'SEQUEL' | 'PARENT' | 'SIDE_STORY' | 'CHARACTER' | 'SUMMARY' | 'ALTERNATIVE' | 'SPIN_OFF' | 'OTHER' | 'SOURCE' | 'COMPILATION' | 'CONTAINS';
  node: {
    id: number;
    type: 'ANIME' | 'MANGA';
    title: AniListTitle;
    volumes: number | null;
    status: string;
  };
}

export interface SeriesInfo {
  id: number;
  title: string;
  titleRomaji: string;
  titleNative: string | null;
  volumes: number | null;
  chapters: number | null;
  status: string;
  isMainSeries: boolean;
  relatedSeries: RelatedSeries[];
}

export interface RelatedSeries {
  id: number;
  title: string;
  relationType: string;
  volumes: number | null;
  status: string;
}

export interface SearchResult {
  series: SeriesInfo[];
  totalResults: number;
}

/**
 * Suggestion item for autocomplete dropdown
 */
export interface SuggestionItem {
  anilistId: number;
  title: string;           // English or Romaji
  titleRomaji: string;
  format: AniListFormat;
  volumes: number | null;
  status: string;
  coverUrl: string | null;
}

// ============================================================================
// Cache Functions
// ============================================================================

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(type: string, id: string): string {
  return `${type}_${id.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
}

function loadFromCache<T>(cacheKey: string): T | null {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  if (fs.existsSync(cachePath)) {
    try {
      const data = fs.readFileSync(cachePath, 'utf-8');
      console.log(`  📁 Loaded from cache: ${cacheKey}`);
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
  console.log(`  💾 Saved to cache: ${cacheKey}`);
}

// ============================================================================
// GraphQL Queries
// ============================================================================

const SEARCH_MANGA_QUERY = `
query SearchManga($search: String!, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      hasNextPage
    }
    media(search: $search, type: MANGA, sort: SEARCH_MATCH, isAdult: false) {
      id
      title {
        romaji
        english
        native
      }
      format
      volumes
      chapters
      status
      description
      coverImage {
        large
        medium
      }
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      genres
    }
  }
}
`;

const GET_POPULAR_MANGA_QUERY = `
query GetPopularManga($page: Int, $perPage: Int, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      hasNextPage
    }
    media(type: MANGA, sort: $sort, isAdult: false) {
      id
      title {
        romaji
        english
      }
      format
      volumes
      status
      coverImage {
        extraLarge
      }
    }
  }
}
`;

const SEARCH_SUGGESTIONS_QUERY = `
query SearchSuggestions($search: String!, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH, isAdult: false) {
      id
      title {
        romaji
        english
      }
      format
      volumes
      status
      coverImage {
        extraLarge
      }
    }
  }
}
`;

const GET_MANGA_BY_ID_QUERY = `
query GetManga($id: Int!) {
  Media(id: $id, type: MANGA) {
    id
    title {
      romaji
      english
      native
    }
    volumes
    chapters
    status
    description
    coverImage {
      large
      medium
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    genres
    relations {
      edges {
        relationType
        node {
          id
          type
          title {
            romaji
            english
            native
          }
          volumes
          status
        }
      }
    }
  }
}
`;

// ============================================================================
// API Functions
// ============================================================================

async function graphqlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`AniList API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as { data: T; errors?: { message: string }[] };
  
  if (result.errors && result.errors.length > 0) {
    throw new Error(`AniList GraphQL error: ${result.errors[0]!.message}`);
  }

  return result.data;
}

/**
 * Search for manga series by name
 */
export async function searchManga(
  query: string,
  options: { page?: number; perPage?: number; skipCache?: boolean } = {}
): Promise<SearchResult> {
  const { page = 1, perPage = 10, skipCache = false } = options;
  const cacheKey = getCacheKey('search', `${query}_p${page}_n${perPage}`);

  // Check cache
  if (!skipCache) {
    const cached = loadFromCache<SearchResult>(cacheKey);
    if (cached) return cached;
  }

  console.log(`🌐 AniList: Searching for "${query}"`);

  const data = await graphqlRequest<{
    Page: {
      pageInfo: { total: number; currentPage: number; hasNextPage: boolean };
      media: AniListMedia[];
    };
  }>(SEARCH_MANGA_QUERY, { search: query, page, perPage });

  const series: SeriesInfo[] = data.Page.media.map((media) => ({
    id: media.id,
    title: media.title.english ?? media.title.romaji,
    titleRomaji: media.title.romaji,
    titleNative: media.title.native,
    volumes: media.volumes,
    chapters: media.chapters,
    status: media.status,
    isMainSeries: determineIfMainSeries(media),
    relatedSeries: [],
  }));

  const result: SearchResult = {
    series,
    totalResults: data.Page.pageInfo.total,
  };

  // Cache the result
  if (!skipCache) {
    saveToCache(cacheKey, result);
  }

  return result;
}

/**
 * Get popular manga for autocomplete suggestions
 * Fetches by popularity and trending, deduplicates results
 */
export async function getPopularManga(
  options: { 
    popularLimit?: number; 
    trendingLimit?: number; 
    skipCache?: boolean;
  } = {}
): Promise<SuggestionItem[]> {
  const { popularLimit = 150, trendingLimit = 50, skipCache = false } = options;
  const cacheKey = getCacheKey('popular', `p${popularLimit}_t${trendingLimit}`);

  // Check cache
  if (!skipCache) {
    const cached = loadFromCache<SuggestionItem[]>(cacheKey);
    if (cached) return cached;
  }

  console.log(`🌐 AniList: Fetching popular manga (${popularLimit} popular + ${trendingLimit} trending)`);

  // Fetch popular manga
  const popularData = await graphqlRequest<{
    Page: {
      media: Array<{
        id: number;
        title: { romaji: string; english: string | null };
        format: AniListFormat | null;
        volumes: number | null;
        status: string;
        coverImage: { extraLarge: string | null } | null;
      }>;
    };
  }>(GET_POPULAR_MANGA_QUERY, { 
    page: 1, 
    perPage: popularLimit, 
    sort: ['POPULARITY_DESC'] 
  });

  // Fetch trending manga
  const trendingData = await graphqlRequest<{
    Page: {
      media: Array<{
        id: number;
        title: { romaji: string; english: string | null };
        format: AniListFormat | null;
        volumes: number | null;
        status: string;
        coverImage: { extraLarge: string | null } | null;
      }>;
    };
  }>(GET_POPULAR_MANGA_QUERY, { 
    page: 1, 
    perPage: trendingLimit, 
    sort: ['TRENDING_DESC'] 
  });

  // Combine and deduplicate
  const seenIds = new Set<number>();
  const items: SuggestionItem[] = [];

  const addItem = (media: {
    id: number;
    title: { romaji: string; english: string | null };
    format: AniListFormat | null;
    volumes: number | null;
    status: string;
    coverImage: { extraLarge: string | null } | null;
  }) => {
    if (seenIds.has(media.id)) return;
    seenIds.add(media.id);
    
    items.push({
      anilistId: media.id,
      title: media.title.english ?? media.title.romaji,
      titleRomaji: media.title.romaji,
      format: media.format ?? 'MANGA',
      volumes: media.volumes,
      status: media.status,
      coverUrl: media.coverImage?.extraLarge ?? null,
    });
  };

  // Add popular first (higher priority)
  for (const media of popularData.Page.media) {
    addItem(media);
  }

  // Add trending (may add new items not in popular)
  for (const media of trendingData.Page.media) {
    addItem(media);
  }

  console.log(`  ✅ Got ${items.length} unique manga`);

  // Cache the result
  if (!skipCache) {
    saveToCache(cacheKey, items);
  }

  return items;
}

/**
 * Search manga for autocomplete suggestions (returns SuggestionItem format)
 */
export async function getSuggestions(
  query: string,
  options: { limit?: number; skipCache?: boolean } = {}
): Promise<SuggestionItem[]> {
  const { limit = 10, skipCache = false } = options;
  const cacheKey = getCacheKey('suggestions', `${query}_n${limit}`);

  // Check cache
  if (!skipCache) {
    const cached = loadFromCache<SuggestionItem[]>(cacheKey);
    if (cached) return cached;
  }

  console.log(`🌐 AniList: Getting suggestions for "${query}"`);

  const data = await graphqlRequest<{
    Page: {
      media: Array<{
        id: number;
        title: { romaji: string; english: string | null };
        format: AniListFormat | null;
        volumes: number | null;
        status: string;
        coverImage: { extraLarge: string | null } | null;
      }>;
    };
  }>(SEARCH_SUGGESTIONS_QUERY, { search: query, perPage: limit });

  const items: SuggestionItem[] = data.Page.media.map((media) => ({
    anilistId: media.id,
    title: media.title.english ?? media.title.romaji,
    titleRomaji: media.title.romaji,
    format: media.format ?? 'MANGA',
    volumes: media.volumes,
    status: media.status,
    coverUrl: media.coverImage?.extraLarge ?? null,
  }));

  // Cache the result
  if (!skipCache) {
    saveToCache(cacheKey, items);
  }

  return items;
}

/**
 * Get detailed manga info by AniList ID, including related series
 */
export async function getMangaById(
  id: number,
  options: { skipCache?: boolean } = {}
): Promise<SeriesInfo | null> {
  const { skipCache = false } = options;
  const cacheKey = getCacheKey('manga', id.toString());

  // Check cache
  if (!skipCache) {
    const cached = loadFromCache<SeriesInfo>(cacheKey);
    if (cached) return cached;
  }

  console.log(`🌐 AniList: Getting manga ${id}`);

  try {
    const data = await graphqlRequest<{ Media: AniListMedia }>(GET_MANGA_BY_ID_QUERY, { id });
    const media = data.Media;

    // Extract related manga series (not anime)
    const relatedSeries: RelatedSeries[] = (media.relations?.edges ?? [])
      .filter((edge) => edge.node.type === 'MANGA')
      .map((edge) => ({
        id: edge.node.id,
        title: edge.node.title.english ?? edge.node.title.romaji,
        relationType: edge.relationType,
        volumes: edge.node.volumes,
        status: edge.node.status,
      }));

    const result: SeriesInfo = {
      id: media.id,
      title: media.title.english ?? media.title.romaji,
      titleRomaji: media.title.romaji,
      titleNative: media.title.native,
      volumes: media.volumes,
      chapters: media.chapters,
      status: media.status,
      isMainSeries: determineIfMainSeries(media),
      relatedSeries,
    };

    // Cache the result
    if (!skipCache) {
      saveToCache(cacheKey, result);
    }

    return result;
  } catch (error) {
    console.error(`  ❌ Error getting manga ${id}:`, error);
    return null;
  }
}

/**
 * Get a manga series and all its related manga
 */
export async function getSeriesWithRelated(
  id: number,
  options: { skipCache?: boolean } = {}
): Promise<{ main: SeriesInfo; related: SeriesInfo[] } | null> {
  const main = await getMangaById(id, options);
  if (!main) return null;

  const related: SeriesInfo[] = [];
  
  // Fetch details for each related manga
  for (const rel of main.relatedSeries) {
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100));
    
    const relatedManga = await getMangaById(rel.id, options);
    if (relatedManga) {
      related.push(relatedManga);
    }
  }

  return { main, related };
}

/**
 * Find the main series for a given manga (if it's a spin-off)
 */
export async function findMainSeries(id: number): Promise<SeriesInfo | null> {
  const manga = await getMangaById(id);
  if (!manga) return null;

  // If it's already a main series, return it
  if (manga.isMainSeries) return manga;

  // Look for parent series in relations
  const parentRelation = manga.relatedSeries.find(
    (rel) => rel.relationType === 'PARENT' || rel.relationType === 'SOURCE'
  );

  if (parentRelation) {
    return await getMangaById(parentRelation.id);
  }

  return manga;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine if a manga is a main series (not a spin-off, gaiden, etc.)
 */
function determineIfMainSeries(media: AniListMedia): boolean {
  const title = (media.title.english ?? media.title.romaji).toLowerCase();
  
  // Check for common spin-off indicators
  const spinOffIndicators = [
    'gaiden',
    'side story',
    'spin-off',
    'spinoff',
    'stories of',
    'anthology',
    'official fanbook',
    'databook',
    'guidebook',
    'one-shot',
    'special',
  ];

  for (const indicator of spinOffIndicators) {
    if (title.includes(indicator)) {
      return false;
    }
  }

  // Check for academy/gakuen spin-offs (common pattern)
  if (title.includes('academy') || title.includes('gakuen')) {
    // But only if it's not the original title
    const romaji = media.title.romaji.toLowerCase();
    if (!romaji.startsWith('gakuen')) {
      return false;
    }
  }

  // If it has a high volume count, it's likely a main series
  if (media.volumes != null && media.volumes >= 5) {
    return true;
  }

  // If it has many chapters, it's likely a main series
  if (media.chapters != null && media.chapters >= 20) {
    return true;
  }

  return true;
}

/**
 * Get the best title for display
 */
export function getDisplayTitle(series: SeriesInfo): string {
  return series.title !== '' ? series.title : series.titleRomaji;
}

/**
 * Create a URL-safe slug from a title
 */
export function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================================
// Test/Demo
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('AniList Client Test');
  console.log('='.repeat(60));

  try {
    // Test 1: Search for Demon Slayer
    console.log('\n--- Test 1: Search for "Demon Slayer" ---');
    const searchResults = await searchManga('Demon Slayer', { perPage: 5 });
    console.log(`Found ${searchResults.totalResults} results`);
    for (const series of searchResults.series) {
      const mainLabel = series.isMainSeries ? '📚' : '📖';
      console.log(`  ${mainLabel} [${series.id}] ${series.title}`);
      console.log(`     Volumes: ${series.volumes ?? 'N/A'}, Status: ${series.status}`);
    }

    // Test 2: Get detailed info for main Demon Slayer series
    console.log('\n--- Test 2: Get "Demon Slayer" details with relations ---');
    const demonSlayerId = 87216; // Known ID for main Demon Slayer manga
    const details = await getMangaById(demonSlayerId);
    if (details) {
      console.log(`Title: ${details.title}`);
      console.log(`Volumes: ${details.volumes}`);
      console.log(`Status: ${details.status}`);
      console.log(`Related series (${details.relatedSeries.length}):`);
      for (const rel of details.relatedSeries) {
        console.log(`  - [${rel.relationType}] ${rel.title} (${rel.volumes ?? '?'} vols)`);
      }
    }

    // Test 3: Search for One Piece
    console.log('\n--- Test 3: Search for "One Piece" ---');
    const onePieceResults = await searchManga('One Piece', { perPage: 5 });
    console.log(`Found ${onePieceResults.totalResults} results`);
    for (const series of onePieceResults.series) {
      const mainLabel = series.isMainSeries ? '📚' : '📖';
      console.log(`  ${mainLabel} [${series.id}] ${series.title}`);
      console.log(`     Volumes: ${series.volumes ?? 'N/A'}, Status: ${series.status}`);
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

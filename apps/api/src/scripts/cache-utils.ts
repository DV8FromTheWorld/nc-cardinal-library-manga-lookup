/**
 * Cache Utilities
 *
 * Admin functions for managing and clearing API caches.
 * Delegates to the cache service backed by the cache_entries DB table.
 */

import { CACHE_NS } from '../modules/cache/constants.js';
import {
  clearAll,
  clearByKey,
  clearByKeyPrefix,
  clearNamespace,
  getStats,
} from '../modules/cache/service.js';

export type CacheType = 'wikipedia' | 'google-books' | 'bookcover' | 'nc-cardinal';

export interface CacheStats {
  type: string;
  entryCount: number;
  totalSizeBytes: number;
}

export interface AllCacheStats {
  caches: CacheStats[];
  totalEntries: number;
  totalSizeBytes: number;
}

export function getAllCacheStats(): AllCacheStats {
  return getStats();
}

export function clearAllCaches(): { deletedCount: number } {
  return { deletedCount: clearAll() };
}

export function clearCacheType(type: CacheType): { deletedCount: number } {
  return { deletedCount: clearNamespace(type) };
}

/**
 * Clear cache entries related to a specific ISBN.
 * Affects: Google Books search results, Bookcover URLs + timeouts,
 * NC Cardinal ISBN-to-record mapping and the associated catalog record.
 */
export function clearCacheForISBN(isbn: string): { deletedCount: number; deletedFiles: string[] } {
  const cleanISBN = isbn.replace(/[-\s]/g, '');
  return clearByKey(
    [
      CACHE_NS.GOOGLE_BOOKS,
      CACHE_NS.BOOKCOVER,
      CACHE_NS.BOOKCOVER_TIMEOUTS,
      CACHE_NS.NC_CARDINAL_ISBN_MAP,
      CACHE_NS.NC_CARDINAL_RECORDS,
    ],
    cleanISBN
  );
}

/**
 * Clear cache entries related to a specific series.
 * Affects: Wikipedia series cache and page content cache.
 */
export function clearCacheForSeries(_seriesSlug: string): {
  deletedCount: number;
  deletedFiles: string[];
} {
  const seriesCount = clearByKeyPrefix(CACHE_NS.WIKIPEDIA, `series_`);
  const pagesCount = clearByKeyPrefix(CACHE_NS.WIKIPEDIA, `page_title_`);
  const total = seriesCount + pagesCount;

  return {
    deletedCount: total,
    deletedFiles: [],
  };
}

/**
 * Clear cache entries related to a specific search query.
 * Affects: Wikipedia (search, series, all_series, page_title),
 * Google Books (search), NC Cardinal (searches).
 */
export function clearCacheForSearch(query: string): {
  deletedCount: number;
  deletedFiles: string[];
} {
  const normalized = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 100);
  const allDeleted: string[] = [];
  let totalCount = 0;

  // Wikipedia: search_, series_, all_series_, page_title_ keys matching query
  for (const prefix of ['search_', 'series_', 'all_series_', 'page_title_']) {
    const result = clearByKey([CACHE_NS.WIKIPEDIA], `${prefix}${normalized}`);
    allDeleted.push(...result.deletedFiles);
    totalCount += result.deletedCount;
  }

  // Google Books: search keys matching query
  const gb = clearByKey([CACHE_NS.GOOGLE_BOOKS], `search_${normalized}`);
  allDeleted.push(...gb.deletedFiles);
  totalCount += gb.deletedCount;

  // NC Cardinal: search keys matching query
  const nc = clearByKey([CACHE_NS.NC_CARDINAL_SEARCHES], normalized);
  allDeleted.push(...nc.deletedFiles);
  totalCount += nc.deletedCount;

  return { deletedCount: totalCount, deletedFiles: allDeleted };
}

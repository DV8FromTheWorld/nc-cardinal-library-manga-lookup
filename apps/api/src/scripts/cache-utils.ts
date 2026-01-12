/**
 * Cache Utilities
 * 
 * Provides functions for managing and clearing API caches.
 * Cache directories:
 * - wikipedia/     - Series search results and page content
 * - google-books/  - ISBN lookups
 * - bookcover/     - Cover image URLs
 * - nc-cardinal/   - ISBN to record ID mappings and full records
 */

import * as fs from 'fs';
import * as path from 'path';

const CACHE_BASE_DIR = path.join(process.cwd(), '.cache');

export type CacheType = 'wikipedia' | 'google-books' | 'bookcover' | 'nc-cardinal';

export interface CacheStats {
  type: CacheType;
  entryCount: number;
  totalSizeBytes: number;
}

export interface AllCacheStats {
  caches: CacheStats[];
  totalEntries: number;
  totalSizeBytes: number;
}

/**
 * Get the cache directory path for a specific type
 */
function getCacheDir(type: CacheType): string {
  return path.join(CACHE_BASE_DIR, type);
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Get statistics for a cache type
 */
function getCacheStats(type: CacheType): CacheStats {
  const dir = getCacheDir(type);
  const files = getAllFiles(dir);
  
  let totalSize = 0;
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      totalSize += stat.size;
    } catch {
      // File may have been deleted
    }
  }
  
  return {
    type,
    entryCount: files.length,
    totalSizeBytes: totalSize,
  };
}

/**
 * Get statistics for all cache types
 */
export function getAllCacheStats(): AllCacheStats {
  const types: CacheType[] = ['wikipedia', 'google-books', 'bookcover', 'nc-cardinal'];
  const caches = types.map(getCacheStats);
  
  return {
    caches,
    totalEntries: caches.reduce((sum, c) => sum + c.entryCount, 0),
    totalSizeBytes: caches.reduce((sum, c) => sum + c.totalSizeBytes, 0),
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches(): { deletedCount: number } {
  const types: CacheType[] = ['wikipedia', 'google-books', 'bookcover', 'nc-cardinal'];
  let totalDeleted = 0;
  
  for (const type of types) {
    const result = clearCacheType(type);
    totalDeleted += result.deletedCount;
  }
  
  return { deletedCount: totalDeleted };
}

/**
 * Clear a specific cache type
 */
export function clearCacheType(type: CacheType): { deletedCount: number } {
  const dir = getCacheDir(type);
  if (!fs.existsSync(dir)) {
    return { deletedCount: 0 };
  }
  
  const files = getAllFiles(dir);
  let deletedCount = 0;
  
  for (const file of files) {
    try {
      fs.unlinkSync(file);
      deletedCount++;
    } catch {
      // File may have already been deleted
    }
  }
  
  return { deletedCount };
}

/**
 * Clear cache entries related to a specific ISBN
 * Affects: google-books, bookcover, nc-cardinal
 */
export function clearCacheForISBN(isbn: string): { deletedCount: number; deletedFiles: string[] } {
  const cleanISBN = isbn.replace(/[-\s]/g, '');
  const deletedFiles: string[] = [];
  
  // Clear Google Books cache
  const googleBooksDir = getCacheDir('google-books');
  if (fs.existsSync(googleBooksDir)) {
    const files = fs.readdirSync(googleBooksDir);
    for (const file of files) {
      if (file.includes(cleanISBN)) {
        const fullPath = path.join(googleBooksDir, file);
        try {
          fs.unlinkSync(fullPath);
          deletedFiles.push(`google-books/${file}`);
        } catch { /* ignore */ }
      }
    }
  }
  
  // Clear Bookcover cache
  const bookcoverDir = getCacheDir('bookcover');
  if (fs.existsSync(bookcoverDir)) {
    const bookcoverFile = path.join(bookcoverDir, `${cleanISBN}.txt`);
    if (fs.existsSync(bookcoverFile)) {
      try {
        fs.unlinkSync(bookcoverFile);
        deletedFiles.push(`bookcover/${cleanISBN}.txt`);
      } catch { /* ignore */ }
    }
  }
  
  // Clear NC Cardinal ISBN-to-record mapping
  const ncIsbnDir = path.join(getCacheDir('nc-cardinal'), 'isbn-to-record');
  if (fs.existsSync(ncIsbnDir)) {
    const isbnFile = path.join(ncIsbnDir, `${cleanISBN}.json`);
    if (fs.existsSync(isbnFile)) {
      try {
        // Read the record ID before deleting so we can also clear the record
        const content = fs.readFileSync(isbnFile, 'utf-8');
        const data = JSON.parse(content);
        fs.unlinkSync(isbnFile);
        deletedFiles.push(`nc-cardinal/isbn-to-record/${cleanISBN}.json`);
        
        // Also clear the associated record if we have a record ID
        if (data.recordId) {
          const recordFile = path.join(getCacheDir('nc-cardinal'), 'records', `${data.recordId}.json`);
          if (fs.existsSync(recordFile)) {
            try {
              fs.unlinkSync(recordFile);
              deletedFiles.push(`nc-cardinal/records/${data.recordId}.json`);
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
  }
  
  return {
    deletedCount: deletedFiles.length,
    deletedFiles,
  };
}

/**
 * Clear cache entries related to a specific series
 * Affects: wikipedia
 */
export function clearCacheForSeries(seriesSlug: string): { deletedCount: number; deletedFiles: string[] } {
  const deletedFiles: string[] = [];
  
  // Normalize the slug for cache key matching
  const normalized = seriesSlug.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 100);
  
  const wikipediaDir = getCacheDir('wikipedia');
  if (!fs.existsSync(wikipediaDir)) {
    return { deletedCount: 0, deletedFiles: [] };
  }
  
  const files = fs.readdirSync(wikipediaDir);
  for (const file of files) {
    // Match series cache files
    if (file.startsWith('series_') && file.includes(normalized)) {
      const fullPath = path.join(wikipediaDir, file);
      try {
        fs.unlinkSync(fullPath);
        deletedFiles.push(`wikipedia/${file}`);
      } catch { /* ignore */ }
    }
    // Also match page content that might be related
    if (file.startsWith('page_title_') && file.toLowerCase().includes(normalized)) {
      const fullPath = path.join(wikipediaDir, file);
      try {
        fs.unlinkSync(fullPath);
        deletedFiles.push(`wikipedia/${file}`);
      } catch { /* ignore */ }
    }
  }
  
  return {
    deletedCount: deletedFiles.length,
    deletedFiles,
  };
}

/**
 * Clear cache entries related to a specific search query
 * Affects: wikipedia (search, series, pages), google-books (search), nc-cardinal (searches)
 * This is comprehensive - clears everything that could contribute to search results
 */
export function clearCacheForSearch(query: string): { deletedCount: number; deletedFiles: string[] } {
  const deletedFiles: string[] = [];
  
  // Normalize the query for cache key matching
  const normalized = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 100);
  
  // Clear Wikipedia caches (search, series, and related pages)
  const wikipediaDir = getCacheDir('wikipedia');
  if (fs.existsSync(wikipediaDir)) {
    const files = fs.readdirSync(wikipediaDir);
    for (const file of files) {
      // Match search, series, and all_series cache files
      if ((file.startsWith('search_') || file.startsWith('series_') || file.startsWith('all_series_')) 
          && file.includes(normalized)) {
        const fullPath = path.join(wikipediaDir, file);
        try {
          fs.unlinkSync(fullPath);
          deletedFiles.push(`wikipedia/${file}`);
        } catch { /* ignore */ }
      }
      // Also match page content that might be related
      if (file.startsWith('page_title_') && file.toLowerCase().includes(normalized)) {
        const fullPath = path.join(wikipediaDir, file);
        try {
          fs.unlinkSync(fullPath);
          deletedFiles.push(`wikipedia/${file}`);
        } catch { /* ignore */ }
      }
    }
  }
  
  // Clear Google Books search cache
  const googleBooksDir = getCacheDir('google-books');
  if (fs.existsSync(googleBooksDir)) {
    const files = fs.readdirSync(googleBooksDir);
    for (const file of files) {
      if (file.startsWith('search_') && file.includes(normalized)) {
        const fullPath = path.join(googleBooksDir, file);
        try {
          fs.unlinkSync(fullPath);
          deletedFiles.push(`google-books/${file}`);
        } catch { /* ignore */ }
      }
    }
  }
  
  // Clear NC Cardinal search caches
  const ncCardinalDir = getCacheDir('nc-cardinal');
  const searchesDir = path.join(ncCardinalDir, 'searches');
  if (fs.existsSync(searchesDir)) {
    const files = fs.readdirSync(searchesDir);
    for (const file of files) {
      if (file.includes(normalized)) {
        const fullPath = path.join(searchesDir, file);
        try {
          fs.unlinkSync(fullPath);
          deletedFiles.push(`nc-cardinal/searches/${file}`);
        } catch { /* ignore */ }
      }
    }
  }
  
  return {
    deletedCount: deletedFiles.length,
    deletedFiles,
  };
}

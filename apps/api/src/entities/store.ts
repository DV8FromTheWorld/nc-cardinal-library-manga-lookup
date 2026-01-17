/**
 * Entity store - persists entities to a JSON file
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntityStore, Series, Book } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../.data');
const STORE_PATH = join(DATA_DIR, 'entities.json');

// In-memory cache of the store
let storeCache: EntityStore | null = null;

/**
 * Create an empty store structure
 */
function createEmptyStore(): EntityStore {
  return {
    series: {},
    books: {},
    wikipediaIndex: {},
    titleIndex: {},
  };
}

/**
 * Normalize a title for index lookup
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Load the entity store from disk
 */
export async function loadStore(): Promise<EntityStore> {
  if (storeCache) {
    return storeCache;
  }

  try {
    if (!existsSync(STORE_PATH)) {
      storeCache = createEmptyStore();
      return storeCache;
    }

    const data = await readFile(STORE_PATH, 'utf-8');
    storeCache = JSON.parse(data) as EntityStore;
    return storeCache;
  } catch (error) {
    console.error('[EntityStore] Failed to load store, creating empty:', error);
    storeCache = createEmptyStore();
    return storeCache;
  }
}

/**
 * Save the entity store to disk
 */
export async function saveStore(): Promise<void> {
  if (!storeCache) {
    return;
  }

  try {
    // Ensure directory exists
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }

    await writeFile(STORE_PATH, JSON.stringify(storeCache, null, 2), 'utf-8');
  } catch (error) {
    console.error('[EntityStore] Failed to save store:', error);
    throw error;
  }
}

/**
 * Get a series by ID
 */
export async function getSeriesById(id: string): Promise<Series | null> {
  const store = await loadStore();
  return store.series[id] ?? null;
}

/**
 * Get a series by Wikipedia page ID
 */
export async function getSeriesByWikipediaId(wikipediaId: number): Promise<Series | null> {
  const store = await loadStore();
  const seriesId = store.wikipediaIndex[wikipediaId];
  if (!seriesId) {
    return null;
  }
  return store.series[seriesId] ?? null;
}

/**
 * Get a series by title (normalized lookup)
 */
export async function getSeriesByTitle(title: string): Promise<Series | null> {
  const store = await loadStore();
  const normalized = normalizeTitle(title);
  const seriesId = store.titleIndex[normalized];
  if (!seriesId) {
    return null;
  }
  return store.series[seriesId] ?? null;
}

/**
 * Save a series (creates or updates)
 */
export async function saveSeries(series: Series): Promise<void> {
  const store = await loadStore();
  
  store.series[series.id] = series;
  
  // Update indexes
  store.titleIndex[normalizeTitle(series.title)] = series.id;
  
  if (series.externalIds.wikipedia) {
    store.wikipediaIndex[series.externalIds.wikipedia] = series.id;
  }
  
  await saveStore();
}

/**
 * Get a book by ISBN
 */
export async function getBookByIsbn(isbn: string): Promise<Book | null> {
  const store = await loadStore();
  return store.books[isbn] ?? null;
}

/**
 * Get all books for a series
 */
export async function getBooksBySeriesId(seriesId: string): Promise<Book[]> {
  const store = await loadStore();
  const series = store.series[seriesId];
  
  if (!series) {
    return [];
  }
  
  // Return books in order from bookIds
  return series.bookIds
    .map(isbn => store.books[isbn])
    .filter((book): book is Book => book !== undefined);
}

/**
 * Save a book (creates or updates)
 */
export async function saveBook(book: Book): Promise<void> {
  const store = await loadStore();
  store.books[book.id] = book;
  await saveStore();
}

/**
 * Save multiple books at once (more efficient)
 */
export async function saveBooks(books: Book[]): Promise<void> {
  const store = await loadStore();
  for (const book of books) {
    store.books[book.id] = book;
  }
  await saveStore();
}

/**
 * Add a book to a series (updates bookIds)
 */
export async function addBookToSeries(seriesId: string, isbn: string): Promise<void> {
  const store = await loadStore();
  const series = store.series[seriesId];
  
  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }
  
  if (!series.bookIds.includes(isbn)) {
    series.bookIds.push(isbn);
    series.updatedAt = new Date().toISOString();
    await saveStore();
  }
}

/**
 * Get all series (for debugging/admin)
 */
export async function getAllSeries(): Promise<Series[]> {
  const store = await loadStore();
  return Object.values(store.series);
}

/**
 * Get store stats (for debugging)
 */
export async function getStoreStats(): Promise<{
  seriesCount: number;
  bookCount: number;
  wikipediaIndexCount: number;
  titleIndexCount: number;
}> {
  const store = await loadStore();
  return {
    seriesCount: Object.keys(store.series).length,
    bookCount: Object.keys(store.books).length,
    wikipediaIndexCount: Object.keys(store.wikipediaIndex).length,
    titleIndexCount: Object.keys(store.titleIndex).length,
  };
}

/**
 * Clear the in-memory cache (for testing)
 */
export function clearCache(): void {
  storeCache = null;
}

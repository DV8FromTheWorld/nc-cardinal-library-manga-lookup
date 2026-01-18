/**
 * Entity store - persists entities to a JSON file
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import type { EntityStore, Series, Volume } from './types.js';

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
    volumes: {},
    isbnIndex: {},
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
 * Generate a new volume ID
 */
export function generateVolumeId(): string {
  return `v_${nanoid(10)}`;
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
    const loaded = JSON.parse(data) as Record<string, unknown>;
    
    // Check for old book-based store format and start fresh if detected
    if ('books' in loaded && !('volumes' in loaded)) {
      console.warn('[EntityStore] Old book-based store detected. Starting fresh with volume-based store.');
      console.warn('[EntityStore] Delete .data/entities.json to clear this warning.');
      storeCache = createEmptyStore();
      return storeCache;
    }
    
    // Validate that loaded data has the required structure
    if (!loaded.series || !loaded.volumes) {
      console.warn('[EntityStore] Invalid store format detected. Starting fresh.');
      storeCache = createEmptyStore();
      return storeCache;
    }
    
    storeCache = loaded as unknown as EntityStore;
    
    // Ensure all required fields exist
    storeCache.volumes = storeCache.volumes ?? {};
    storeCache.isbnIndex = storeCache.isbnIndex ?? {};
    
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

// ============================================================================
// Volume functions (replaces Book functions)
// ============================================================================

/**
 * Get a volume by its ID
 */
export async function getVolumeById(id: string): Promise<Volume | null> {
  const store = await loadStore();
  return store.volumes[id] ?? null;
}

/**
 * Get a volume by any of its ISBNs
 */
export async function getVolumeByIsbn(isbn: string): Promise<Volume | null> {
  const store = await loadStore();
  const volumeId = store.isbnIndex[isbn];
  if (!volumeId) return null;
  return store.volumes[volumeId] ?? null;
}

/**
 * Get a volume by series ID and volume number
 */
export async function getVolumeBySeriesAndNumber(seriesId: string, volumeNumber: number): Promise<Volume | null> {
  const store = await loadStore();
  const series = store.series[seriesId];
  
  if (!series) {
    return null;
  }
  
  for (const volumeId of series.volumeIds) {
    const volume = store.volumes[volumeId];
    if (volume && volume.volumeNumber === volumeNumber) {
      return volume;
    }
  }
  
  return null;
}

/**
 * Get all volumes for a series
 */
export async function getVolumesBySeriesId(seriesId: string): Promise<Volume[]> {
  const store = await loadStore();
  const series = store.series[seriesId];
  
  if (!series) {
    return [];
  }
  
  // Return volumes in order from volumeIds
  return series.volumeIds
    .map(id => store.volumes[id])
    .filter((volume): volume is Volume => volume !== undefined);
}

/**
 * Save a volume and update ISBN index
 */
export async function saveVolume(volume: Volume): Promise<void> {
  const store = await loadStore();
  store.volumes[volume.id] = volume;
  
  // Update ISBN index for all editions
  for (const edition of volume.editions) {
    store.isbnIndex[edition.isbn] = volume.id;
  }
  
  await saveStore();
}

/**
 * Save multiple volumes at once (more efficient)
 */
export async function saveVolumes(volumes: Volume[]): Promise<void> {
  const store = await loadStore();
  for (const volume of volumes) {
    store.volumes[volume.id] = volume;
    
    // Update ISBN index for all editions
    for (const edition of volume.editions) {
      store.isbnIndex[edition.isbn] = volume.id;
    }
  }
  await saveStore();
}

/**
 * Add a volume to a series (updates volumeIds)
 */
export async function addVolumeToSeries(seriesId: string, volumeId: string): Promise<void> {
  const store = await loadStore();
  const series = store.series[seriesId];
  
  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }
  
  if (!series.volumeIds.includes(volumeId)) {
    series.volumeIds.push(volumeId);
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
  volumeCount: number;
  isbnIndexCount: number;
  wikipediaIndexCount: number;
  titleIndexCount: number;
}> {
  const store = await loadStore();
  return {
    seriesCount: Object.keys(store.series).length,
    volumeCount: Object.keys(store.volumes).length,
    isbnIndexCount: Object.keys(store.isbnIndex).length,
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

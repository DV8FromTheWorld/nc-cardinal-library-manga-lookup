/**
 * Entity store - persists entities to a JSON file
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nanoid } from 'nanoid';

import type { Edition, EntityStore, Series, Volume } from './types.js';

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
    editions: {},
    isbnIndex: {},
    wikipediaIndex: {},
    titleIndex: {},
  };
}

/**
 * Normalize a title for index lookup.
 * Strips common suffixes like "(Manga)" and "(Light Novel)" to prevent duplicate series.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(manga\)\s*$/i, '') // Strip (Manga) suffix
    .replace(/\s*\(light novel\)\s*$/i, '') // Strip (Light Novel) suffix
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
 * Generate a new edition ID
 */
export function generateEditionId(): string {
  return `e_${nanoid(10)}`;
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
      console.warn(
        '[EntityStore] Old book-based store detected. Starting fresh with volume-based store.'
      );
      console.warn('[EntityStore] Delete .data/entities.json to clear this warning.');
      storeCache = createEmptyStore();
      return storeCache;
    }

    // Check for old embedded-editions format (volumes have 'editions' array instead of 'editionIds')
    // If so, start fresh - the new format uses Edition entities
    const sampleVolume = Object.values(loaded.volumes ?? {})[0] as
      | Record<string, unknown>
      | undefined;
    if (sampleVolume && 'editions' in sampleVolume && !('editionIds' in sampleVolume)) {
      console.warn(
        '[EntityStore] Old embedded-editions format detected. Starting fresh with Edition entities.'
      );
      console.warn('[EntityStore] Delete .data/entities.json to clear this warning.');
      storeCache = createEmptyStore();
      return storeCache;
    }

    // Validate that loaded data has the required structure
    if (loaded.series == null || loaded.volumes == null) {
      console.warn('[EntityStore] Invalid store format detected. Starting fresh.');
      storeCache = createEmptyStore();
      return storeCache;
    }

    storeCache = loaded as unknown as EntityStore;

    // Ensure all required fields exist (backwards compatibility)
    storeCache.volumes = storeCache.volumes ?? {};
    storeCache.editions = storeCache.editions ?? {};
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

// ============================================================================
// Series functions
// ============================================================================

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
  if (seriesId == null) {
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
  if (seriesId == null) {
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

  if (series.externalIds.wikipedia != null) {
    store.wikipediaIndex[series.externalIds.wikipedia] = series.id;
  }

  await saveStore();
}

// ============================================================================
// Volume functions
// ============================================================================

/**
 * Get a volume by its ID
 */
export async function getVolumeById(id: string): Promise<Volume | null> {
  const store = await loadStore();
  return store.volumes[id] ?? null;
}

/**
 * Get a volume by series ID and volume number
 */
export async function getVolumeBySeriesAndNumber(
  seriesId: string,
  volumeNumber: number
): Promise<Volume | null> {
  const store = await loadStore();
  const series = store.series[seriesId];

  if (!series) {
    return null;
  }

  for (const volumeId of series.volumeIds) {
    const volume = store.volumes[volumeId];
    if (volume?.volumeNumber === volumeNumber) {
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
    .map((id) => store.volumes[id])
    .filter((volume): volume is Volume => volume !== undefined);
}

/**
 * Save a volume (no longer updates ISBN index - that's handled by editions now)
 */
export async function saveVolume(volume: Volume): Promise<void> {
  const store = await loadStore();
  store.volumes[volume.id] = volume;
  await saveStore();
}

/**
 * Save multiple volumes at once (more efficient)
 */
export async function saveVolumes(volumes: Volume[]): Promise<void> {
  const store = await loadStore();
  for (const volume of volumes) {
    store.volumes[volume.id] = volume;
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

// ============================================================================
// Edition functions
// ============================================================================

/**
 * Get an edition by its ID
 */
export async function getEditionById(id: string): Promise<Edition | null> {
  const store = await loadStore();
  return store.editions[id] ?? null;
}

/**
 * Get an edition by ISBN
 */
export async function getEditionByIsbn(isbn: string): Promise<Edition | null> {
  const store = await loadStore();
  const editionId = store.isbnIndex[isbn];
  if (editionId == null) return null;
  return store.editions[editionId] ?? null;
}

/**
 * Get all editions for a volume
 */
export async function getEditionsByVolumeId(volumeId: string): Promise<Edition[]> {
  const store = await loadStore();
  const volume = store.volumes[volumeId];

  if (!volume) {
    return [];
  }

  return volume.editionIds
    .map((id) => store.editions[id])
    .filter((edition): edition is Edition => edition !== undefined);
}

/**
 * Get all editions that contain a specific volume ID
 * (Useful for finding all editions that include a volume)
 */
export async function getEditionsContainingVolume(volumeId: string): Promise<Edition[]> {
  const store = await loadStore();
  return Object.values(store.editions).filter((edition) => edition.volumeIds.includes(volumeId));
}

/**
 * Save an edition and update ISBN index
 */
export async function saveEdition(edition: Edition): Promise<void> {
  const store = await loadStore();
  store.editions[edition.id] = edition;
  store.isbnIndex[edition.isbn] = edition.id;
  await saveStore();
}

/**
 * Save multiple editions at once (more efficient)
 */
export async function saveEditions(editions: Edition[]): Promise<void> {
  const store = await loadStore();
  for (const edition of editions) {
    store.editions[edition.id] = edition;
    store.isbnIndex[edition.isbn] = edition.id;
  }
  await saveStore();
}

/**
 * Add a volume to an edition (updates edition's volumeIds)
 */
export async function addVolumeToEdition(editionId: string, volumeId: string): Promise<void> {
  const store = await loadStore();
  const edition = store.editions[editionId];

  if (!edition) {
    throw new Error(`Edition not found: ${editionId}`);
  }

  if (!edition.volumeIds.includes(volumeId)) {
    edition.volumeIds.push(volumeId);
    edition.updatedAt = new Date().toISOString();
    await saveStore();
  }
}

/**
 * Add an edition to a volume (updates volume's editionIds)
 */
export async function addEditionToVolume(volumeId: string, editionId: string): Promise<void> {
  const store = await loadStore();
  const volume = store.volumes[volumeId];

  if (!volume) {
    throw new Error(`Volume not found: ${volumeId}`);
  }

  if (!volume.editionIds.includes(editionId)) {
    volume.editionIds.push(editionId);
    volume.updatedAt = new Date().toISOString();
    await saveStore();
  }
}

// ============================================================================
// Admin/Debug functions
// ============================================================================

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
  editionCount: number;
  isbnIndexCount: number;
  wikipediaIndexCount: number;
  titleIndexCount: number;
}> {
  const store = await loadStore();
  return {
    seriesCount: Object.keys(store.series).length,
    volumeCount: Object.keys(store.volumes).length,
    editionCount: Object.keys(store.editions).length,
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

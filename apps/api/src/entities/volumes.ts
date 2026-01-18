/**
 * Volume entity operations
 */

import type { Volume, Edition, CreateVolumeInput, Series } from './types.js';
import {
  getVolumeByIsbn,
  getVolumeBySeriesAndNumber,
  saveVolume,
  saveVolumes,
  getSeriesById,
  generateVolumeId,
} from './store.js';

/**
 * Create a new volume entity
 */
export async function createVolume(input: CreateVolumeInput): Promise<Volume> {
  const now = new Date().toISOString();
  
  const volume: Volume = {
    id: generateVolumeId(),
    seriesId: input.seriesId,
    volumeNumber: input.volumeNumber,
    title: input.title,
    editions: input.editions,
    createdAt: now,
    updatedAt: now,
  };
  
  await saveVolume(volume);
  console.log(`[Volume] Created volume: ${volume.id} - Vol. ${volume.volumeNumber}${volume.title ? ` "${volume.title}"` : ''}`);
  
  return volume;
}

/**
 * Find or create a volume by series ID and volume number
 */
export async function findOrCreateVolume(input: CreateVolumeInput): Promise<Volume> {
  // First check by series + volume number
  const existing = await getVolumeBySeriesAndNumber(input.seriesId, input.volumeNumber);
  if (existing) {
    console.log(`[Volume] Found existing volume: ${existing.id} - Vol. ${existing.volumeNumber}`);
    
    // Merge any new editions
    const merged = mergeEditions(existing.editions, input.editions);
    if (merged.length !== existing.editions.length) {
      existing.editions = merged;
      existing.updatedAt = new Date().toISOString();
      await saveVolume(existing);
      console.log(`[Volume] Merged editions for ${existing.id}: now has ${merged.length} editions`);
    }
    
    return existing;
  }
  
  return createVolume(input);
}

/**
 * Find or create multiple volumes (efficient batch operation)
 */
export async function findOrCreateVolumes(inputs: CreateVolumeInput[]): Promise<Volume[]> {
  const results: Volume[] = [];
  const toCreate: CreateVolumeInput[] = [];
  
  // Check which volumes already exist
  for (const input of inputs) {
    const existing = await getVolumeBySeriesAndNumber(input.seriesId, input.volumeNumber);
    if (existing) {
      // Merge any new editions
      const merged = mergeEditions(existing.editions, input.editions);
      if (merged.length !== existing.editions.length) {
        existing.editions = merged;
        existing.updatedAt = new Date().toISOString();
        // Will be saved in batch below
      }
      results.push(existing);
    } else {
      toCreate.push(input);
    }
  }
  
  // Create new volumes
  if (toCreate.length > 0) {
    const now = new Date().toISOString();
    const created: Volume[] = toCreate.map(input => ({
      id: generateVolumeId(),
      seriesId: input.seriesId,
      volumeNumber: input.volumeNumber,
      title: input.title,
      editions: input.editions,
      createdAt: now,
      updatedAt: now,
    }));
    
    results.push(...created);
  }
  
  // Save all (both updated existing and new)
  await saveVolumes(results);
  
  console.log(`[Volume] Found ${results.length - toCreate.length} existing, created ${toCreate.length} new`);
  
  // Sort by volume number to maintain order
  return results.sort((a, b) => a.volumeNumber - b.volumeNumber);
}

/**
 * Merge editions, avoiding duplicates by ISBN
 */
export function mergeEditions(existing: Edition[], incoming: Edition[]): Edition[] {
  const merged = [...existing];
  
  for (const edition of incoming) {
    const exists = merged.some(e => e.isbn === edition.isbn);
    if (!exists) {
      merged.push(edition);
    }
  }
  
  return merged;
}

/**
 * Get volume with its series info
 */
export async function getVolumeWithSeries(isbn: string): Promise<{
  volume: Volume;
  series: Series;
} | null> {
  const volume = await getVolumeByIsbn(isbn);
  if (!volume) {
    return null;
  }
  
  const series = await getSeriesById(volume.seriesId);
  if (!series) {
    console.warn(`[Volume] Volume ${isbn} has invalid seriesId: ${volume.seriesId}`);
    return null;
  }
  
  return { volume, series };
}

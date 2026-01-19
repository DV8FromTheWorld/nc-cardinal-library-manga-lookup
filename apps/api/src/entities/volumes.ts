/**
 * Volume entity operations
 */

import type { Volume, CreateVolumeInput, Series } from './types.js';
import {
  getVolumeBySeriesAndNumber,
  getVolumeById,
  saveVolume,
  saveVolumes,
  getSeriesById,
  generateVolumeId,
  addEditionToVolume,
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
    editionIds: input.editionIds ?? [],
    createdAt: now,
    updatedAt: now,
  };
  
  await saveVolume(volume);
  console.log(`[Volume] Created volume: ${volume.id} - Vol. ${volume.volumeNumber}${volume.title != null ? ` "${volume.title}"` : ''}`);
  
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
    
    // Add any new edition IDs
    let updated = false;
    for (const editionId of input.editionIds ?? []) {
      if (!existing.editionIds.includes(editionId)) {
        existing.editionIds.push(editionId);
        updated = true;
      }
    }
    
    if (updated) {
      existing.updatedAt = new Date().toISOString();
      await saveVolume(existing);
      console.log(`[Volume] Updated edition links for ${existing.id}: now has ${existing.editionIds.length} editions`);
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
      // Add any new edition IDs
      for (const editionId of input.editionIds ?? []) {
        if (!existing.editionIds.includes(editionId)) {
          existing.editionIds.push(editionId);
          existing.updatedAt = new Date().toISOString();
        }
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
      editionIds: input.editionIds ?? [],
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
 * Link an edition to a volume
 */
export async function linkEditionToVolume(volumeId: string, editionId: string): Promise<void> {
  await addEditionToVolume(volumeId, editionId);
  console.log(`[Volume] Linked edition ${editionId} to volume ${volumeId}`);
}

/**
 * Get volume with its series info
 */
export async function getVolumeWithSeries(volumeId: string): Promise<{
  volume: Volume;
  series: Series;
} | null> {
  const volume = await getVolumeById(volumeId);
  if (!volume) {
    return null;
  }
  
  const series = await getSeriesById(volume.seriesId);
  if (!series) {
    console.warn(`[Volume] Volume ${volumeId} has invalid seriesId: ${volume.seriesId}`);
    return null;
  }
  
  return { volume, series };
}

/**
 * Edition entity operations
 */

import type { Edition, CreateEditionInput } from './types.js';
import {
  getEditionByIsbn,
  getEditionById,
  saveEdition,
  saveEditions,
  generateEditionId,
  addVolumeToEdition,
  addEditionToVolume,
} from './store.js';

/**
 * Create a new edition entity
 */
export async function createEdition(input: CreateEditionInput): Promise<Edition> {
  const now = new Date().toISOString();
  
  const edition: Edition = {
    id: generateEditionId(),
    isbn: input.isbn,
    format: input.format,
    language: input.language,
    volumeIds: input.volumeIds,
    releaseDate: input.releaseDate,
    createdAt: now,
    updatedAt: now,
  };
  
  await saveEdition(edition);
  console.log(`[Edition] Created edition: ${edition.id} - ISBN ${edition.isbn} (${edition.language}/${edition.format}) for ${edition.volumeIds.length} volume(s)`);
  
  return edition;
}

/**
 * Find an existing edition by ISBN, or create a new one
 */
export async function findOrCreateEdition(input: CreateEditionInput): Promise<Edition> {
  // Check if edition already exists by ISBN
  const existing = await getEditionByIsbn(input.isbn);
  if (existing) {
    console.log(`[Edition] Found existing edition: ${existing.id} - ISBN ${existing.isbn}`);
    
    // If new volumes are being added, update the edition
    let updated = false;
    for (const volumeId of input.volumeIds) {
      if (!existing.volumeIds.includes(volumeId)) {
        existing.volumeIds.push(volumeId);
        updated = true;
      }
    }
    
    if (updated) {
      existing.updatedAt = new Date().toISOString();
      await saveEdition(existing);
      console.log(`[Edition] Updated edition ${existing.id} with new volumes: ${existing.volumeIds.length} total`);
    }
    
    return existing;
  }
  
  // Create new edition
  return createEdition(input);
}

/**
 * Find or create multiple editions at once (more efficient)
 * Groups editions by ISBN to avoid duplicate lookups
 */
export async function findOrCreateEditions(inputs: CreateEditionInput[]): Promise<Edition[]> {
  const results: Edition[] = [];
  
  // Group by ISBN to handle duplicates in input
  const byIsbn = new Map<string, CreateEditionInput>();
  for (const input of inputs) {
    const existing = byIsbn.get(input.isbn);
    if (existing) {
      // Merge volume IDs
      for (const volumeId of input.volumeIds) {
        if (!existing.volumeIds.includes(volumeId)) {
          existing.volumeIds.push(volumeId);
        }
      }
    } else {
      byIsbn.set(input.isbn, { ...input, volumeIds: [...input.volumeIds] });
    }
  }
  
  // Process each unique ISBN
  for (const input of byIsbn.values()) {
    const edition = await findOrCreateEdition(input);
    results.push(edition);
  }
  
  return results;
}

/**
 * Link a volume to an edition (bidirectional)
 * Updates both the edition's volumeIds and the volume's editionIds
 */
export async function linkVolumeToEdition(volumeId: string, editionId: string): Promise<void> {
  await addVolumeToEdition(editionId, volumeId);
  await addEditionToVolume(volumeId, editionId);
  console.log(`[Edition] Linked volume ${volumeId} to edition ${editionId}`);
}

/**
 * Get edition by ID (re-export for convenience)
 */
export { getEditionById, getEditionByIsbn } from './store.js';

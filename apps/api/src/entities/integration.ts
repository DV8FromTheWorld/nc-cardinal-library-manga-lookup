/**
 * Integration between entity layer and existing search/data services
 * 
 * This module bridges the gap between the raw data from Wikipedia/NC Cardinal
 * and our entity data layer, ensuring entities are created/updated during searches.
 */

import type { WikiSeries, WikiRelatedSeries } from '../scripts/wikipedia-client.js';
import type { Series, Volume, Edition, MediaType, CreateVolumeInput, CreateEditionInput, EditionData } from './types.js';
import {
  findOrCreateSeriesByWikipedia,
  findOrCreateSeriesByTitle,
  updateSeriesVolumes,
  linkRelatedSeries,
  detectMediaType,
} from './series.js';
import { findOrCreateVolumes, getVolumeWithSeries } from './volumes.js';
import { findOrCreateEditions } from './editions.js';
import { getSeriesById, getSeriesByTitle, getVolumesBySeriesId, getEditionsByVolumeId } from './store.js';

/**
 * Create or update entities from Wikipedia series data
 * Called after a successful Wikipedia fetch during search
 * 
 * Also creates entities for related series (spin-offs, side stories, etc.)
 */
export async function createEntitiesFromWikipedia(
  wikiSeries: WikiSeries
): Promise<{ series: Series; volumes: Volume[]; relatedSeries?: Series[] | undefined }> {
  const mediaType = detectMediaType(wikiSeries.title, {
    isManga: wikiSeries.title.toLowerCase().includes('manga'),
    isLightNovel: wikiSeries.title.toLowerCase().includes('light novel'),
  });

  // Create or find the main series
  const series = await findOrCreateSeriesByWikipedia(wikiSeries.pageid, {
    title: wikiSeries.title,
    mediaType,
    author: wikiSeries.author,
    status: wikiSeries.isComplete ? 'completed' : 'ongoing',
  });

  // First pass: Create volumes without edition links
  // We need volume IDs before we can create editions that reference them
  const volumeInputs: CreateVolumeInput[] = wikiSeries.volumes.map(vol => ({
    seriesId: series.id,
    volumeNumber: vol.volumeNumber,
    title: vol.title,
    editionIds: [], // Will be linked after editions are created
  }));

  // Create/find volumes
  const volumes = await findOrCreateVolumes(volumeInputs);
  const volumeIds = volumes.map(v => v.id);

  // Update series with volume IDs (in order)
  await updateSeriesVolumes(series.id, volumeIds);

  // Second pass: Create editions and link them to volumes
  // Build a map of volume number -> volume ID for linking
  const volumeByNumber = new Map<number, Volume>();
  for (const vol of volumes) {
    volumeByNumber.set(vol.volumeNumber, vol);
  }

  // Collect all edition inputs, grouping by ISBN to detect omnibus editions
  const editionInputs: CreateEditionInput[] = [];
  
  for (const wikiVol of wikiSeries.volumes) {
    const volume = volumeByNumber.get(wikiVol.volumeNumber);
    if (!volume) continue;

    // Add Japanese edition if we have ISBN
    if (wikiVol.japaneseISBN != null) {
      editionInputs.push({
        isbn: wikiVol.japaneseISBN,
        format: 'physical',
        language: 'ja',
        volumeIds: [volume.id],
        releaseDate: wikiVol.japaneseReleaseDate,
      });
    }
    
    // Add English edition if we have ISBN
    if (wikiVol.englishISBN != null) {
      editionInputs.push({
        isbn: wikiVol.englishISBN,
        format: 'physical',
        language: 'en',
        volumeIds: [volume.id],
        releaseDate: wikiVol.englishReleaseDate,
      });
    }
  }

  // Create editions (findOrCreateEditions handles deduplication and omnibus detection)
  const editions = await findOrCreateEditions(editionInputs);

  // Link editions back to volumes
  await linkEditionsToVolumes(editions, volumes);

  console.log(`[EntityIntegration] Created/updated: Series "${series.title}" (${series.id}) with ${volumes.length} volumes and ${editions.length} editions`);

  // Process related series if present
  const relatedSeriesEntities: Series[] = [];
  
  if (wikiSeries.relatedSeries && wikiSeries.relatedSeries.length > 0) {
    console.log(`[EntityIntegration] Processing ${wikiSeries.relatedSeries.length} related series`);
    
    for (const related of wikiSeries.relatedSeries) {
      const relatedEntity = await createRelatedSeriesEntity(
        related,
        series.id,
        wikiSeries.title,
        wikiSeries.author
      );
      
      if (relatedEntity) {
        relatedSeriesEntities.push(relatedEntity.series);
        
        // Link to parent series
        await linkRelatedSeries(series.id, relatedEntity.series.id);
      }
    }
    
    if (relatedSeriesEntities.length > 0) {
      console.log(`[EntityIntegration] Created ${relatedSeriesEntities.length} related series entities`);
    }
  }

  return { 
    series, 
    volumes, 
    relatedSeries: relatedSeriesEntities.length > 0 ? relatedSeriesEntities : undefined 
  };
}

/**
 * Link editions to their volumes (bidirectional)
 * Updates volume.editionIds based on edition.volumeIds
 */
async function linkEditionsToVolumes(editions: Edition[], volumes: Volume[]): Promise<void> {
  const { saveVolumes } = await import('./store.js');
  
  // Build a map of volume ID -> volume for quick lookup
  const volumeMap = new Map<string, Volume>();
  for (const vol of volumes) {
    volumeMap.set(vol.id, vol);
  }

  // For each edition, add it to the editionIds of all its volumes
  for (const edition of editions) {
    for (const volumeId of edition.volumeIds) {
      const volume = volumeMap.get(volumeId);
      if (volume && !volume.editionIds.includes(edition.id)) {
        volume.editionIds.push(edition.id);
      }
    }
  }

  // Save all updated volumes
  await saveVolumes(volumes);
}

/**
 * Create entity for a related series (spin-off, side story, etc.)
 */
async function createRelatedSeriesEntity(
  related: WikiRelatedSeries,
  parentSeriesId: string,
  parentTitle: string,
  author?: string
): Promise<{ series: Series; volumes: Volume[] } | null> {
  // Determine media type from related series
  const relatedMediaType = detectMediaType(related.title, {
    isManga: related.mediaType === 'manga',
    isLightNovel: related.mediaType === 'light_novel',
  });
  
  // Generate a title for the related series
  // If the related title doesn't include the parent title, prefix it
  let relatedTitle = related.title;
  const parentBase = parentTitle.toLowerCase().split(/[:(]/)[0]?.trim() ?? '';
  if (!related.title.toLowerCase().includes(parentBase)) {
    relatedTitle = `${parentTitle}: ${related.title}`;
  }
  
  // Add media type suffix for light novels to distinguish from manga with same title
  // Use related.mediaType directly since it's more reliable than detectMediaType
  if (related.mediaType === 'light_novel' && !relatedTitle.toLowerCase().includes('light novel')) {
    relatedTitle = `${relatedTitle} (Light Novel)`;
  }
  
  // Create the related series entity
  const relatedSeries = await findOrCreateSeriesByTitle({
    title: relatedTitle,
    mediaType: relatedMediaType,
    author,
    status: 'unknown',
    parentSeriesId,
    relationship: related.relationship,
  });
  
  // First pass: Create volumes without edition links
  const volumeInputs: CreateVolumeInput[] = related.volumes.map(vol => ({
    seriesId: relatedSeries.id,
    volumeNumber: vol.volumeNumber,
    title: vol.title,
    editionIds: [],
  }));
  
  const volumes = await findOrCreateVolumes(volumeInputs);
  const volumeIds = volumes.map(v => v.id);
  
  await updateSeriesVolumes(relatedSeries.id, volumeIds);
  
  // Second pass: Create editions and link
  const volumeByNumber = new Map<number, Volume>();
  for (const vol of volumes) {
    volumeByNumber.set(vol.volumeNumber, vol);
  }

  const editionInputs: CreateEditionInput[] = [];
  
  for (const wikiVol of related.volumes) {
    const volume = volumeByNumber.get(wikiVol.volumeNumber);
    if (!volume) continue;

    if (wikiVol.japaneseISBN != null) {
      editionInputs.push({
        isbn: wikiVol.japaneseISBN,
        format: 'physical',
        language: 'ja',
        volumeIds: [volume.id],
        releaseDate: wikiVol.japaneseReleaseDate,
      });
    }
    
    if (wikiVol.englishISBN != null) {
      editionInputs.push({
        isbn: wikiVol.englishISBN,
        format: 'physical',
        language: 'en',
        volumeIds: [volume.id],
        releaseDate: wikiVol.englishReleaseDate,
      });
    }
  }

  const editions = await findOrCreateEditions(editionInputs);
  await linkEditionsToVolumes(editions, volumes);

  const englishEditionCount = editions.filter(e => e.language === 'en').length;
  console.log(`[EntityIntegration] Created related series "${relatedSeries.title}" (${relatedSeries.relationship}) with ${volumes.length} volumes (${englishEditionCount} English editions)`);
  
  return { series: relatedSeries, volumes };
}

/**
 * Create or update entities from NC Cardinal catalog data
 * Called when Wikipedia fails and we fall back to NC Cardinal
 */
export async function createEntitiesFromNCCardinal(
  seriesTitle: string,
  volumeData: Array<{
    volumeNumber: number;
    isbn?: string | undefined;
    title?: string | undefined;
  }>,
  mediaType: MediaType
): Promise<{ series: Series; volumes: Volume[] }> {
  // Create or find the series by title (no Wikipedia ID)
  const series = await findOrCreateSeriesByTitle({
    title: seriesTitle,
    mediaType,
    status: 'unknown',
  });

  // First pass: Create volumes without edition links
  const volumeInputs: CreateVolumeInput[] = volumeData.map(vol => ({
    seriesId: series.id,
    volumeNumber: vol.volumeNumber,
    title: vol.title,
    editionIds: [],
  }));

  // Create/find volumes
  const volumes = await findOrCreateVolumes(volumeInputs);
  const volumeIds = volumes.map(v => v.id);

  // Update series with volume IDs
  await updateSeriesVolumes(series.id, volumeIds);

  // Second pass: Create editions for volumes with ISBNs
  const volumeByNumber = new Map<number, Volume>();
  for (const vol of volumes) {
    volumeByNumber.set(vol.volumeNumber, vol);
  }

  const editionInputs: CreateEditionInput[] = [];
  
  for (const volData of volumeData) {
    if (volData.isbn == null) continue;
    
    const volume = volumeByNumber.get(volData.volumeNumber);
    if (!volume) continue;

    editionInputs.push({
      isbn: volData.isbn,
      format: 'physical',
      language: 'en', // NC Cardinal only has English editions
      volumeIds: [volume.id],
    });
  }

  if (editionInputs.length > 0) {
    const editions = await findOrCreateEditions(editionInputs);
    await linkEditionsToVolumes(editions, volumes);
  }

  console.log(`[EntityIntegration] Created/updated from NC Cardinal: Series "${series.title}" (${series.id}) with ${volumes.length} volumes`);

  return { series, volumes };
}

/**
 * Get series by entity ID or title (for route handlers)
 * Returns null if not found
 */
export async function getSeriesEntity(idOrTitle: string): Promise<Series | null> {
  // First try by ID
  const byId = await getSeriesById(idOrTitle);
  if (byId) {
    return byId;
  }

  // Then try by title
  return getSeriesByTitle(idOrTitle);
}

/**
 * Get volume by ID with its series (for route handlers)
 */
export async function getVolumeEntity(volumeId: string): Promise<{
  volume: Volume;
  series: Series;
} | null> {
  return getVolumeWithSeries(volumeId);
}

/**
 * Get all volumes for a series (for route handlers)
 */
export async function getSeriesVolumes(seriesId: string): Promise<Volume[]> {
  return getVolumesBySeriesId(seriesId);
}

/**
 * Get editions for a volume as EditionData (embedded format for API responses)
 */
export async function getVolumeEditionData(volumeId: string): Promise<EditionData[]> {
  const editions = await getEditionsByVolumeId(volumeId);
  return editions.map(e => ({
    isbn: e.isbn,
    format: e.format,
    language: e.language,
    releaseDate: e.releaseDate,
  }));
}

/**
 * Resolve editions for multiple volumes efficiently
 * Returns a map of volume ID -> EditionData[]
 */
export async function resolveEditionsForVolumes(volumeIds: string[]): Promise<Map<string, EditionData[]>> {
  const result = new Map<string, EditionData[]>();
  
  for (const volumeId of volumeIds) {
    const editionData = await getVolumeEditionData(volumeId);
    result.set(volumeId, editionData);
  }
  
  return result;
}

/**
 * Check if we have an entity for a series (by Wikipedia ID or title)
 */
export async function hasSeriesEntity(
  options: { wikipediaId?: number; title?: string }
): Promise<Series | null> {
  if (options.wikipediaId != null) {
    const { getSeriesByWikipediaId } = await import('./store.js');
    const series = await getSeriesByWikipediaId(options.wikipediaId);
    if (series) return series;
  }

  if (options.title != null) {
    return getSeriesByTitle(options.title);
  }

  return null;
}

/**
 * Integration between entity layer and existing search/data services
 * 
 * This module bridges the gap between the raw data from Wikipedia/NC Cardinal
 * and our entity data layer, ensuring entities are created/updated during searches.
 */

import type { WikiSeries, WikiRelatedSeries } from '../scripts/wikipedia-client.js';
import type { Series, Volume, Edition, MediaType, CreateVolumeInput } from './types.js';
import {
  findOrCreateSeriesByWikipedia,
  findOrCreateSeriesByTitle,
  updateSeriesVolumes,
  linkRelatedSeries,
  detectMediaType,
} from './series.js';
import { findOrCreateVolumes, getVolumeWithSeries } from './volumes.js';
import { getSeriesById, getSeriesByTitle, getVolumesBySeriesId } from './store.js';

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

  // Create volumes for ALL volumes (including Japan-only)
  const volumeInputs: CreateVolumeInput[] = [];

  for (const vol of wikiSeries.volumes) {
    const editions: Edition[] = [];
    
    // Add Japanese edition if we have ISBN
    if (vol.japaneseISBN) {
      editions.push({
        isbn: vol.japaneseISBN,
        format: 'physical',
        language: 'ja',
        releaseDate: vol.japaneseReleaseDate,
      });
    }
    
    // Add English edition if we have ISBN (assume physical for now)
    if (vol.englishISBN) {
      editions.push({
        isbn: vol.englishISBN,
        format: 'physical',
        language: 'en',
        releaseDate: vol.englishReleaseDate,
      });
    }
    
    // Build full title: "Subtitle" (we'll prefix with series title when displaying)
    volumeInputs.push({
      seriesId: series.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editions,  // Can be empty for volumes with no known ISBNs
    });
  }

  // Create/find volumes
  const volumes = await findOrCreateVolumes(volumeInputs);
  const volumeIds = volumes.map(v => v.id);

  // Update series with volume IDs (in order)
  await updateSeriesVolumes(series.id, volumeIds);

  console.log(`[EntityIntegration] Created/updated: Series "${series.title}" (${series.id}) with ${volumes.length} volumes`);

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
  
  // Create volumes for related series
  const volumeInputs: CreateVolumeInput[] = [];
  
  for (const vol of related.volumes) {
    const editions: Edition[] = [];
    
    // Add Japanese edition if we have ISBN
    if (vol.japaneseISBN) {
      editions.push({
        isbn: vol.japaneseISBN,
        format: 'physical',
        language: 'ja',
        releaseDate: vol.japaneseReleaseDate,
      });
    }
    
    // Add English edition if we have ISBN
    if (vol.englishISBN) {
      editions.push({
        isbn: vol.englishISBN,
        format: 'physical',
        language: 'en',
        releaseDate: vol.englishReleaseDate,
      });
    }
    
    volumeInputs.push({
      seriesId: relatedSeries.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editions,
    });
  }
  
  const volumes = await findOrCreateVolumes(volumeInputs);
  const volumeIds = volumes.map(v => v.id);
  
  await updateSeriesVolumes(relatedSeries.id, volumeIds);
  
  const englishVolumeCount = volumes.filter(v => v.editions.some(e => e.language === 'en')).length;
  console.log(`[EntityIntegration] Created related series "${relatedSeries.title}" (${relatedSeries.relationship}) with ${volumes.length} volumes (${englishVolumeCount} with English ISBNs)`);
  
  return { series: relatedSeries, volumes };
}

/**
 * Create or update entities from NC Cardinal catalog data
 * Called when Wikipedia fails and we fall back to NC Cardinal
 */
export async function createEntitiesFromNCCardinal(
  seriesTitle: string,
  volumes: Array<{
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

  // Create volumes for volumes with ISBNs
  const volumeInputs: CreateVolumeInput[] = [];

  for (const vol of volumes) {
    const editions: Edition[] = [];
    
    if (vol.isbn) {
      editions.push({
        isbn: vol.isbn,
        format: 'physical',
        language: 'en',
      });
    }
    
    volumeInputs.push({
      seriesId: series.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editions,
    });
  }

  // Create/find volumes
  const createdVolumes = await findOrCreateVolumes(volumeInputs);
  const volumeIds = createdVolumes.map(v => v.id);

  // Update series with volume IDs
  await updateSeriesVolumes(series.id, volumeIds);

  console.log(`[EntityIntegration] Created/updated from NC Cardinal: Series "${series.title}" (${series.id}) with ${createdVolumes.length} volumes`);

  return { series, volumes: createdVolumes };
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
 * Get volume by ISBN with its series (for route handlers)
 */
export async function getVolumeEntity(isbn: string): Promise<{
  volume: Volume;
  series: Series;
} | null> {
  return getVolumeWithSeries(isbn);
}

/**
 * Get all volumes for a series (for route handlers)
 */
export async function getSeriesVolumes(seriesId: string): Promise<Volume[]> {
  return getVolumesBySeriesId(seriesId);
}

/**
 * Check if we have an entity for a series (by Wikipedia ID or title)
 */
export async function hasSeriesEntity(
  options: { wikipediaId?: number; title?: string }
): Promise<Series | null> {
  if (options.wikipediaId) {
    const { getSeriesByWikipediaId } = await import('./store.js');
    const series = await getSeriesByWikipediaId(options.wikipediaId);
    if (series) return series;
  }

  if (options.title) {
    return getSeriesByTitle(options.title);
  }

  return null;
}

/**
 * Integration between entity layer and existing search/data services
 * 
 * This module bridges the gap between the raw data from Wikipedia/NC Cardinal
 * and our entity data layer, ensuring entities are created/updated during searches.
 */

import type { WikiSeries, WikiVolume, WikiRelatedSeries } from '../scripts/wikipedia-client.js';
import type { Series, Book, MediaType, CreateSeriesInput, CreateBookInput, SeriesRelationship } from './types.js';
import {
  findOrCreateSeriesByWikipedia,
  findOrCreateSeriesByTitle,
  updateSeriesBooks,
  linkRelatedSeries,
  detectMediaType,
} from './series.js';
import { findOrCreateBooks, getBookWithSeries } from './books.js';
import { getSeriesById, getSeriesByTitle, getBooksBySeriesId } from './store.js';

/**
 * Create or update entities from Wikipedia series data
 * Called after a successful Wikipedia fetch during search
 * 
 * Also creates entities for related series (spin-offs, side stories, etc.)
 */
export async function createEntitiesFromWikipedia(
  wikiSeries: WikiSeries
): Promise<{ series: Series; books: Book[]; relatedSeries?: Series[] | undefined }> {
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
    totalVolumes: wikiSeries.totalVolumes,
  });

  // Create books for main series volumes with ISBNs
  const bookInputs: CreateBookInput[] = [];
  const bookIds: string[] = [];

  for (const vol of wikiSeries.volumes) {
    if (vol.englishISBN) {
      bookIds.push(vol.englishISBN);
      // Build full title: "Series, Vol. N" or "Series, Vol. N: Subtitle"
      const fullTitle = `${wikiSeries.title}, Vol. ${vol.volumeNumber}${vol.title ? `: ${vol.title}` : ''}`;
      bookInputs.push({
        id: vol.englishISBN,
        seriesId: series.id,
        volumeNumber: vol.volumeNumber,
        title: fullTitle,
        mediaType,
        releaseDate: (vol as { englishDate?: string }).englishDate,
      });
    }
  }

  // Create/find books
  const books = await findOrCreateBooks(bookInputs);

  // Update series with book IDs (in order)
  await updateSeriesBooks(series.id, bookIds, wikiSeries.totalVolumes);

  console.log(`[EntityIntegration] Created/updated: Series "${series.title}" (${series.id}) with ${books.length} books`);

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
        relatedSeriesEntities.push(relatedEntity);
        
        // Link to parent series
        await linkRelatedSeries(series.id, relatedEntity.id);
      }
    }
    
    if (relatedSeriesEntities.length > 0) {
      console.log(`[EntityIntegration] Created ${relatedSeriesEntities.length} related series entities`);
    }
  }

  return { 
    series, 
    books, 
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
): Promise<Series | null> {
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
    totalVolumes: related.volumes.length,
    parentSeriesId,
    relationship: related.relationship,
  });
  
  // Create books for related series volumes
  const bookInputs: CreateBookInput[] = [];
  const bookIds: string[] = [];
  
  for (const vol of related.volumes) {
    if (vol.englishISBN) {
      bookIds.push(vol.englishISBN);
      // Build full title: "Series, Vol. N" or "Series, Vol. N: Subtitle"
      const fullTitle = `${relatedTitle}, Vol. ${vol.volumeNumber}${vol.title ? `: ${vol.title}` : ''}`;
      bookInputs.push({
        id: vol.englishISBN,
        seriesId: relatedSeries.id,
        volumeNumber: vol.volumeNumber,
        title: fullTitle,
        mediaType: relatedMediaType,
        releaseDate: (vol as { englishDate?: string }).englishDate,
      });
    }
  }
  
  if (bookInputs.length > 0) {
    await findOrCreateBooks(bookInputs);
    await updateSeriesBooks(relatedSeries.id, bookIds, related.volumes.length);
    console.log(`[EntityIntegration] Created related series "${relatedSeries.title}" (${relatedSeries.relationship}) with ${bookIds.length} books`);
  } else {
    console.log(`[EntityIntegration] Created related series "${relatedSeries.title}" (${relatedSeries.relationship}) with no English ISBNs`);
  }
  
  return relatedSeries;
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
): Promise<{ series: Series; books: Book[] }> {
  // Create or find the series by title (no Wikipedia ID)
  const series = await findOrCreateSeriesByTitle({
    title: seriesTitle,
    mediaType,
    totalVolumes: volumes.length,
    status: 'unknown',
  });

  // Create books for volumes with ISBNs
  const bookInputs: CreateBookInput[] = [];
  const bookIds: string[] = [];

  for (const vol of volumes) {
    if (vol.isbn) {
      bookIds.push(vol.isbn);
      bookInputs.push({
        id: vol.isbn,
        seriesId: series.id,
        volumeNumber: vol.volumeNumber,
        title: vol.title ?? `${seriesTitle}, Vol. ${vol.volumeNumber}`,
        mediaType,
      });
    }
  }

  // Create/find books
  const books = await findOrCreateBooks(bookInputs);

  // Update series with book IDs
  await updateSeriesBooks(series.id, bookIds, volumes.length);

  console.log(`[EntityIntegration] Created/updated from NC Cardinal: Series "${series.title}" (${series.id}) with ${books.length} books`);

  return { series, books };
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
 * Get book by ISBN with its series (for route handlers)
 */
export async function getBookEntity(isbn: string): Promise<{
  book: Book;
  series: Series;
} | null> {
  return getBookWithSeries(isbn);
}

/**
 * Get all books for a series (for route handlers)
 */
export async function getSeriesBooks(seriesId: string): Promise<Book[]> {
  return getBooksBySeriesId(seriesId);
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

/**
 * Integration between entity layer and existing search/data services
 * 
 * This module bridges the gap between the raw data from Wikipedia/NC Cardinal
 * and our entity data layer, ensuring entities are created/updated during searches.
 */

import type { WikiMangaSeries, WikiVolume } from '../scripts/wikipedia-client.js';
import type { Series, Book, MediaType, CreateSeriesInput, CreateBookInput } from './types.js';
import {
  findOrCreateSeriesByWikipedia,
  findOrCreateSeriesByTitle,
  updateSeriesBooks,
  detectMediaType,
} from './series.js';
import { findOrCreateBooks, getBookWithSeries } from './books.js';
import { getSeriesById, getSeriesByTitle, getBooksBySeriesId } from './store.js';

/**
 * Create or update entities from Wikipedia series data
 * Called after a successful Wikipedia fetch during search
 */
export async function createEntitiesFromWikipedia(
  wikiSeries: WikiMangaSeries
): Promise<{ series: Series; books: Book[] }> {
  const mediaType = detectMediaType(wikiSeries.title, {
    isManga: wikiSeries.title.toLowerCase().includes('manga'),
    isLightNovel: wikiSeries.title.toLowerCase().includes('light novel'),
  });

  // Create or find the series
  const series = await findOrCreateSeriesByWikipedia(wikiSeries.pageid, {
    title: wikiSeries.title,
    mediaType,
    author: wikiSeries.author,
    status: wikiSeries.isComplete ? 'completed' : 'ongoing',
    totalVolumes: wikiSeries.totalVolumes,
  });

  // Create books for volumes with ISBNs
  const bookInputs: CreateBookInput[] = [];
  const bookIds: string[] = [];

  for (const vol of wikiSeries.volumes) {
    if (vol.englishISBN) {
      bookIds.push(vol.englishISBN);
      bookInputs.push({
        id: vol.englishISBN,
        seriesId: series.id,
        volumeNumber: vol.volumeNumber,
        title: vol.title ?? `${wikiSeries.title}, Vol. ${vol.volumeNumber}`,
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

  return { series, books };
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

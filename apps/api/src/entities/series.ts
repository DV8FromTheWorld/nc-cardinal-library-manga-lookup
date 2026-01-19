/**
 * Series entity operations
 */

import { nanoid } from 'nanoid';

import { getSeriesByTitle, getSeriesByWikipediaId, saveSeries } from './store.js';
import type { CreateSeriesInput, MediaType, Series } from './types.js';

/**
 * Generate a unique series ID
 */
function generateSeriesId(): string {
  return `s_${nanoid(10)}`;
}

/**
 * Create a new series entity
 */
export async function createSeries(input: CreateSeriesInput): Promise<Series> {
  const now = new Date().toISOString();

  const series: Series = {
    id: generateSeriesId(),
    title: input.title,
    mediaType: input.mediaType,
    externalIds: input.externalIds ?? {},
    volumeIds: input.volumeIds ?? [],
    author: input.author,
    artist: input.artist,
    status: input.status ?? 'unknown',
    relatedSeriesIds: input.relatedSeriesIds,
    parentSeriesId: input.parentSeriesId,
    relationship: input.relationship,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };

  await saveSeries(series);
  console.log(
    `[Series] Created series: ${series.id} - "${series.title}"${input.relationship != null ? ` (${input.relationship})` : ''}`
  );

  return series;
}

/**
 * Find or create a series by Wikipedia page ID
 */
export async function findOrCreateSeriesByWikipedia(
  wikipediaPageId: number,
  input: CreateSeriesInput
): Promise<Series> {
  // Check if we already have this series by Wikipedia ID
  const existing = await getSeriesByWikipediaId(wikipediaPageId);
  if (existing) {
    console.log(
      `[Series] Found existing series by Wikipedia ID ${wikipediaPageId}: ${existing.id}`
    );
    return existing;
  }

  // Also check by title in case we have it without Wikipedia ID
  const byTitle = await getSeriesByTitle(input.title);
  if (byTitle) {
    // Update with Wikipedia ID if we didn't have it
    if (byTitle.externalIds.wikipedia == null) {
      byTitle.externalIds.wikipedia = wikipediaPageId;
      byTitle.updatedAt = new Date().toISOString();
      await saveSeries(byTitle);
      console.log(`[Series] Updated existing series with Wikipedia ID: ${byTitle.id}`);
    }
    return byTitle;
  }

  // Create new series with Wikipedia ID
  return createSeries({
    ...input,
    externalIds: {
      ...input.externalIds,
      wikipedia: wikipediaPageId,
    },
  });
}

/**
 * Find or create a series by title (fallback when no Wikipedia ID)
 */
export async function findOrCreateSeriesByTitle(input: CreateSeriesInput): Promise<Series> {
  const existing = await getSeriesByTitle(input.title);
  if (existing) {
    console.log(`[Series] Found existing series by title: ${existing.id} - "${existing.title}"`);
    return existing;
  }

  return createSeries(input);
}

/**
 * Update series volume list
 */
export async function updateSeriesVolumes(seriesId: string, volumeIds: string[]): Promise<void> {
  const { getSeriesById } = await import('./store.js');
  const series = await getSeriesById(seriesId);

  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  series.volumeIds = volumeIds;
  series.updatedAt = new Date().toISOString();

  await saveSeries(series);
  console.log(`[Series] Updated volumes for ${seriesId}: ${volumeIds.length} volumes`);
}

/**
 * Update series description
 * Only updates if series doesn't have a description yet
 */
export async function updateSeriesDescription(
  seriesId: string,
  description: string
): Promise<void> {
  const { getSeriesById } = await import('./store.js');
  const series = await getSeriesById(seriesId);

  if (!series) {
    console.warn(`[Series] Cannot update description - series not found: ${seriesId}`);
    return;
  }

  // Only set if not already present
  if (series.description == null) {
    series.description = description;
    series.updatedAt = new Date().toISOString();
    await saveSeries(series);
    console.log(`[Series] Updated description for ${seriesId}: ${description.slice(0, 50)}...`);
  }
}

/**
 * Link a related series to its parent series
 */
export async function linkRelatedSeries(
  parentSeriesId: string,
  relatedSeriesId: string
): Promise<void> {
  const { getSeriesById } = await import('./store.js');
  const parent = await getSeriesById(parentSeriesId);

  if (!parent) {
    throw new Error(`Parent series not found: ${parentSeriesId}`);
  }

  // Initialize relatedSeriesIds if not present
  parent.relatedSeriesIds ??= [];

  // Add related series ID if not already present
  if (!parent.relatedSeriesIds.includes(relatedSeriesId)) {
    parent.relatedSeriesIds.push(relatedSeriesId);
    parent.updatedAt = new Date().toISOString();
    await saveSeries(parent);
    console.log(`[Series] Linked related series ${relatedSeriesId} to parent ${parentSeriesId}`);
  }
}

/**
 * Detect media type from title or other hints
 */
export function detectMediaType(
  title: string,
  hints?: { isLightNovel?: boolean; isManga?: boolean }
): MediaType {
  const lowerTitle = title.toLowerCase();

  if (hints?.isLightNovel || lowerTitle.includes('light novel')) {
    return 'light_novel';
  }
  if (hints?.isManga || lowerTitle.includes('manga')) {
    return 'manga';
  }
  if (lowerTitle.includes('artbook') || lowerTitle.includes('art book')) {
    return 'artbook';
  }
  if (lowerTitle.includes('guidebook') || lowerTitle.includes('guide book')) {
    return 'guidebook';
  }

  // Default to manga for this app's context
  return 'manga';
}

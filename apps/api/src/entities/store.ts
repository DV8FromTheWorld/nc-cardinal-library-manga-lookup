/**
 * Entity store - persists entities to the database via Drizzle
 *
 * This module provides the data access layer for series, volumes, and editions.
 * It translates between the DB schema (relational, normalized) and the API-layer
 * types (denormalized, with embedded ID arrays like volumeIds/editionIds).
 */

import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { db } from '../db/index.js';
import { editions, editionVolumes } from '../modules/editions/db/schema.js';
import {
  series,
  seriesExternalIds,
  seriesRelations,
  titleIndex,
} from '../modules/series/db/schema.js';
import { volumes } from '../modules/volumes/db/schema.js';
import type { Edition, EntityStore, Series, Volume } from './types.js';

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

// ============================================================================
// Internal helpers: reconstruct API types from DB rows
// ============================================================================

/**
 * Reconstruct a Series API object from DB rows.
 * Fetches external IDs, volume IDs, and related series IDs.
 */
function reconstructSeries(row: typeof series.$inferSelect): Series {
  // Get external IDs for this series
  const extIds = db
    .select({ source: seriesExternalIds.source, externalId: seriesExternalIds.externalId })
    .from(seriesExternalIds)
    .where(eq(seriesExternalIds.seriesId, row.id))
    .all();

  const externalIds: Series['externalIds'] = {};
  for (const ext of extIds) {
    if (ext.source === 'wikipedia') externalIds.wikipedia = Number(ext.externalId);
    if (ext.source === 'myanimelist') externalIds.myanimelist = Number(ext.externalId);
    if (ext.source === 'anilist') externalIds.anilist = Number(ext.externalId);
  }

  // Get ordered volume IDs
  const volumeRows = db
    .select({ id: volumes.id })
    .from(volumes)
    .where(eq(volumes.seriesId, row.id))
    .orderBy(volumes.sortOrder)
    .all();

  // Get related series IDs
  const relatedRows = db
    .select({ relatedSeriesId: seriesRelations.relatedSeriesId })
    .from(seriesRelations)
    .where(eq(seriesRelations.seriesId, row.id))
    .all();

  return {
    id: row.id,
    title: row.title,
    mediaType: row.mediaType as Series['mediaType'],
    externalIds,
    volumeIds: volumeRows.map((v) => v.id),
    author: row.author ?? undefined,
    artist: row.artist ?? undefined,
    status: (row.status as Series['status']) ?? 'unknown',
    relatedSeriesIds:
      relatedRows.length > 0 ? relatedRows.map((r) => r.relatedSeriesId) : undefined,
    parentSeriesId: row.parentSeriesId ?? undefined,
    relationship: (row.relationship as Series['relationship']) ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Reconstruct a Volume API object from a DB row.
 * Fetches edition IDs from the join table.
 */
function reconstructVolume(row: typeof volumes.$inferSelect): Volume {
  const editionRows = db
    .select({ editionId: editionVolumes.editionId })
    .from(editionVolumes)
    .where(eq(editionVolumes.volumeId, row.id))
    .all();

  return {
    id: row.id,
    seriesId: row.seriesId,
    volumeNumber: row.volumeNumber,
    title: row.title ?? undefined,
    editionIds: editionRows.map((e) => e.editionId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Reconstruct an Edition API object from a DB row.
 * Fetches volume IDs from the join table.
 */
function reconstructEdition(row: typeof editions.$inferSelect): Edition {
  const volumeRows = db
    .select({ volumeId: editionVolumes.volumeId })
    .from(editionVolumes)
    .where(eq(editionVolumes.editionId, row.id))
    .all();

  return {
    id: row.id,
    isbn: row.isbn,
    format: row.format as Edition['format'],
    language: row.language as Edition['language'],
    volumeIds: volumeRows.map((v) => v.volumeId),
    releaseDate: row.releaseDate ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ============================================================================
// Series functions
// ============================================================================

/**
 * Get a series by ID
 */
export async function getSeriesById(id: string): Promise<Series | null> {
  const row = db.select().from(series).where(eq(series.id, id)).get();
  if (row == null) return null;
  return reconstructSeries(row);
}

/**
 * Get a series by Wikipedia page ID
 */
export async function getSeriesByWikipediaId(wikipediaId: number): Promise<Series | null> {
  const extRow = db
    .select({ seriesId: seriesExternalIds.seriesId })
    .from(seriesExternalIds)
    .where(
      and(
        eq(seriesExternalIds.source, 'wikipedia'),
        eq(seriesExternalIds.externalId, String(wikipediaId))
      )
    )
    .get();

  if (extRow == null) return null;
  return getSeriesById(extRow.seriesId);
}

/**
 * Get a series by title (normalized lookup)
 */
export async function getSeriesByTitle(title: string): Promise<Series | null> {
  const normalized = normalizeTitle(title);
  const indexRow = db
    .select({ seriesId: titleIndex.seriesId })
    .from(titleIndex)
    .where(eq(titleIndex.normalizedTitle, normalized))
    .get();

  if (indexRow == null) return null;
  return getSeriesById(indexRow.seriesId);
}

/**
 * Save a series (creates or updates).
 * Also updates title index and external ID indexes.
 */
export async function saveSeries(s: Series): Promise<void> {
  const now = new Date().toISOString();

  // Upsert the series row
  db.insert(series)
    .values({
      id: s.id,
      title: s.title,
      mediaType: s.mediaType,
      author: s.author ?? null,
      artist: s.artist ?? null,
      status: s.status,
      description: s.description ?? null,
      parentSeriesId: s.parentSeriesId ?? null,
      relationship: s.relationship ?? null,
      createdAt: s.createdAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: series.id,
      set: {
        title: s.title,
        mediaType: s.mediaType,
        author: s.author ?? null,
        artist: s.artist ?? null,
        status: s.status,
        description: s.description ?? null,
        parentSeriesId: s.parentSeriesId ?? null,
        relationship: s.relationship ?? null,
        updatedAt: now,
      },
    })
    .run();

  // Update title index
  db.insert(titleIndex)
    .values({
      normalizedTitle: normalizeTitle(s.title),
      seriesId: s.id,
    })
    .onConflictDoUpdate({
      target: titleIndex.normalizedTitle,
      set: { seriesId: s.id },
    })
    .run();

  // Update external IDs
  if (s.externalIds.wikipedia != null) {
    db.insert(seriesExternalIds)
      .values({
        seriesId: s.id,
        source: 'wikipedia',
        externalId: String(s.externalIds.wikipedia),
      })
      .onConflictDoUpdate({
        target: [seriesExternalIds.seriesId, seriesExternalIds.source],
        set: { externalId: String(s.externalIds.wikipedia) },
      })
      .run();
  }

  if (s.externalIds.anilist != null) {
    db.insert(seriesExternalIds)
      .values({
        seriesId: s.id,
        source: 'anilist',
        externalId: String(s.externalIds.anilist),
      })
      .onConflictDoUpdate({
        target: [seriesExternalIds.seriesId, seriesExternalIds.source],
        set: { externalId: String(s.externalIds.anilist) },
      })
      .run();
  }

  if (s.externalIds.myanimelist != null) {
    db.insert(seriesExternalIds)
      .values({
        seriesId: s.id,
        source: 'myanimelist',
        externalId: String(s.externalIds.myanimelist),
      })
      .onConflictDoUpdate({
        target: [seriesExternalIds.seriesId, seriesExternalIds.source],
        set: { externalId: String(s.externalIds.myanimelist) },
      })
      .run();
  }

  // Update related series
  if (s.relatedSeriesIds != null && s.relatedSeriesIds.length > 0) {
    for (const relatedId of s.relatedSeriesIds) {
      db.insert(seriesRelations)
        .values({ seriesId: s.id, relatedSeriesId: relatedId })
        .onConflictDoNothing()
        .run();
    }
  }
}

// ============================================================================
// Volume functions
// ============================================================================

/**
 * Get a volume by its ID
 */
export async function getVolumeById(id: string): Promise<Volume | null> {
  const row = db.select().from(volumes).where(eq(volumes.id, id)).get();
  if (row == null) return null;
  return reconstructVolume(row);
}

/**
 * Get a volume by series ID and volume number
 */
export async function getVolumeBySeriesAndNumber(
  seriesId: string,
  volumeNumber: number
): Promise<Volume | null> {
  const row = db
    .select()
    .from(volumes)
    .where(and(eq(volumes.seriesId, seriesId), eq(volumes.volumeNumber, volumeNumber)))
    .get();

  if (row == null) return null;
  return reconstructVolume(row);
}

/**
 * Get all volumes for a series, ordered by sort order
 */
export async function getVolumesBySeriesId(seriesId: string): Promise<Volume[]> {
  const rows = db
    .select()
    .from(volumes)
    .where(eq(volumes.seriesId, seriesId))
    .orderBy(volumes.sortOrder)
    .all();

  return rows.map(reconstructVolume);
}

/**
 * Save a volume (creates or updates)
 */
export async function saveVolume(volume: Volume): Promise<void> {
  const now = new Date().toISOString();

  // Determine sort order: use volumeNumber as default
  const existingRow = db
    .select({ sortOrder: volumes.sortOrder })
    .from(volumes)
    .where(eq(volumes.id, volume.id))
    .get();
  const sortOrder = existingRow?.sortOrder ?? volume.volumeNumber;

  db.insert(volumes)
    .values({
      id: volume.id,
      seriesId: volume.seriesId,
      volumeNumber: volume.volumeNumber,
      title: volume.title ?? null,
      sortOrder,
      createdAt: volume.createdAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: volumes.id,
      set: {
        seriesId: volume.seriesId,
        volumeNumber: volume.volumeNumber,
        title: volume.title ?? null,
        updatedAt: now,
      },
    })
    .run();

  // Sync edition links from the volume's editionIds array
  if (volume.editionIds.length > 0) {
    for (const editionId of volume.editionIds) {
      db.insert(editionVolumes)
        .values({ editionId, volumeId: volume.id })
        .onConflictDoNothing()
        .run();
    }
  }
}

/**
 * Save multiple volumes at once
 */
export async function saveVolumes(vols: Volume[]): Promise<void> {
  for (const volume of vols) {
    await saveVolume(volume);
  }
}

/**
 * Add a volume to a series (updates the volume's seriesId and series updatedAt)
 */
export async function addVolumeToSeries(seriesId: string, volumeId: string): Promise<void> {
  const seriesRow = db.select().from(series).where(eq(series.id, seriesId)).get();
  if (seriesRow == null) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  // Verify volume exists
  const volumeRow = db.select().from(volumes).where(eq(volumes.id, volumeId)).get();
  if (volumeRow == null) {
    throw new Error(`Volume not found: ${volumeId}`);
  }

  // Update volume's seriesId if not already set
  if (volumeRow.seriesId !== seriesId) {
    db.update(volumes)
      .set({ seriesId, updatedAt: new Date().toISOString() })
      .where(eq(volumes.id, volumeId))
      .run();
  }

  // Touch series updatedAt
  db.update(series)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(series.id, seriesId))
    .run();
}

// ============================================================================
// Edition functions
// ============================================================================

/**
 * Get an edition by its ID
 */
export async function getEditionById(id: string): Promise<Edition | null> {
  const row = db.select().from(editions).where(eq(editions.id, id)).get();
  if (row == null) return null;
  return reconstructEdition(row);
}

/**
 * Get an edition by ISBN
 */
export async function getEditionByIsbn(isbn: string): Promise<Edition | null> {
  const row = db.select().from(editions).where(eq(editions.isbn, isbn)).get();
  if (row == null) return null;
  return reconstructEdition(row);
}

/**
 * Get all editions for a volume (via the join table)
 */
export async function getEditionsByVolumeId(volumeId: string): Promise<Edition[]> {
  const joinRows = db
    .select({ editionId: editionVolumes.editionId })
    .from(editionVolumes)
    .where(eq(editionVolumes.volumeId, volumeId))
    .all();

  const results: Edition[] = [];
  for (const { editionId } of joinRows) {
    const row = db.select().from(editions).where(eq(editions.id, editionId)).get();
    if (row != null) {
      results.push(reconstructEdition(row));
    }
  }

  return results;
}

/**
 * Get all editions that contain a specific volume ID
 */
export async function getEditionsContainingVolume(volumeId: string): Promise<Edition[]> {
  return getEditionsByVolumeId(volumeId);
}

/**
 * Save an edition (creates or updates). Also updates the edition_volumes join table.
 */
export async function saveEdition(edition: Edition): Promise<void> {
  const now = new Date().toISOString();

  db.insert(editions)
    .values({
      id: edition.id,
      isbn: edition.isbn,
      format: edition.format,
      language: edition.language,
      releaseDate: edition.releaseDate ?? null,
      createdAt: edition.createdAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: editions.id,
      set: {
        isbn: edition.isbn,
        format: edition.format,
        language: edition.language,
        releaseDate: edition.releaseDate ?? null,
        updatedAt: now,
      },
    })
    .run();

  // Sync volume links
  for (const volumeId of edition.volumeIds) {
    db.insert(editionVolumes)
      .values({ editionId: edition.id, volumeId })
      .onConflictDoNothing()
      .run();
  }
}

/**
 * Save multiple editions at once
 */
export async function saveEditions(editionsList: Edition[]): Promise<void> {
  for (const edition of editionsList) {
    await saveEdition(edition);
  }
}

/**
 * Add a volume to an edition (updates the join table)
 */
export async function addVolumeToEdition(editionId: string, volumeId: string): Promise<void> {
  const editionRow = db.select().from(editions).where(eq(editions.id, editionId)).get();
  if (editionRow == null) {
    throw new Error(`Edition not found: ${editionId}`);
  }

  db.insert(editionVolumes).values({ editionId, volumeId }).onConflictDoNothing().run();

  db.update(editions)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(editions.id, editionId))
    .run();
}

/**
 * Add an edition to a volume (updates the join table)
 */
export async function addEditionToVolume(volumeId: string, editionId: string): Promise<void> {
  const volumeRow = db.select().from(volumes).where(eq(volumes.id, volumeId)).get();
  if (volumeRow == null) {
    throw new Error(`Volume not found: ${volumeId}`);
  }

  db.insert(editionVolumes).values({ editionId, volumeId }).onConflictDoNothing().run();

  db.update(volumes)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(volumes.id, volumeId))
    .run();
}

// ============================================================================
// Admin/Debug functions
// ============================================================================

/**
 * Get all series (for debugging/admin)
 */
export async function getAllSeries(): Promise<Series[]> {
  const rows = db.select().from(series).all();
  return rows.map(reconstructSeries);
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
  const seriesCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(series)
      .get()?.count ?? 0;
  const volumeCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(volumes)
      .get()?.count ?? 0;
  const editionCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(editions)
      .get()?.count ?? 0;
  const isbnCount = editionCount; // ISBN is now just a column on editions, not a separate index
  const wikipediaCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(seriesExternalIds)
      .where(eq(seriesExternalIds.source, 'wikipedia'))
      .get()?.count ?? 0;
  const titleCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(titleIndex)
      .get()?.count ?? 0;

  return {
    seriesCount,
    volumeCount,
    editionCount,
    isbnIndexCount: isbnCount,
    wikipediaIndexCount: wikipediaCount,
    titleIndexCount: titleCount,
  };
}

/**
 * Clear the in-memory cache (no-op now that we use the database)
 */
export function clearCache(): void {
  // No-op: database is always the source of truth
}

/**
 * Load the entity store from the database.
 * Returns a denormalized EntityStore object for backwards compatibility.
 * Prefer using individual get* functions for new code.
 */
export async function loadStore(): Promise<EntityStore> {
  const allSeries = await getAllSeries();
  const allVolumes = db.select().from(volumes).all().map(reconstructVolume);
  const allEditions = db.select().from(editions).all().map(reconstructEdition);

  const store: EntityStore = {
    series: {},
    volumes: {},
    editions: {},
    isbnIndex: {},
    wikipediaIndex: {},
    titleIndex: {},
  };

  for (const s of allSeries) {
    store.series[s.id] = s;
    if (s.externalIds.wikipedia != null) {
      store.wikipediaIndex[s.externalIds.wikipedia] = s.id;
    }
    store.titleIndex[normalizeTitle(s.title)] = s.id;
  }

  for (const v of allVolumes) {
    store.volumes[v.id] = v;
  }

  for (const e of allEditions) {
    store.editions[e.id] = e;
    store.isbnIndex[e.isbn] = e.id;
  }

  return store;
}

/**
 * Save the entity store to the database.
 * Provided for backwards compatibility — prefer using individual save* functions.
 */
export async function saveStore(): Promise<void> {
  // No-op: individual save* functions write directly to the database
}

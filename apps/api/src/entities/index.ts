/**
 * Entity data layer
 * 
 * This module provides stable IDs for series and volumes, persisted to disk.
 * Series get generated IDs, volumes get generated IDs with ISBN index for lookups.
 */

// Types
export type {
  MediaType,
  SeriesStatus,
  SeriesRelationship,
  SeriesExternalIds,
  EditionFormat,
  EditionLanguage,
  Edition,
  Series,
  Volume,
  EntityStore,
  CreateSeriesInput,
  CreateVolumeInput,
} from './types.js';

// Store operations
export {
  loadStore,
  saveStore,
  normalizeTitle,
  generateVolumeId,
  getSeriesById,
  getSeriesByWikipediaId,
  getSeriesByTitle,
  saveSeries,
  getVolumeById,
  getVolumeByIsbn,
  getVolumeBySeriesAndNumber,
  getVolumesBySeriesId,
  saveVolume,
  saveVolumes,
  addVolumeToSeries,
  getAllSeries,
  getStoreStats,
  clearCache,
} from './store.js';

// Series operations
export {
  createSeries,
  findOrCreateSeriesByWikipedia,
  findOrCreateSeriesByTitle,
  updateSeriesVolumes,
  linkRelatedSeries,
  detectMediaType,
} from './series.js';

// Volume operations
export {
  createVolume,
  findOrCreateVolume,
  findOrCreateVolumes,
  getVolumeWithSeries,
  mergeEditions,
} from './volumes.js';

// Integration with existing services
export {
  createEntitiesFromWikipedia,
  createEntitiesFromNCCardinal,
  getSeriesEntity,
  getVolumeEntity,
  getSeriesVolumes,
  hasSeriesEntity,
} from './integration.js';

/**
 * Entity data layer
 *
 * This module provides stable IDs for series, volumes, and editions, persisted to disk.
 * Series, volumes, and editions all get generated IDs.
 * ISBN index maps to Edition IDs for lookups.
 */

// Types
export type {
  CreateEditionInput,
  CreateSeriesInput,
  CreateVolumeInput,
  Edition,
  EditionData,
  EditionFormat,
  EditionLanguage,
  EntityStore,
  MediaType,
  Series,
  SeriesExternalIds,
  SeriesRelationship,
  SeriesStatus,
  Volume,
} from './types.js';

// Store operations
export {
  addEditionToVolume,
  addVolumeToEdition,
  addVolumeToSeries,
  clearCache,
  generateEditionId,
  generateVolumeId,
  getAllSeries,
  getEditionById,
  getEditionByIsbn,
  getEditionsByVolumeId,
  getEditionsContainingVolume,
  getSeriesById,
  getSeriesByTitle,
  getSeriesByWikipediaId,
  getStoreStats,
  getVolumeById,
  getVolumeBySeriesAndNumber,
  getVolumesBySeriesId,
  loadStore,
  normalizeTitle,
  saveEdition,
  saveEditions,
  saveSeries,
  saveStore,
  saveVolume,
  saveVolumes,
} from './store.js';

// Series operations
export {
  createSeries,
  detectMediaType,
  findOrCreateSeriesByTitle,
  findOrCreateSeriesByWikipedia,
  linkRelatedSeries,
  updateSeriesVolumes,
} from './series.js';

// Volume operations
export {
  createVolume,
  findOrCreateVolume,
  findOrCreateVolumes,
  getVolumeWithSeries,
  linkEditionToVolume,
} from './volumes.js';

// Edition operations
export {
  createEdition,
  findOrCreateEdition,
  findOrCreateEditions,
  linkVolumeToEdition,
} from './editions.js';

// Integration with existing services
export {
  createEntitiesFromNCCardinal,
  createEntitiesFromWikipedia,
  getSeriesEntity,
  getSeriesVolumes,
  getVolumeEditionData,
  getVolumeEntity,
  hasSeriesEntity,
  resolveEditionsForVolumes,
} from './integration.js';

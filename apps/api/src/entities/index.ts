/**
 * Entity data layer
 * 
 * This module provides stable IDs for series, volumes, and editions, persisted to disk.
 * Series, volumes, and editions all get generated IDs.
 * ISBN index maps to Edition IDs for lookups.
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
  EditionData,
  Series,
  Volume,
  EntityStore,
  CreateSeriesInput,
  CreateVolumeInput,
  CreateEditionInput,
} from './types.js';

// Store operations
export {
  loadStore,
  saveStore,
  normalizeTitle,
  generateVolumeId,
  generateEditionId,
  getSeriesById,
  getSeriesByWikipediaId,
  getSeriesByTitle,
  saveSeries,
  getVolumeById,
  getVolumeBySeriesAndNumber,
  getVolumesBySeriesId,
  saveVolume,
  saveVolumes,
  addVolumeToSeries,
  getEditionById,
  getEditionByIsbn,
  getEditionsByVolumeId,
  getEditionsContainingVolume,
  saveEdition,
  saveEditions,
  addVolumeToEdition,
  addEditionToVolume,
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
  linkEditionToVolume,
  getVolumeWithSeries,
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
  createEntitiesFromWikipedia,
  createEntitiesFromNCCardinal,
  getSeriesEntity,
  getVolumeEntity,
  getSeriesVolumes,
  getVolumeEditionData,
  resolveEditionsForVolumes,
  hasSeriesEntity,
} from './integration.js';

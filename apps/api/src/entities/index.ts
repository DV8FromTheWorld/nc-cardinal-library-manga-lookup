/**
 * Entity data layer
 * 
 * This module provides stable IDs for series and books, persisted to disk.
 * Series get generated IDs, books use ISBN as their ID.
 */

// Types
export type {
  MediaType,
  SeriesStatus,
  SeriesExternalIds,
  BookExternalIds,
  Series,
  Book,
  EntityStore,
  CreateSeriesInput,
  CreateBookInput,
} from './types.js';

// Store operations
export {
  loadStore,
  saveStore,
  normalizeTitle,
  getSeriesById,
  getSeriesByWikipediaId,
  getSeriesByTitle,
  saveSeries,
  getBookByIsbn,
  getBooksBySeriesId,
  saveBook,
  saveBooks,
  addBookToSeries,
  getAllSeries,
  getStoreStats,
  clearCache,
} from './store.js';

// Series operations
export {
  createSeries,
  findOrCreateSeriesByWikipedia,
  findOrCreateSeriesByTitle,
  updateSeriesBooks,
  detectMediaType,
} from './series.js';

// Book operations
export {
  createBook,
  findOrCreateBook,
  createBooks,
  findOrCreateBooks,
  updateBookWithNCCardinal,
  getBookWithSeries,
} from './books.js';

// Integration with existing services
export {
  createEntitiesFromWikipedia,
  createEntitiesFromNCCardinal,
  getSeriesEntity,
  getBookEntity,
  getSeriesBooks,
  hasSeriesEntity,
} from './integration.js';

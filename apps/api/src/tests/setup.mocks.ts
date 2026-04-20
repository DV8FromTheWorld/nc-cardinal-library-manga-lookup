/**
 * Global default mocks for all API route tests.
 *
 * Vitest runs this file before each test file (via vitest.config setupFiles).
 * Every mock here provides a safe no-op default. Individual test files only
 * need to override the mocks they're actually testing.
 *
 * All vi.fn() calls are typed via `typeof` to catch signature drift at compile time.
 */

import { vi } from 'vitest';

import type {
  getSeriesById,
  getSeriesEntity,
  getVolumeById,
  getVolumeEditionData,
  getVolumeEntity,
  getVolumesBySeriesId,
} from '../entities/index.js';
import type { updateSeriesDescription } from '../entities/series.js';
import type { getPopularManga, getSuggestions } from '../scripts/anilist-client.js';
import type {
  clearAllCaches,
  clearCacheForISBN,
  clearCacheForSearch,
  clearCacheForSeries,
  clearCacheType,
  getAllCacheStats,
} from '../scripts/cache-utils.js';
import type {
  extractUniqueVolumeDescription,
  findCommonPreamble,
  getDescriptionByISBN,
} from '../scripts/google-books-client.js';
import type {
  fetchBookcoverUrl,
  fetchGoogleBooksCoverUrl,
  getSeriesDetails,
  search,
} from '../scripts/manga-search.js';
import type { SearchResult } from '../scripts/manga-search.js';
import type { searchWithProgress } from '../scripts/manga-search-streaming.js';
import type { searchByISBN } from '../scripts/opensearch-client.js';
import type {
  getCheckouts,
  getHistory,
  getHolds,
  getSession,
  isHistoryEnabled,
  isSessionValid,
  login,
  logout,
} from '../scripts/patron-client.js';

vi.mock('../scripts/cache-utils.js', () => ({
  getAllCacheStats: vi
    .fn<typeof getAllCacheStats>()
    .mockReturnValue({ caches: [], totalEntries: 0, totalSizeBytes: 0 }),
  clearAllCaches: vi.fn<typeof clearAllCaches>().mockReturnValue({ deletedCount: 0 }),
  clearCacheType: vi.fn<typeof clearCacheType>().mockReturnValue({ deletedCount: 0 }),
  clearCacheForISBN: vi
    .fn<typeof clearCacheForISBN>()
    .mockReturnValue({ deletedCount: 0, deletedFiles: [] }),
  clearCacheForSeries: vi
    .fn<typeof clearCacheForSeries>()
    .mockReturnValue({ deletedCount: 0, deletedFiles: [] }),
  clearCacheForSearch: vi
    .fn<typeof clearCacheForSearch>()
    .mockReturnValue({ deletedCount: 0, deletedFiles: [] }),
}));

vi.mock('../scripts/manga-search.js', () => ({
  search: vi
    .fn<typeof search>()
    .mockResolvedValue({
      query: '',
      parsedQuery: { originalQuery: '', title: '' },
      series: [],
      volumes: [],
    }),
  fetchBookcoverUrl: vi.fn<typeof fetchBookcoverUrl>().mockResolvedValue(null),
  fetchGoogleBooksCoverUrl: vi.fn<typeof fetchGoogleBooksCoverUrl>().mockResolvedValue(null),
  getSeriesDetails: vi.fn<typeof getSeriesDetails>().mockResolvedValue(null),
}));

vi.mock('../scripts/manga-search-streaming.js', () => ({
  searchWithProgress: vi.fn<typeof searchWithProgress>().mockResolvedValue({
    query: '',
    parsedQuery: { originalQuery: '', title: '' },
    series: [],
    volumes: [],
  } satisfies SearchResult),
}));

vi.mock('../scripts/anilist-client.js', () => ({
  getPopularManga: vi.fn<typeof getPopularManga>().mockResolvedValue([]),
  getSuggestions: vi.fn<typeof getSuggestions>().mockResolvedValue([]),
}));

vi.mock('../scripts/opensearch-client.js', () => ({
  NC_CARDINAL_LIBRARIES: [{ code: 'TEST_LIB', name: 'Test Library' }],
  searchByISBN: vi.fn<typeof searchByISBN>().mockResolvedValue(null),
}));

vi.mock('../scripts/patron-client.js', () => ({
  login: vi.fn<typeof login>().mockResolvedValue({ success: false }),
  logout: vi.fn<typeof logout>().mockResolvedValue(false),
  getSession: vi.fn<typeof getSession>().mockReturnValue(null),
  isSessionValid: vi.fn<typeof isSessionValid>().mockReturnValue(false),
  getCheckouts: vi.fn<typeof getCheckouts>().mockResolvedValue({ items: [], totalCount: 0 }),
  getHistory: vi
    .fn<typeof getHistory>()
    .mockResolvedValue({
      items: [],
      totalCount: 0,
      hasMore: false,
      offset: 0,
      limit: 15,
      historyEnabled: true,
    }),
  getHolds: vi.fn<typeof getHolds>().mockResolvedValue({ items: [], totalCount: 0 }),
  isHistoryEnabled: vi.fn<typeof isHistoryEnabled>().mockResolvedValue(true),
}));

vi.mock('../entities/index.js', () => ({
  getSeriesById: vi.fn<typeof getSeriesById>().mockResolvedValue(null),
  getSeriesEntity: vi.fn<typeof getSeriesEntity>().mockResolvedValue(null),
  getVolumeById: vi.fn<typeof getVolumeById>().mockResolvedValue(null),
  getVolumeEditionData: vi.fn<typeof getVolumeEditionData>().mockResolvedValue([]),
  getVolumeEntity: vi.fn<typeof getVolumeEntity>().mockResolvedValue(null),
  getVolumesBySeriesId: vi.fn<typeof getVolumesBySeriesId>().mockResolvedValue([]),
}));

vi.mock('../entities/series.js', () => ({
  updateSeriesDescription: vi.fn<typeof updateSeriesDescription>().mockResolvedValue(undefined),
}));

vi.mock('../scripts/google-books-client.js', () => ({
  extractUniqueVolumeDescription: vi
    .fn<typeof extractUniqueVolumeDescription>()
    .mockReturnValue(''),
  findCommonPreamble: vi.fn<typeof findCommonPreamble>().mockReturnValue(null),
  getDescriptionByISBN: vi.fn<typeof getDescriptionByISBN>().mockResolvedValue(null),
}));

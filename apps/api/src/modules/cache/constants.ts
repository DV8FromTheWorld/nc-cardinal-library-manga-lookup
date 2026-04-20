/**
 * Cache namespace constants.
 *
 * Every cache consumer uses one of these. Centralizing them here
 * ensures typos are caught at compile time and makes it easy to
 * see all namespaces at a glance.
 */
export const CACHE_NS = {
  WIKIPEDIA: 'wikipedia',
  GOOGLE_BOOKS: 'google-books',
  BOOKCOVER: 'bookcover',
  BOOKCOVER_TIMEOUTS: 'bookcover-timeouts',
  GOOGLE_BOOKS_COVERS: 'google-books-covers',
  NC_CARDINAL_ISBN_MAP: 'nc-cardinal-isbn-map',
  NC_CARDINAL_RECORDS: 'nc-cardinal-records',
  NC_CARDINAL_SEARCHES: 'nc-cardinal-searches',
  ANILIST: 'anilist',
  TALPA: 'talpa',
  LIBRARYTHING_BROWSER: 'librarything-browser',
  SEARCH_SERVICE: 'search-service',
} as const;

export type CacheNamespace = (typeof CACHE_NS)[keyof typeof CACHE_NS];

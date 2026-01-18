/**
 * Route parameter types for type-safe navigation.
 */

export type SearchParams = {
  query?: string | undefined;
};

export type SeriesParams = {
  id: string;
};

export type BookParams = {
  isbn: string;
};

export type RouteParams = {
  search: SearchParams;
  series: SeriesParams;
  book: BookParams;
};

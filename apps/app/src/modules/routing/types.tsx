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
  slug?: string | undefined;
};

export type RouteParams = {
  search: SearchParams;
  series: SeriesParams;
  book: BookParams;
};

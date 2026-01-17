/**
 * Shared route definitions used by both web and native routers.
 */

export const routes = {
  search: '/',
  series: '/series/:id',
  book: '/books/:isbn',
} as const;

export type RouteName = keyof typeof routes;

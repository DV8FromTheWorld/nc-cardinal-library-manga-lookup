/**
 * Shared route definitions used by both web and native routers.
 */

export const routes = {
  home: '/',
  search: '/search',
  series: '/series/:id',
  volume: '/volumes/:id',
} as const;

export type RouteName = keyof typeof routes;

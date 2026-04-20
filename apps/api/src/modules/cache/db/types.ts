import type { cacheEntries } from './schema.js';

export type CacheEntryRow = typeof cacheEntries.$inferSelect;
export type CacheEntryInsert = typeof cacheEntries.$inferInsert;

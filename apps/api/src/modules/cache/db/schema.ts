import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Generic cache table replacing all .cache/* file-based caches.
 *
 * The `version` column enables cache invalidation when data shapes change.
 * Each consumer defines its own version constant — when bumped, reads miss
 * old entries and writes create new ones. A periodic cleanup job can purge
 * rows with outdated versions.
 */
export const cacheEntries = sqliteTable(
  'cache_entries',
  {
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    version: integer('version').notNull().default(1),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.namespace, table.key, table.version] }),
    index('cache_expires_at_idx').on(table.expiresAt),
  ]
);

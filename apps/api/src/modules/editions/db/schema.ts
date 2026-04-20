import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { volumes } from '../../volumes/db/schema.js';

export const editions = sqliteTable('editions', {
  id: text('id').primaryKey(),
  isbn: text('isbn').notNull().unique(),
  format: text('format').notNull(),
  language: text('language').notNull(),
  releaseDate: text('release_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Join table: editions can contain multiple volumes (omnibus),
 * and volumes can have multiple editions (Japanese + English).
 */
export const editionVolumes = sqliteTable(
  'edition_volumes',
  {
    editionId: text('edition_id')
      .notNull()
      .references(() => editions.id),
    volumeId: text('volume_id')
      .notNull()
      .references(() => volumes.id),
  },
  (table) => [primaryKey({ columns: [table.editionId, table.volumeId] })]
);

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { series } from '../../series/db/schema.js';

export const volumes = sqliteTable('volumes', {
  id: text('id').primaryKey(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id),
  volumeNumber: integer('volume_number').notNull(),
  title: text('title'),
  sortOrder: integer('sort_order').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

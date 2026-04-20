import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Series
// ============================================================================

export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  mediaType: text('media_type').notNull(),
  author: text('author'),
  artist: text('artist'),
  status: text('status').notNull().default('unknown'),
  description: text('description'),
  parentSeriesId: text('parent_series_id'),
  relationship: text('relationship'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const seriesExternalIds = sqliteTable(
  'series_external_ids',
  {
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.seriesId, table.source] }),
    index('external_ids_source_idx').on(table.source, table.externalId),
  ]
);

export const seriesRelations = sqliteTable(
  'series_relations',
  {
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id),
    relatedSeriesId: text('related_series_id')
      .notNull()
      .references(() => series.id),
  },
  (table) => [primaryKey({ columns: [table.seriesId, table.relatedSeriesId] })]
);

// ============================================================================
// Title Index (normalized title -> series ID for fast lookup)
// ============================================================================

export const titleIndex = sqliteTable('title_index', {
  normalizedTitle: text('normalized_title').notNull().unique(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id),
});

import type { series, seriesExternalIds, seriesRelations, titleIndex } from './schema.js';

export type SeriesRow = typeof series.$inferSelect;
export type SeriesInsert = typeof series.$inferInsert;

export type SeriesExternalIdRow = typeof seriesExternalIds.$inferSelect;
export type SeriesExternalIdInsert = typeof seriesExternalIds.$inferInsert;

export type SeriesRelationRow = typeof seriesRelations.$inferSelect;
export type SeriesRelationInsert = typeof seriesRelations.$inferInsert;

export type TitleIndexRow = typeof titleIndex.$inferSelect;
export type TitleIndexInsert = typeof titleIndex.$inferInsert;

import type { editions, editionVolumes } from './schema.js';

export type EditionRow = typeof editions.$inferSelect;
export type EditionInsert = typeof editions.$inferInsert;

export type EditionVolumeRow = typeof editionVolumes.$inferSelect;
export type EditionVolumeInsert = typeof editionVolumes.$inferInsert;

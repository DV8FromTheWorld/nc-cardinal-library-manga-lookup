import type { volumes } from './schema.js';

export type VolumeRow = typeof volumes.$inferSelect;
export type VolumeInsert = typeof volumes.$inferInsert;

/**
 * Cache service backed by the cache_entries DB table.
 *
 * Replaces all .cache/* file-based caching with a single table.
 * Each cache consumer specifies a namespace, key, version, and TTL.
 */

import { and, eq, lt, or, sql } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { cacheEntries } from './db/schema.js';

/**
 * Get a cached value. Returns null if not found or expired.
 */
export function getCache(namespace: string, key: string, version: number = 1): string | null {
  const row = db
    .select({ value: cacheEntries.value, expiresAt: cacheEntries.expiresAt })
    .from(cacheEntries)
    .where(
      and(
        eq(cacheEntries.namespace, namespace),
        eq(cacheEntries.key, key),
        eq(cacheEntries.version, version)
      )
    )
    .get();

  if (row == null) return null;

  if (row.expiresAt != null && row.expiresAt.getTime() < Date.now()) {
    deleteCache(namespace, key, version);
    return null;
  }

  return row.value;
}

/**
 * Get a cached value and parse it as JSON.
 */
export function getCacheJson<T>(namespace: string, key: string, version: number = 1): T | null {
  const raw = getCache(namespace, key, version);
  if (raw == null) return null;
  return JSON.parse(raw) as T;
}

/**
 * Set a cached value. Upserts on (namespace, key, version).
 *
 * @param ttlMs - Time to live in milliseconds. Omit for permanent cache.
 */
export function setCache(
  namespace: string,
  key: string,
  value: string,
  version: number = 1,
  ttlMs?: number
): void {
  const expiresAt = ttlMs != null ? new Date(Date.now() + ttlMs) : null;

  db.insert(cacheEntries)
    .values({
      namespace,
      key,
      value,
      version,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [cacheEntries.namespace, cacheEntries.key, cacheEntries.version],
      set: {
        value,
        expiresAt,
        createdAt: new Date(),
      },
    })
    .run();
}

/**
 * Set a cached value as JSON.
 */
export function setCacheJson<T>(
  namespace: string,
  key: string,
  value: T,
  version: number = 1,
  ttlMs?: number
): void {
  setCache(namespace, key, JSON.stringify(value), version, ttlMs);
}

/**
 * Delete a specific cache entry.
 */
export function deleteCache(namespace: string, key: string, version: number = 1): boolean {
  const result = db
    .delete(cacheEntries)
    .where(
      and(
        eq(cacheEntries.namespace, namespace),
        eq(cacheEntries.key, key),
        eq(cacheEntries.version, version)
      )
    )
    .run();

  return result.changes > 0;
}

/**
 * Delete all entries in a namespace.
 */
export function clearNamespace(namespace: string): number {
  const result = db.delete(cacheEntries).where(eq(cacheEntries.namespace, namespace)).run();

  return result.changes;
}

/**
 * Delete entries matching a key prefix within a namespace.
 */
export function clearByKeyPrefix(namespace: string, keyPrefix: string): number {
  const result = db
    .delete(cacheEntries)
    .where(
      and(eq(cacheEntries.namespace, namespace), sql`${cacheEntries.key} LIKE ${keyPrefix + '%'}`)
    )
    .run();

  return result.changes;
}

/**
 * Delete all cache entries across all namespaces.
 */
export function clearAll(): number {
  const result = db.delete(cacheEntries).run();
  return result.changes;
}

/**
 * Delete all expired entries across all namespaces.
 */
export function purgeExpired(): number {
  const result = db
    .delete(cacheEntries)
    .where(and(sql`${cacheEntries.expiresAt} IS NOT NULL`, lt(cacheEntries.expiresAt, new Date())))
    .run();

  return result.changes;
}

/**
 * Get stats for each namespace.
 */
export function getStats(): {
  caches: Array<{ type: string; entryCount: number; totalSizeBytes: number }>;
  totalEntries: number;
  totalSizeBytes: number;
} {
  const rows = db
    .select({
      namespace: cacheEntries.namespace,
      count: sql<number>`count(*)`,
      size: sql<number>`sum(length(${cacheEntries.value}))`,
    })
    .from(cacheEntries)
    .groupBy(cacheEntries.namespace)
    .all();

  const caches = rows.map((row) => ({
    type: row.namespace,
    entryCount: row.count,
    totalSizeBytes: row.size,
  }));

  return {
    caches,
    totalEntries: caches.reduce((sum, c) => sum + c.entryCount, 0),
    totalSizeBytes: caches.reduce((sum, c) => sum + c.totalSizeBytes, 0),
  };
}

/**
 * Find and delete cache entries matching a key across specific namespaces.
 * Used by admin endpoints to clear ISBN-related caches, series caches, etc.
 */
export function clearByKey(
  namespaces: string[],
  key: string
): { deletedCount: number; deletedFiles: string[] } {
  const deleted: string[] = [];

  for (const ns of namespaces) {
    const rows = db
      .select({ key: cacheEntries.key })
      .from(cacheEntries)
      .where(
        and(
          eq(cacheEntries.namespace, ns),
          or(eq(cacheEntries.key, key), sql`${cacheEntries.key} LIKE ${key + '%'}`)
        )
      )
      .all();

    if (rows.length > 0) {
      db.delete(cacheEntries)
        .where(
          and(
            eq(cacheEntries.namespace, ns),
            or(eq(cacheEntries.key, key), sql`${cacheEntries.key} LIKE ${key + '%'}`)
          )
        )
        .run();

      for (const row of rows) {
        deleted.push(`${ns}/${row.key}`);
      }
    }
  }

  return { deletedCount: deleted.length, deletedFiles: deleted };
}

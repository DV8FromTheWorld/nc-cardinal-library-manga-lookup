import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../../tests/db.js';

vi.mock('../../../db/index.js', () => ({
  db: createTestDb(),
}));

import {
  clearAll,
  clearByKey,
  clearByKeyPrefix,
  clearNamespace,
  deleteCache,
  getCache,
  getCacheJson,
  getStats,
  purgeExpired,
  setCache,
  setCacheJson,
} from '../service.js';

beforeEach(() => {
  clearAll();
});

describe('getCache / setCache', () => {
  it('returns null for missing key', () => {
    expect(getCache('test', 'missing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    setCache('test', 'key1', 'hello');
    expect(getCache('test', 'key1')).toBe('hello');
  });

  it('separates by namespace', () => {
    setCache('ns1', 'key', 'val1');
    setCache('ns2', 'key', 'val2');
    expect(getCache('ns1', 'key')).toBe('val1');
    expect(getCache('ns2', 'key')).toBe('val2');
  });

  it('separates by version', () => {
    setCache('test', 'key', 'v1', 1);
    setCache('test', 'key', 'v2', 2);
    expect(getCache('test', 'key', 1)).toBe('v1');
    expect(getCache('test', 'key', 2)).toBe('v2');
  });

  it('upserts on conflict', () => {
    setCache('test', 'key', 'first');
    setCache('test', 'key', 'second');
    expect(getCache('test', 'key')).toBe('second');
  });
});

describe('TTL behavior', () => {
  it('returns value before expiry', () => {
    setCache('test', 'key', 'val', 1, 60_000);
    expect(getCache('test', 'key')).toBe('val');
  });

  it('returns null after expiry', () => {
    setCache('test', 'key', 'val', 1, -2000);
    expect(getCache('test', 'key')).toBeNull();
  });

  it('permanent cache (no TTL) never expires', () => {
    setCache('test', 'key', 'permanent');
    expect(getCache('test', 'key')).toBe('permanent');
  });
});

describe('getCacheJson / setCacheJson', () => {
  it('round-trips JSON objects', () => {
    const data = { title: 'Demon Slayer', volumes: 23 };
    setCacheJson('test', 'series', data);
    expect(getCacheJson('test', 'series')).toEqual(data);
  });

  it('returns null for missing key', () => {
    expect(getCacheJson('test', 'missing')).toBeNull();
  });
});

describe('deleteCache', () => {
  it('deletes a specific entry', () => {
    setCache('test', 'key', 'val');
    expect(deleteCache('test', 'key')).toBe(true);
    expect(getCache('test', 'key')).toBeNull();
  });

  it('returns false for missing entry', () => {
    expect(deleteCache('test', 'missing')).toBe(false);
  });

  it('only deletes the targeted version', () => {
    setCache('test', 'key', 'v1', 1);
    setCache('test', 'key', 'v2', 2);
    deleteCache('test', 'key', 1);
    expect(getCache('test', 'key', 1)).toBeNull();
    expect(getCache('test', 'key', 2)).toBe('v2');
  });
});

describe('clearNamespace', () => {
  it('clears all entries in a namespace', () => {
    setCache('ns1', 'a', '1');
    setCache('ns1', 'b', '2');
    setCache('ns2', 'a', '3');

    expect(clearNamespace('ns1')).toBe(2);
    expect(getCache('ns1', 'a')).toBeNull();
    expect(getCache('ns1', 'b')).toBeNull();
    expect(getCache('ns2', 'a')).toBe('3');
  });
});

describe('clearByKeyPrefix', () => {
  it('deletes entries matching prefix', () => {
    setCache('wiki', 'search_demon', '1');
    setCache('wiki', 'search_one_piece', '2');
    setCache('wiki', 'page_123', '3');

    expect(clearByKeyPrefix('wiki', 'search_')).toBe(2);
    expect(getCache('wiki', 'search_demon')).toBeNull();
    expect(getCache('wiki', 'page_123')).toBe('3');
  });
});

describe('clearAll', () => {
  it('clears everything', () => {
    setCache('ns1', 'a', '1');
    setCache('ns2', 'b', '2');

    expect(clearAll()).toBe(2);
    expect(getCache('ns1', 'a')).toBeNull();
    expect(getCache('ns2', 'b')).toBeNull();
  });
});

describe('purgeExpired', () => {
  it('removes expired entries and keeps valid ones', () => {
    setCache('test', 'expired', 'val', 1, -2000);
    setCache('test', 'valid', 'val', 1, 60_000);
    setCache('test', 'permanent', 'val');

    expect(purgeExpired()).toBe(1);
    expect(getCache('test', 'valid', 1)).toBe('val');
    expect(getCache('test', 'permanent')).toBe('val');
  });
});

describe('getStats', () => {
  it('returns stats grouped by namespace', () => {
    setCache('wiki', 'a', 'hello');
    setCache('wiki', 'b', 'world');
    setCache('covers', 'c', 'https://example.com/img.jpg');

    const stats = getStats();
    expect(stats.totalEntries).toBe(3);
    expect(stats.caches).toHaveLength(2);

    const wiki = stats.caches.find((c) => c.type === 'wiki');
    expect(wiki?.entryCount).toBe(2);

    const covers = stats.caches.find((c) => c.type === 'covers');
    expect(covers?.entryCount).toBe(1);
  });

  it('returns empty stats for empty DB', () => {
    const stats = getStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.caches).toHaveLength(0);
  });
});

describe('clearByKey', () => {
  it('clears matching keys across specified namespaces', () => {
    setCache('google-books', '9781234567890', 'data1');
    setCache('bookcover', '9781234567890', 'data2');
    setCache('nc-cardinal', '9781234567890', 'data3');
    setCache('wiki', 'unrelated', 'data4');

    const result = clearByKey(['google-books', 'bookcover', 'nc-cardinal'], '9781234567890');

    expect(result.deletedCount).toBe(3);
    expect(getCache('google-books', '9781234567890')).toBeNull();
    expect(getCache('bookcover', '9781234567890')).toBeNull();
    expect(getCache('nc-cardinal', '9781234567890')).toBeNull();
    expect(getCache('wiki', 'unrelated')).toBe('data4');
  });

  it('matches key prefixes', () => {
    setCache('wiki', 'series_v4_demon', 'data1');
    setCache('wiki', 'series_v4_one', 'data2');
    setCache('wiki', 'page_123', 'data3');

    const result = clearByKey(['wiki'], 'series_v4_');
    expect(result.deletedCount).toBe(2);
    expect(getCache('wiki', 'page_123')).toBe('data3');
  });
});

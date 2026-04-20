import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../tests/setup.js';

// Override cache-utils with real return data (defaults return empty)
vi.mock('../../../scripts/cache-utils.js', () => ({
  getAllCacheStats: vi.fn().mockReturnValue({
    caches: [
      { type: 'wikipedia', entryCount: 10, totalSizeBytes: 5000 },
      { type: 'nc-cardinal', entryCount: 20, totalSizeBytes: 10000 },
    ],
    totalEntries: 30,
    totalSizeBytes: 15000,
  }),
  clearAllCaches: vi.fn().mockReturnValue({ deletedCount: 30 }),
  clearCacheType: vi.fn().mockReturnValue({ deletedCount: 10 }),
  clearCacheForISBN: vi
    .fn()
    .mockReturnValue({ deletedCount: 2, deletedFiles: ['a.json', 'b.json'] }),
  clearCacheForSeries: vi.fn().mockReturnValue({ deletedCount: 3, deletedFiles: ['a.json'] }),
  clearCacheForSearch: vi.fn().mockReturnValue({ deletedCount: 1, deletedFiles: ['a.json'] }),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /manga/cache/stats', () => {
  it('returns 200 with cache statistics', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/cache/stats' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('caches');
    expect(body).toHaveProperty('totalEntries');
    expect(body).toHaveProperty('totalSizeBytes');
    expect(Array.isArray(body.caches)).toBe(true);
  });
});

describe('DELETE /manga/cache', () => {
  it('returns 200 with deletion result', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/manga/cache' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.success).toBe(true);
    expect(typeof body.deletedCount).toBe('number');
  });
});

describe('DELETE /manga/cache/type/:type', () => {
  it('returns 200 for valid cache type', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/manga/cache/type/wikipedia' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 for invalid cache type', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/manga/cache/type/invalid' });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /manga/cache/book/:isbn', () => {
  it('returns 200 with deletion result', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/manga/cache/book/9781974700523' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.success).toBe(true);
    expect(typeof body.deletedCount).toBe('number');
  });

  it('rejects too-short ISBN', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/manga/cache/book/123' });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /manga/cache/series/:slug', () => {
  it('returns 200 with deletion result', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/manga/cache/series/demon-slayer' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /manga/cache/search/:query', () => {
  it('returns 200 with deletion result', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/manga/cache/search/one+piece' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

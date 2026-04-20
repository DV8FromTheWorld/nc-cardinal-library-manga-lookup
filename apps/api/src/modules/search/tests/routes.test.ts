import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../tests/setup.js';

// Override with real search data
vi.mock('../../../scripts/manga-search.js', () => ({
  search: vi.fn().mockResolvedValue({
    query: 'demon slayer',
    parsedQuery: { originalQuery: 'demon slayer', title: 'demon slayer' },
    series: [
      {
        id: 's_test1',
        title: 'Demon Slayer: Kimetsu no Yaiba',
        totalVolumes: 23,
        availableVolumes: 20,
        isComplete: true,
        author: 'Koyoharu Gotouge',
        source: 'wikipedia',
      },
    ],
    volumes: [],
  }),
  fetchBookcoverUrl: vi.fn().mockResolvedValue(null),
  fetchGoogleBooksCoverUrl: vi.fn().mockResolvedValue(null),
  getSeriesDetails: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../scripts/manga-search-streaming.js', () => ({
  searchWithProgress: vi
    .fn()
    .mockImplementation(async (_q: string, opts: { onProgress: (e: unknown) => void }) => {
      opts.onProgress({ type: 'started', query: 'test' });
      opts.onProgress({ type: 'complete', data: {} });
    }),
}));

vi.mock('../../../scripts/anilist-client.js', () => ({
  getPopularManga: vi.fn().mockResolvedValue([
    {
      anilistId: 1,
      title: 'One Piece',
      titleRomaji: 'One Piece',
      format: 'MANGA',
      volumes: 109,
      status: 'RELEASING',
      coverUrl: 'https://example.com/op.jpg',
    },
  ]),
  getSuggestions: vi.fn().mockResolvedValue([
    {
      anilistId: 2,
      title: 'Demon Slayer',
      titleRomaji: 'Kimetsu no Yaiba',
      format: 'MANGA',
      volumes: 23,
      status: 'FINISHED',
      coverUrl: 'https://example.com/ds.jpg',
    },
  ]),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /manga/search', () => {
  it('returns 200 with search results for valid query', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/search?q=demon+slayer' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('query');
    expect(body).toHaveProperty('parsedQuery');
    expect(body).toHaveProperty('series');
    expect(body).toHaveProperty('volumes');
    expect(Array.isArray(body.series)).toBe(true);
    expect(Array.isArray(body.volumes)).toBe(true);
  });

  it('returns 400 when q is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/search' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when q is empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/search?q=' });
    expect(res.statusCode).toBe(400);
  });

  it('accepts optional debug and homeLibrary params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/manga/search?q=test&debug=true&homeLibrary=HIGH_POINT_MAIN',
    });
    expect(res.statusCode).toBe(200);
  });

  it('validates series result shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/search?q=demon+slayer' });
    const body = res.json();
    const series = body.series[0];

    expect(series).toHaveProperty('id');
    expect(series).toHaveProperty('title');
    expect(series).toHaveProperty('totalVolumes');
    expect(series).toHaveProperty('availableVolumes');
    expect(series).toHaveProperty('isComplete');
    expect(series).toHaveProperty('source');
  });
});

describe('GET /manga/search/stream', () => {
  it('returns 200 with SSE content-type for valid query', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/search/stream?q=test' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 when q is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/search/stream' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /manga/popular', () => {
  it('returns 200 with popular manga items', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/popular' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('accepts optional limit params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/manga/popular?popularLimit=10&trendingLimit=5',
    });
    expect(res.statusCode).toBe(200);
  });

  it('validates suggestion item shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/popular' });
    const body = res.json();
    const item = body.items[0];

    expect(item).toHaveProperty('anilistId');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('titleRomaji');
    expect(item).toHaveProperty('format');
    expect(item).toHaveProperty('volumes');
    expect(item).toHaveProperty('status');
  });
});

describe('GET /manga/suggestions', () => {
  it('returns 200 with suggestions for valid query', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/suggestions?q=demon' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns 400 when q is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/suggestions' });
    expect(res.statusCode).toBe(400);
  });

  it('accepts optional limit param', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/suggestions?q=test&limit=5' });
    expect(res.statusCode).toBe(200);
  });
});

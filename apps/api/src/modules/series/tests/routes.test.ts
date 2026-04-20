import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { getSeriesEntity } from '../../../entities/index.js';
import type { getSeriesDetails } from '../../../scripts/manga-search.js';
import { makeSeries } from '../../../tests/fixtures.js';
import { buildApp } from '../../../tests/setup.js';

const mockGetSeriesEntity = vi.fn<typeof getSeriesEntity>();
const mockGetSeriesDetails = vi.fn<typeof getSeriesDetails>();

vi.mock('../../../entities/index.js', () => ({
  getSeriesById: vi.fn().mockResolvedValue(null),
  getSeriesEntity: (...args: unknown[]) =>
    mockGetSeriesEntity(...(args as Parameters<typeof getSeriesEntity>)),
  getVolumeById: vi.fn().mockResolvedValue(null),
  getVolumeEditionData: vi.fn().mockResolvedValue([]),
  getVolumeEntity: vi.fn().mockResolvedValue(null),
  getVolumesBySeriesId: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../scripts/manga-search.js', () => ({
  search: vi
    .fn()
    .mockResolvedValue({
      query: '',
      parsedQuery: { originalQuery: '', title: '' },
      series: [],
      volumes: [],
    }),
  fetchBookcoverUrl: vi.fn().mockResolvedValue(null),
  fetchGoogleBooksCoverUrl: vi.fn().mockResolvedValue(null),
  getSeriesDetails: (...args: unknown[]) =>
    mockGetSeriesDetails(...(args as Parameters<typeof getSeriesDetails>)),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /manga/series/:id', () => {
  it('returns 404 when series not found', async () => {
    mockGetSeriesEntity.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/manga/series/s_nonexistent' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('series_not_found');
  });

  it('returns 200 with series details when found', async () => {
    mockGetSeriesEntity.mockResolvedValue(makeSeries({ id: 's_test1', title: 'Demon Slayer' }));
    mockGetSeriesDetails.mockResolvedValue({
      id: 's_test1',
      title: 'Demon Slayer: Kimetsu no Yaiba',
      totalVolumes: 23,
      coverImage: 'https://example.com/cover.jpg',
      isComplete: true,
      author: 'Koyoharu Gotouge',
      volumes: [],
      availableCount: 20,
      missingVolumes: [21, 22, 23],
    });

    const res = await app.inject({ method: 'GET', url: '/manga/series/s_test1' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('totalVolumes');
    expect(body).toHaveProperty('isComplete');
    expect(body).toHaveProperty('volumes');
    expect(body).toHaveProperty('availableCount');
    expect(body).toHaveProperty('missingVolumes');
  });

  it('returns 404 when series entity exists but details fail to load', async () => {
    mockGetSeriesEntity.mockResolvedValue(makeSeries({ id: 's_test2', title: 'Unknown Series' }));
    mockGetSeriesDetails.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/manga/series/s_test2' });
    expect(res.statusCode).toBe(404);
  });

  it('accepts debug and homeLibrary params', async () => {
    mockGetSeriesEntity.mockResolvedValue(makeSeries({ id: 's_test1', title: 'Demon Slayer' }));
    mockGetSeriesDetails.mockResolvedValue({
      id: 's_test1',
      title: 'Demon Slayer',
      totalVolumes: 1,
      isComplete: false,
      volumes: [],
      availableCount: 0,
      missingVolumes: [],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/manga/series/s_test1?debug=true&homeLibrary=HIGH_POINT_MAIN',
    });
    expect(res.statusCode).toBe(200);
  });
});

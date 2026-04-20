import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { getVolumeEntity } from '../../../entities/index.js';
import type { searchByISBN } from '../../../scripts/opensearch-client.js';
import { makeCatalogRecord } from '../../../tests/fixtures.js';
import { buildApp } from '../../../tests/setup.js';

const mockGetVolumeEntity = vi.fn<typeof getVolumeEntity>();
const mockSearchByISBN = vi.fn<typeof searchByISBN>();

vi.mock('../../../entities/index.js', () => ({
  getSeriesById: vi.fn().mockResolvedValue(null),
  getSeriesEntity: vi.fn().mockResolvedValue(null),
  getVolumeById: vi.fn().mockResolvedValue(null),
  getVolumeEditionData: vi.fn().mockResolvedValue([]),
  getVolumeEntity: (...args: unknown[]) =>
    mockGetVolumeEntity(...(args as Parameters<typeof getVolumeEntity>)),
  getVolumesBySeriesId: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../scripts/opensearch-client.js', () => ({
  NC_CARDINAL_LIBRARIES: [{ code: 'TEST_LIB', name: 'Test Library' }],
  searchByISBN: (...args: unknown[]) =>
    mockSearchByISBN(...(args as Parameters<typeof searchByISBN>)),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /manga/books/:isbn', () => {
  it('returns 404 when entity not found and not in catalog', async () => {
    mockGetVolumeEntity.mockRejectedValue(new Error('not found'));
    mockSearchByISBN.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/manga/books/9781974700523' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when entity not found but in catalog', async () => {
    mockGetVolumeEntity.mockRejectedValue(new Error('not found'));
    mockSearchByISBN.mockResolvedValue(makeCatalogRecord());

    const res = await app.inject({ method: 'GET', url: '/manga/books/9781974700523' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('entity_not_found');
  });

  it('rejects too-short ISBN', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/books/123' });
    expect(res.statusCode).toBe(400);
  });
});

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  getSeriesById,
  getVolumeById,
  getVolumeEditionData,
  getVolumesBySeriesId,
} from '../../../entities/index.js';
import type { getDescriptionByISBN } from '../../../scripts/google-books-client.js';
import type { fetchBookcoverUrl, fetchGoogleBooksCoverUrl } from '../../../scripts/manga-search.js';
import type { searchByISBN } from '../../../scripts/opensearch-client.js';
import { makeCatalogRecord, makeSeries, makeVolume } from '../../../tests/fixtures.js';
import { buildApp } from '../../../tests/setup.js';

const mockGetVolumeById = vi.fn<typeof getVolumeById>();
const mockGetSeriesById = vi.fn<typeof getSeriesById>();
const mockGetVolumeEditionData = vi.fn<typeof getVolumeEditionData>();
const mockGetVolumesBySeriesId = vi.fn<typeof getVolumesBySeriesId>();
const mockSearchByISBN = vi.fn<typeof searchByISBN>();
const mockFetchBookcoverUrl = vi.fn<typeof fetchBookcoverUrl>();
const mockFetchGoogleBooksCoverUrl = vi.fn<typeof fetchGoogleBooksCoverUrl>();
const mockGetDescriptionByISBN = vi.fn<typeof getDescriptionByISBN>();

vi.mock('../../../entities/index.js', () => ({
  getSeriesById: (...args: unknown[]) =>
    mockGetSeriesById(...(args as Parameters<typeof getSeriesById>)),
  getSeriesEntity: vi.fn().mockResolvedValue(null),
  getVolumeById: (...args: unknown[]) =>
    mockGetVolumeById(...(args as Parameters<typeof getVolumeById>)),
  getVolumeEditionData: (...args: unknown[]) =>
    mockGetVolumeEditionData(...(args as Parameters<typeof getVolumeEditionData>)),
  getVolumeEntity: vi.fn().mockResolvedValue(null),
  getVolumesBySeriesId: (...args: unknown[]) =>
    mockGetVolumesBySeriesId(...(args as Parameters<typeof getVolumesBySeriesId>)),
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
  fetchBookcoverUrl: (...args: unknown[]) =>
    mockFetchBookcoverUrl(...(args as Parameters<typeof fetchBookcoverUrl>)),
  fetchGoogleBooksCoverUrl: (...args: unknown[]) =>
    mockFetchGoogleBooksCoverUrl(...(args as Parameters<typeof fetchGoogleBooksCoverUrl>)),
  getSeriesDetails: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../scripts/opensearch-client.js', () => ({
  NC_CARDINAL_LIBRARIES: [{ code: 'TEST_LIB', name: 'Test Library' }],
  searchByISBN: (...args: unknown[]) =>
    mockSearchByISBN(...(args as Parameters<typeof searchByISBN>)),
}));

vi.mock('../../../scripts/google-books-client.js', () => ({
  extractUniqueVolumeDescription: vi.fn().mockReturnValue(''),
  findCommonPreamble: vi.fn().mockReturnValue(null),
  getDescriptionByISBN: (...args: unknown[]) =>
    mockGetDescriptionByISBN(...(args as Parameters<typeof getDescriptionByISBN>)),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /manga/volumes/:id', () => {
  it('returns 404 when volume not found', async () => {
    mockGetVolumeById.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/manga/volumes/v_nonexistent' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('volume_not_found');
  });

  it('returns 404 when volume exists but series not found', async () => {
    mockGetVolumeById.mockResolvedValue(makeVolume({ id: 'v_test1', seriesId: 's_gone' }));
    mockGetSeriesById.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/manga/volumes/v_test1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('series_not_found');
  });

  it('returns 200 for Japan-only volume (no ISBN)', async () => {
    mockGetVolumeById.mockResolvedValue(makeVolume({ id: 'v_jp1', volumeNumber: 99 }));
    mockGetSeriesById.mockResolvedValue(makeSeries({ title: 'Test Series', author: 'Author' }));
    mockGetVolumeEditionData.mockResolvedValue([
      { isbn: '9784000000001', format: 'physical', language: 'ja' },
    ]);

    const res = await app.inject({ method: 'GET', url: '/manga/volumes/v_jp1' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.id).toBe('v_jp1');
    expect(body.seriesInfo.title).toBe('Test Series');
    expect(body.libraryHoldings).toEqual([]);
  });

  it('returns 200 with full details when ISBN and record found', async () => {
    mockGetVolumeById.mockResolvedValue(makeVolume({ id: 'v_en1', editionIds: ['e_1'] }));
    mockGetSeriesById.mockResolvedValue(
      makeSeries({ title: 'Test Series', author: 'Author', description: 'Series desc' })
    );
    mockGetVolumeEditionData.mockResolvedValue([
      { isbn: '9781234567890', format: 'physical', language: 'en' },
    ]);
    mockGetVolumesBySeriesId.mockResolvedValue([]);
    mockSearchByISBN.mockResolvedValue(
      makeCatalogRecord({
        authors: ['Author'],
        subjects: ['Manga'],
        summary: 'A test manga.',
        libraryHoldings: [
          {
            libraryCode: 'TEST_LIB',
            libraryName: 'Test Library',
            copies: [
              {
                location: 'YA Fiction',
                callNumber: 'MANGA TEST v.1',
                status: 'Available',
                statusCategory: 'available',
                barcode: 'BC1',
                available: true,
              },
            ],
          },
        ],
      })
    );
    mockFetchBookcoverUrl.mockResolvedValue('https://example.com/cover.jpg');
    mockGetDescriptionByISBN.mockResolvedValue('Series desc Volume 1 is great.');

    const res = await app.inject({ method: 'GET', url: '/manga/volumes/v_en1' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.id).toBe('v_en1');
    expect(body.seriesInfo).toHaveProperty('id');
    expect(body.seriesInfo).toHaveProperty('title');
    expect(body.editions).toHaveLength(1);
    expect(body.coverImage).toBe('https://example.com/cover.jpg');
    expect(body.catalogUrl).toContain('nccardinal.org');
    expect(body.authors).toContain('Author');
    expect(body.libraryHoldings).toHaveLength(1);
  });

  it('returns 200 with no catalog data when ISBN not in NC Cardinal', async () => {
    mockGetVolumeById.mockResolvedValue(
      makeVolume({ id: 'v_en2', volumeNumber: 2, editionIds: ['e_2'] })
    );
    mockGetSeriesById.mockResolvedValue(
      makeSeries({ title: 'Test Series', author: 'Author', description: 'Desc' })
    );
    mockGetVolumeEditionData.mockResolvedValue([
      { isbn: '9781234567891', format: 'physical', language: 'en' },
    ]);
    mockGetVolumesBySeriesId.mockResolvedValue([]);
    mockSearchByISBN.mockResolvedValue(null);
    mockFetchBookcoverUrl.mockResolvedValue(null);
    mockFetchGoogleBooksCoverUrl.mockResolvedValue(null);
    mockGetDescriptionByISBN.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/manga/volumes/v_en2' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.libraryHoldings).toEqual([]);
  });
});

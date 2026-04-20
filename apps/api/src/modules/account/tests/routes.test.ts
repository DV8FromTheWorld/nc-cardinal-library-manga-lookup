import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  getCheckouts,
  getHistory,
  getHolds,
  isHistoryEnabled,
  isSessionValid,
} from '../../../scripts/patron-client.js';
import { buildApp } from '../../../tests/setup.js';

const mockIsSessionValid = vi.fn<typeof isSessionValid>();
const mockGetCheckouts = vi.fn<typeof getCheckouts>();
const mockGetHistory = vi.fn<typeof getHistory>();
const mockGetHolds = vi.fn<typeof getHolds>();
const mockIsHistoryEnabled = vi.fn<typeof isHistoryEnabled>();

vi.mock('../../../scripts/patron-client.js', () => ({
  login: vi.fn().mockResolvedValue({ success: false }),
  logout: vi.fn().mockResolvedValue(false),
  getSession: vi.fn().mockReturnValue(null),
  isSessionValid: (...args: unknown[]) =>
    mockIsSessionValid(...(args as Parameters<typeof isSessionValid>)),
  getCheckouts: (...args: unknown[]) =>
    mockGetCheckouts(...(args as Parameters<typeof getCheckouts>)),
  getHistory: (...args: unknown[]) => mockGetHistory(...(args as Parameters<typeof getHistory>)),
  getHolds: (...args: unknown[]) => mockGetHolds(...(args as Parameters<typeof getHolds>)),
  isHistoryEnabled: (...args: unknown[]) =>
    mockIsHistoryEnabled(...(args as Parameters<typeof isHistoryEnabled>)),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /manga/user/checkouts', () => {
  it('returns 401 without valid session', async () => {
    mockIsSessionValid.mockReturnValue(false);

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/checkouts',
      headers: { 'x-session-id': 'invalid' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with checkouts for valid session', async () => {
    mockIsSessionValid.mockReturnValue(true);
    mockGetCheckouts.mockResolvedValue({
      items: [
        {
          recordId: '123',
          title: 'Demon Slayer Vol 1',
          dueDate: '2026-05-01',
          barcode: 'BC123',
          overdue: false,
          catalogUrl: 'https://nccardinal.org/eg/opac/record/123',
        },
      ],
      totalCount: 1,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/checkouts',
      headers: { 'x-session-id': 'valid_session' },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('totalCount');
    expect(body.items).toHaveLength(1);
  });
});

describe('GET /manga/user/history', () => {
  it('returns 401 without valid session', async () => {
    mockIsSessionValid.mockReturnValue(false);

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/history',
      headers: { 'x-session-id': 'invalid' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with history for valid session', async () => {
    mockIsSessionValid.mockReturnValue(true);
    mockGetHistory.mockResolvedValue({
      items: [],
      totalCount: 0,
      hasMore: false,
      offset: 0,
      limit: 15,
      historyEnabled: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/history',
      headers: { 'x-session-id': 'valid_session' },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('totalCount');
    expect(body).toHaveProperty('hasMore');
    expect(body).toHaveProperty('historyEnabled');
  });

  it('accepts limit and offset params', async () => {
    mockIsSessionValid.mockReturnValue(true);
    mockGetHistory.mockResolvedValue({
      items: [],
      totalCount: 0,
      hasMore: false,
      offset: 10,
      limit: 5,
      historyEnabled: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/history?limit=5&offset=10',
      headers: { 'x-session-id': 'valid_session' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /manga/user/holds', () => {
  it('returns 401 without valid session', async () => {
    mockIsSessionValid.mockReturnValue(false);

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/holds',
      headers: { 'x-session-id': 'invalid' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with holds for valid session', async () => {
    mockIsSessionValid.mockReturnValue(true);
    mockGetHolds.mockResolvedValue({
      items: [],
      totalCount: 0,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/holds',
      headers: { 'x-session-id': 'valid_session' },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('totalCount');
  });
});

describe('GET /manga/user/settings/history', () => {
  it('returns 401 without valid session', async () => {
    mockIsSessionValid.mockReturnValue(false);

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/settings/history',
      headers: { 'x-session-id': 'invalid' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with historyEnabled boolean', async () => {
    mockIsSessionValid.mockReturnValue(true);
    mockIsHistoryEnabled.mockResolvedValue(true);

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/settings/history',
      headers: { 'x-session-id': 'valid_session' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().historyEnabled).toBe(true);
  });
});

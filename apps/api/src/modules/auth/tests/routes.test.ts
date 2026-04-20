import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { getSession, isSessionValid, login, logout } from '../../../scripts/patron-client.js';
import { makeLoginResult, makeSession } from '../../../tests/fixtures.js';
import { buildApp } from '../../../tests/setup.js';

const mockLogin = vi.fn<typeof login>();
const mockLogout = vi.fn<typeof logout>();
const mockGetSession = vi.fn<typeof getSession>();
const mockIsSessionValid = vi.fn<typeof isSessionValid>();

vi.mock('../../../scripts/patron-client.js', () => ({
  login: (...args: unknown[]) => mockLogin(...(args as Parameters<typeof login>)),
  logout: (...args: unknown[]) => mockLogout(...(args as Parameters<typeof logout>)),
  getSession: (...args: unknown[]) => mockGetSession(...(args as Parameters<typeof getSession>)),
  isSessionValid: (...args: unknown[]) =>
    mockIsSessionValid(...(args as Parameters<typeof isSessionValid>)),
  getCheckouts: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
  getHistory: vi
    .fn()
    .mockResolvedValue({
      items: [],
      totalCount: 0,
      hasMore: false,
      offset: 0,
      limit: 15,
      historyEnabled: true,
    }),
  getHolds: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
  isHistoryEnabled: vi.fn().mockResolvedValue(true),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('POST /manga/user/login', () => {
  it('returns 200 on successful login', async () => {
    mockLogin.mockResolvedValue(
      makeLoginResult({
        session: makeSession({ sessionToken: 'sess_abc123', displayName: 'John Doe' }),
      })
    );

    const res = await app.inject({
      method: 'POST',
      url: '/manga/user/login',
      payload: { cardNumber: '12345678', pin: '1234' },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.sessionId).toBe('sess_abc123');
    expect(body.displayName).toBe('John Doe');
  });

  it('returns 401 on failed login', async () => {
    mockLogin.mockResolvedValue(
      makeLoginResult({
        success: false,
        session: undefined,
        error: 'Invalid credentials',
      })
    );

    const res = await app.inject({
      method: 'POST',
      url: '/manga/user/login',
      payload: { cardNumber: 'bad', pin: 'wrong' },
    });
    expect(res.statusCode).toBe(401);

    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when body is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/manga/user/login',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when cardNumber is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/manga/user/login',
      payload: { cardNumber: '', pin: '1234' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /manga/user/logout', () => {
  it('returns 200 on logout', async () => {
    mockLogout.mockResolvedValue(true);

    const res = await app.inject({
      method: 'POST',
      url: '/manga/user/logout',
      headers: { 'x-session-id': 'sess_abc123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 200 even without session header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/manga/user/logout',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /manga/user/session', () => {
  it('returns valid:false when no session header', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/user/session' });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(false);
  });

  it('returns valid:false for expired/invalid session', async () => {
    mockIsSessionValid.mockReturnValue(false);

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/session',
      headers: { 'x-session-id': 'expired_session' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(false);
  });

  it('returns valid:true with user info for valid session', async () => {
    mockIsSessionValid.mockReturnValue(true);
    mockGetSession.mockReturnValue(makeSession({ displayName: 'John Doe' }));

    const res = await app.inject({
      method: 'GET',
      url: '/manga/user/session',
      headers: { 'x-session-id': 'valid_session' },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.displayName).toBe('John Doe');
  });
});

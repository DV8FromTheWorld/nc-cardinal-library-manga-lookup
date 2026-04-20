import { describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../../tests/db.js';

vi.mock('../../../db/index.js', () => ({
  db: createTestDb(),
}));

import { getSession, isSessionValid } from '../../../scripts/patron-client.js';

// Access storeSession/deleteSession indirectly through login/logout
// since they're not exported. We test via the public API.

describe('Session store (DB-backed)', () => {
  it('getSession returns null for nonexistent session', () => {
    expect(getSession('nonexistent')).toBeNull();
  });

  it('isSessionValid returns false for nonexistent session', () => {
    expect(isSessionValid('nonexistent')).toBe(false);
  });

  // Full login/logout flow requires mocking the NC Cardinal HTTP calls,
  // which is covered by the route tests. Here we verify the DB layer
  // works correctly by inserting directly.
  it('stores and retrieves a session via the DB', async () => {
    const { db } = await import('../../../db/index.js');
    const { sessions } = await import('../db/schema.js');

    const sessionId = 'test-session-id';
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    db.insert(sessions)
      .values({
        id: sessionId,
        sessionToken: 'raw-token-123',
        loggedIn: true,
        barcode: '12345678',
        displayName: 'Test User',
        expiresAt,
      })
      .run();

    const session = getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session?.sessionToken).toBe('raw-token-123');
    expect(session?.loggedIn).toBe(true);
    expect(session?.barcode).toBe('12345678');
    expect(session?.displayName).toBe('Test User');

    expect(isSessionValid(sessionId)).toBe(true);
  });

  it('isSessionValid returns false for expired session', async () => {
    const { db } = await import('../../../db/index.js');
    const { sessions } = await import('../db/schema.js');

    const sessionId = 'expired-session';
    const expiresAt = new Date(Date.now() - 60_000); // 1 minute ago

    db.insert(sessions)
      .values({
        id: sessionId,
        sessionToken: 'expired-token',
        loggedIn: true,
        expiresAt,
      })
      .run();

    expect(isSessionValid(sessionId)).toBe(false);
  });
});

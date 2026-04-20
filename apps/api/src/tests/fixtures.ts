/**
 * Test fixture factories.
 *
 * Each factory returns a valid object with sensible defaults.
 * Tests only specify the fields they care about via overrides.
 */

import type { Edition, Series, Volume } from '../entities/types.js';
import type { CatalogRecord } from '../scripts/opensearch-client.js';
import type { LoginResult, PatronSession } from '../scripts/patron-client.js';

const NOW = '2026-01-01T00:00:00.000Z';

export function makeSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 's_test',
    title: 'Test Series',
    mediaType: 'manga',
    externalIds: {},
    volumeIds: [],
    status: 'ongoing',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeVolume(overrides: Partial<Volume> = {}): Volume {
  return {
    id: 'v_test',
    seriesId: 's_test',
    volumeNumber: 1,
    editionIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: 'e_test',
    isbn: '9781234567890',
    format: 'physical',
    language: 'en',
    volumeIds: ['v_test'],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeCatalogRecord(overrides: Partial<CatalogRecord> = {}): CatalogRecord {
  return {
    id: '12345',
    title: 'Test Series Vol 1',
    authors: ['Author'],
    isbns: ['9781234567890'],
    subjects: [],
    libraryHoldings: [],
    ...overrides,
  };
}

export function makeSession(overrides: Partial<PatronSession> = {}): PatronSession {
  return {
    sessionToken: 'sess_test',
    loggedIn: true,
    displayName: 'Test User',
    ...overrides,
  };
}

export function makeLoginResult(overrides: Partial<LoginResult> = {}): LoginResult {
  return {
    success: true,
    session: makeSession(),
    ...overrides,
  };
}

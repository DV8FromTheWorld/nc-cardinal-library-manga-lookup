import { describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../../tests/db.js';

vi.mock('../../../db/index.js', () => ({
  db: createTestDb(),
}));

import {
  addEditionToVolume,
  addVolumeToEdition,
  generateEditionId,
  generateVolumeId,
  getAllSeries,
  getEditionById,
  getEditionByIsbn,
  getEditionsByVolumeId,
  getSeriesById,
  getSeriesByTitle,
  getSeriesByWikipediaId,
  getStoreStats,
  getVolumeById,
  getVolumeBySeriesAndNumber,
  getVolumesBySeriesId,
  normalizeTitle,
  saveEdition,
  saveSeries,
  saveVolume,
} from '../../../entities/store.js';
import type { Edition, Series, Volume } from '../../../entities/types.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: `s_${Math.random().toString(36).slice(2, 8)}`,
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

function makeVolume(overrides: Partial<Volume> = {}): Volume {
  return {
    id: generateVolumeId(),
    seriesId: 's_test',
    volumeNumber: 1,
    editionIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: generateEditionId(),
    isbn: '9781234567890',
    format: 'physical',
    language: 'en',
    volumeIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================================
// Series
// ============================================================================

describe('Series CRUD', () => {
  it('saves and retrieves a series by ID', async () => {
    const s = makeSeries({ id: 's_crud1', title: 'Demon Slayer' });
    await saveSeries(s);

    const retrieved = await getSeriesById('s_crud1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('Demon Slayer');
    expect(retrieved?.mediaType).toBe('manga');
  });

  it('returns null for nonexistent series', async () => {
    expect(await getSeriesById('s_nonexistent')).toBeNull();
  });

  it('looks up series by normalized title', async () => {
    const s = makeSeries({ id: 's_title1', title: 'Demon Slayer (Manga)' });
    await saveSeries(s);

    const retrieved = await getSeriesByTitle('demon slayer');
    expect(retrieved?.id).toBe('s_title1');
  });

  it('looks up series by Wikipedia page ID', async () => {
    const s = makeSeries({
      id: 's_wiki1',
      title: 'One Piece',
      externalIds: { wikipedia: 12345 },
    });
    await saveSeries(s);

    const retrieved = await getSeriesByWikipediaId(12345);
    expect(retrieved?.id).toBe('s_wiki1');
  });

  it('returns null for nonexistent Wikipedia ID', async () => {
    expect(await getSeriesByWikipediaId(99999)).toBeNull();
  });

  it('updates an existing series on save', async () => {
    const s = makeSeries({ id: 's_update1', title: 'Original Title' });
    await saveSeries(s);

    s.title = 'Updated Title';
    s.status = 'completed';
    await saveSeries(s);

    const retrieved = await getSeriesById('s_update1');
    expect(retrieved?.title).toBe('Updated Title');
    expect(retrieved?.status).toBe('completed');
  });

  it('getAllSeries returns all saved series', async () => {
    await saveSeries(makeSeries({ id: 's_all1', title: 'Series A' }));
    await saveSeries(makeSeries({ id: 's_all2', title: 'Series B' }));

    const all = await getAllSeries();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('saves and retrieves related series IDs', async () => {
    await saveSeries(makeSeries({ id: 's_parent' }));
    await saveSeries(makeSeries({ id: 's_related', relatedSeriesIds: ['s_parent'] }));

    // Need to create the parent first for FK, but seriesRelations references both
    // Actually the FK is on series.id, so both must exist
    const retrieved = await getSeriesById('s_related');
    expect(retrieved?.relatedSeriesIds).toContain('s_parent');
  });
});

describe('normalizeTitle', () => {
  it('strips (Manga) suffix', () => {
    expect(normalizeTitle('Demon Slayer (Manga)')).toBe('demonslayer');
  });

  it('strips (Light Novel) suffix', () => {
    expect(normalizeTitle('Ascendance of a Bookworm (Light Novel)')).toBe('ascendanceofabookworm');
  });

  it('lowercases and removes non-alphanumeric', () => {
    expect(normalizeTitle('Spy × Family')).toBe('spyfamily');
  });
});

// ============================================================================
// Volumes
// ============================================================================

describe('Volume CRUD', () => {
  it('saves and retrieves a volume by ID', async () => {
    await saveSeries(makeSeries({ id: 's_vol1' }));
    const v = makeVolume({ id: 'v_crud1', seriesId: 's_vol1', volumeNumber: 1 });
    await saveVolume(v);

    const retrieved = await getVolumeById('v_crud1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.volumeNumber).toBe(1);
    expect(retrieved?.seriesId).toBe('s_vol1');
  });

  it('returns null for nonexistent volume', async () => {
    expect(await getVolumeById('v_nonexistent')).toBeNull();
  });

  it('finds volume by series and number', async () => {
    await saveSeries(makeSeries({ id: 's_vol2' }));
    await saveVolume(makeVolume({ id: 'v_find1', seriesId: 's_vol2', volumeNumber: 3 }));

    const retrieved = await getVolumeBySeriesAndNumber('s_vol2', 3);
    expect(retrieved?.id).toBe('v_find1');
  });

  it('returns null for nonexistent series+number combo', async () => {
    expect(await getVolumeBySeriesAndNumber('s_vol2', 999)).toBeNull();
  });

  it('gets all volumes for a series in order', async () => {
    await saveSeries(makeSeries({ id: 's_vol3' }));
    await saveVolume(makeVolume({ id: 'v_ord3', seriesId: 's_vol3', volumeNumber: 3 }));
    await saveVolume(makeVolume({ id: 'v_ord1', seriesId: 's_vol3', volumeNumber: 1 }));
    await saveVolume(makeVolume({ id: 'v_ord2', seriesId: 's_vol3', volumeNumber: 2 }));

    const vols = await getVolumesBySeriesId('s_vol3');
    expect(vols).toHaveLength(3);
    expect(vols[0]?.volumeNumber).toBe(1);
    expect(vols[1]?.volumeNumber).toBe(2);
    expect(vols[2]?.volumeNumber).toBe(3);
  });

  it('returns empty array for series with no volumes', async () => {
    expect(await getVolumesBySeriesId('s_nonexistent')).toEqual([]);
  });
});

// ============================================================================
// Editions
// ============================================================================

describe('Edition CRUD', () => {
  it('saves and retrieves an edition by ID', async () => {
    const e = makeEdition({ id: 'e_crud1', isbn: '9780000000001' });
    await saveEdition(e);

    const retrieved = await getEditionById('e_crud1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.isbn).toBe('9780000000001');
  });

  it('returns null for nonexistent edition', async () => {
    expect(await getEditionById('e_nonexistent')).toBeNull();
  });

  it('looks up edition by ISBN', async () => {
    await saveEdition(makeEdition({ id: 'e_isbn1', isbn: '9780000000002' }));

    const retrieved = await getEditionByIsbn('9780000000002');
    expect(retrieved?.id).toBe('e_isbn1');
  });

  it('returns null for nonexistent ISBN', async () => {
    expect(await getEditionByIsbn('0000000000')).toBeNull();
  });

  it('updates an existing edition on save', async () => {
    await saveEdition(makeEdition({ id: 'e_upd1', isbn: '9780000000003', format: 'physical' }));

    const updated = makeEdition({ id: 'e_upd1', isbn: '9780000000003', format: 'digital' });
    await saveEdition(updated);

    const retrieved = await getEditionById('e_upd1');
    expect(retrieved?.format).toBe('digital');
  });
});

// ============================================================================
// Join table: edition <-> volume links
// ============================================================================

describe('Edition-Volume linking', () => {
  it('links a volume to an edition via saveEdition', async () => {
    await saveSeries(makeSeries({ id: 's_link1' }));
    await saveVolume(makeVolume({ id: 'v_link1', seriesId: 's_link1' }));
    await saveEdition(
      makeEdition({ id: 'e_link1', isbn: '9780000000010', volumeIds: ['v_link1'] })
    );

    const edition = await getEditionById('e_link1');
    expect(edition?.volumeIds).toContain('v_link1');

    // Verify the link is visible from the volume side too
    const editions = await getEditionsByVolumeId('v_link1');
    expect(editions).toHaveLength(1);
    expect(editions[0]?.id).toBe('e_link1');
  });

  it('addVolumeToEdition creates the link', async () => {
    await saveSeries(makeSeries({ id: 's_link2' }));
    await saveVolume(makeVolume({ id: 'v_link2', seriesId: 's_link2' }));
    await saveEdition(makeEdition({ id: 'e_link2', isbn: '9780000000011' }));

    await addVolumeToEdition('e_link2', 'v_link2');

    const edition = await getEditionById('e_link2');
    expect(edition?.volumeIds).toContain('v_link2');
  });

  it('addEditionToVolume creates the link', async () => {
    await saveSeries(makeSeries({ id: 's_link3' }));
    await saveVolume(makeVolume({ id: 'v_link3', seriesId: 's_link3' }));
    await saveEdition(makeEdition({ id: 'e_link3', isbn: '9780000000012' }));

    await addEditionToVolume('v_link3', 'e_link3');

    const retrieved = await getVolumeById('v_link3');
    expect(retrieved?.editionIds).toContain('e_link3');
  });

  it('throws when adding to nonexistent edition', async () => {
    await expect(addVolumeToEdition('e_nonexistent', 'v_link1')).rejects.toThrow(
      'Edition not found'
    );
  });

  it('throws when adding to nonexistent volume', async () => {
    await expect(addEditionToVolume('v_nonexistent', 'e_link1')).rejects.toThrow(
      'Volume not found'
    );
  });
});

// ============================================================================
// Stats
// ============================================================================

describe('getStoreStats', () => {
  it('returns counts for all entity types', async () => {
    await saveSeries(makeSeries({ id: 's_stats1', externalIds: { wikipedia: 111 } }));
    await saveVolume(makeVolume({ id: 'v_stats1', seriesId: 's_stats1' }));
    await saveEdition(makeEdition({ id: 'e_stats1', isbn: '9780000000020' }));

    const stats = await getStoreStats();
    expect(stats.seriesCount).toBeGreaterThanOrEqual(1);
    expect(stats.volumeCount).toBeGreaterThanOrEqual(1);
    expect(stats.editionCount).toBeGreaterThanOrEqual(1);
    expect(stats.wikipediaIndexCount).toBeGreaterThanOrEqual(1);
    expect(stats.titleIndexCount).toBeGreaterThanOrEqual(1);
  });
});

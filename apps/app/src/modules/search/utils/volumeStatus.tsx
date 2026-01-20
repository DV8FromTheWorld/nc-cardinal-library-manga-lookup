/**
 * Volume status utilities.
 * Re-exports from shared library and adds additional helpers.
 */

import {
  computeCopyTotals,
  deriveEditionStatus,
  formatCopyTotalsDisplay,
  getFullVolumeDisplayInfo,
  getStackRankedStatus,
  getVolumeDisplayInfo,
  getVolumeDisplayStatus,
  mergeCopyTotals,
  type VolumeDisplayInfo,
} from '@repo/shared';

import type { CopyTotals, Edition, LibraryHoldings, Volume } from '../types';

// Re-export shared functions
export {
  computeCopyTotals,
  deriveEditionStatus,
  formatCopyTotalsDisplay,
  getFullVolumeDisplayInfo,
  getStackRankedStatus,
  getVolumeDisplayInfo,
  getVolumeDisplayStatus,
  mergeCopyTotals,
};
export type { VolumeDisplayInfo };

// ============================================================================
// ISBN and Title Utilities
// ============================================================================

/**
 * Get the primary ISBN from editions array.
 * Primary = first English physical edition, falling back to English digital.
 */
export function getPrimaryIsbn(editions: Edition[]): string | undefined {
  const englishPhysical = editions.find((e) => e.language === 'en' && e.format === 'physical');
  const englishDigital = editions.find((e) => e.language === 'en' && e.format === 'digital');
  return englishPhysical?.isbn ?? englishDigital?.isbn;
}

/**
 * Get all ISBNs from editions array.
 */
export function getAllIsbns(editions: Edition[]): string[] {
  return editions.map((e) => e.isbn);
}

/**
 * Get the display title for a volume.
 * Format: "Series Title, Vol. N" or "Series Title, Vol. N: Subtitle"
 */
export function getDisplayTitle(volume: Volume): string {
  const base = `${volume.seriesInfo.title}, Vol. ${volume.volumeNumber}`;
  return volume.title != null ? `${base}: ${volume.title}` : base;
}

// ============================================================================
// Volume Display Utilities (using shared functions)
// ============================================================================

/**
 * Get display info for a volume for list views.
 * Uses copyTotals and catalogUrl from the API response.
 */
export function getVolumeListDisplayInfo(volume: Volume): VolumeDisplayInfo {
  return getFullVolumeDisplayInfo(volume.editions, volume.copyTotals, volume.catalogUrl);
}

/**
 * Get display info for a volume for detail views.
 * Derives copyTotals from libraryHoldings.
 */
export function getVolumeDetailDisplayInfo(volume: Volume): VolumeDisplayInfo {
  const copyTotals = getVolumeCopyTotals(volume);
  return getFullVolumeDisplayInfo(volume.editions, copyTotals, volume.catalogUrl);
}

/**
 * Compute CopyTotals from a volume's libraryHoldings.
 * For use in detail views where copyTotals isn't pre-computed.
 */
export function getVolumeCopyTotals(volume: Volume): CopyTotals | undefined {
  if (volume.libraryHoldings == null || volume.libraryHoldings.length === 0) {
    return volume.copyTotals; // Fall back to pre-computed if available
  }

  const totals = volume.libraryHoldings.map((lh) => computeCopyTotals(lh.copies));
  return mergeCopyTotals(totals);
}

/**
 * Get CopyTotals for a single library from its holdings.
 */
export function getLibraryCopyTotals(library: LibraryHoldings): CopyTotals {
  return computeCopyTotals(library.copies);
}

/**
 * Format a date string for display (e.g., "Mar 15, 2026")
 */
export function formatReleaseDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get the English release date for display purposes.
 */
export function getEnglishReleaseDate(editions: Edition[]): string | undefined {
  const englishPhysical = editions.find((e) => e.language === 'en' && e.format === 'physical');
  const englishDigital = editions.find((e) => e.language === 'en' && e.format === 'digital');

  // Prefer physical release date
  return englishPhysical?.releaseDate ?? englishDigital?.releaseDate;
}

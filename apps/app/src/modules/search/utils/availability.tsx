/**
 * Shared availability utilities for display logic.
 * Used by both web and native components.
 */

import type { VolumeAvailability, Holding } from '../types';

/**
 * Calculate availability percentage for progress bars.
 */
export function getAvailabilityPercent(available: number, total: number): number {
  return total > 0 ? Math.round((available / total) * 100) : 0;
}

/**
 * Status type for styling availability indicators.
 */
export type AvailabilityStatusType = 'local' | 'available' | 'unavailable' | 'not-in-catalog';

/**
 * Information needed to display availability status.
 */
export interface AvailabilityDisplayInfo {
  statusType: AvailabilityStatusType;
  statusText: string;
}

/**
 * Get display information for volume availability.
 * Returns status type (for styling) and status text.
 */
export function getAvailabilityDisplayInfo(
  availability: VolumeAvailability | undefined
): AvailabilityDisplayInfo {
  // Not in catalog
  if (availability?.notInCatalog) {
    return { statusType: 'not-in-catalog', statusText: 'Not in catalog' };
  }

  const isAvailable = availability?.available ?? false;
  const hasLocalCopies = (availability?.localCopies ?? 0) > 0;
  const localAvailable = availability?.localAvailable ?? 0;
  const remoteAvailable = availability?.remoteAvailable ?? 0;

  // Available
  if (isAvailable) {
    // Has local copies
    if (hasLocalCopies) {
      const statusType: AvailabilityStatusType = localAvailable > 0 ? 'local' : 'available';
      let statusText: string;

      if (localAvailable > 0) {
        statusText = `${localAvailable} local`;
        if (remoteAvailable > 0) {
          statusText += ` · ${remoteAvailable} remote`;
        }
      } else {
        statusText = 'Local checked out';
        if (remoteAvailable > 0) {
          statusText += ` · ${remoteAvailable} remote`;
        }
      }

      return { statusType, statusText };
    }

    // Only remote copies
    return {
      statusType: 'available',
      statusText: `${remoteAvailable} remote`,
    };
  }

  // All checked out
  return { statusType: 'unavailable', statusText: 'All checked out' };
}

/**
 * Group holdings by library name.
 * Returns a record mapping library name to array of holdings.
 */
export function groupHoldingsByLibrary(holdings: Holding[]): Record<string, Holding[]> {
  return holdings.reduce<Record<string, Holding[]>>((acc, holding) => {
    const key = holding.libraryName;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(holding);
    return acc;
  }, {});
}

/**
 * Get count of available copies from a group of holdings.
 */
export function getAvailableCount(holdings: Holding[]): number {
  return holdings.filter((h) => h.available).length;
}

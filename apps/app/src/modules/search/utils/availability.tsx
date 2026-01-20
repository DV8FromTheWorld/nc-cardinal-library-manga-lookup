/**
 * Shared availability utilities for display logic.
 * Used by both web and native components.
 *
 * Most availability logic is now in @repo/shared.
 * This file contains frontend-specific display helpers.
 */

import { computeCopyTotals, formatCopyTotalsDisplay, getStackRankedStatus } from '@repo/shared';

import type { CopyTotals, LibraryHoldings } from '../types';

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
 * Get display information for volume availability from CopyTotals.
 * Returns status type (for styling) and status text.
 */
export function getAvailabilityDisplayInfo(
  copyTotals: CopyTotals | undefined,
  catalogUrl: string | undefined
): AvailabilityDisplayInfo {
  // Not in catalog
  if (copyTotals == null) {
    return { statusType: 'not-in-catalog', statusText: 'Not in catalog' };
  }

  // Digital-only (in catalog but no physical copies)
  if (copyTotals.total === 0 && catalogUrl != null) {
    return { statusType: 'available', statusText: 'Digital only' };
  }

  // No copies at all
  if (copyTotals.total === 0) {
    return { statusType: 'not-in-catalog', statusText: 'Not in catalog' };
  }

  // Get stack-ranked status
  const status = getStackRankedStatus(copyTotals);

  if (status === 'available') {
    return {
      statusType: 'available',
      statusText: `${copyTotals.available} available`,
    };
  }

  if (status === 'checked_out') {
    return {
      statusType: 'unavailable',
      statusText: `All checked out (${copyTotals.checkedOut} copies)`,
    };
  }

  if (status === 'on_order') {
    return {
      statusType: 'unavailable',
      statusText: `On order (${copyTotals.onOrder} copies)`,
    };
  }

  if (status === 'in_transit') {
    return {
      statusType: 'unavailable',
      statusText: `In transit (${copyTotals.inTransit} copies)`,
    };
  }

  if (status === 'on_hold') {
    return {
      statusType: 'unavailable',
      statusText: `On hold (${copyTotals.onHold} copies)`,
    };
  }

  // Unavailable fallback
  return { statusType: 'unavailable', statusText: 'Unavailable' };
}

/**
 * Get display text for a library's availability from its CopyTotals.
 */
export function getLibraryAvailabilityText(libraryTotals: CopyTotals): string {
  return formatCopyTotalsDisplay(libraryTotals);
}

/**
 * Get CopyTotals for a single library from its holdings.
 */
export function getLibraryCopyTotals(library: LibraryHoldings): CopyTotals {
  return computeCopyTotals(library.copies);
}

/**
 * Get status type for a library (for styling).
 */
export function getLibraryStatusType(libraryTotals: CopyTotals): AvailabilityStatusType {
  if (libraryTotals.total === 0) {
    return 'not-in-catalog';
  }
  if (libraryTotals.available > 0) {
    return 'available';
  }
  return 'unavailable';
}

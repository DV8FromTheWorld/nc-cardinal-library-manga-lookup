// ============================================================================
// Copy Status Types
// ============================================================================

/**
 * Status category for a single physical copy in the library system.
 * Used to categorize raw status strings from NC Cardinal.
 */
export type CopyStatusCategory =
  | 'available' // On shelf, ready to borrow
  | 'checked_out' // Borrowed by someone
  | 'in_transit' // Moving between libraries
  | 'on_hold' // Reserved/held for someone
  | 'on_order' // Ordered but not yet received
  | 'unavailable'; // Lost, missing, repair, withdrawn, etc.

/**
 * Aggregated copy counts by status category.
 * Can represent totals for a single library or an entire volume.
 */
export interface CopyTotals {
  available: number;
  checkedOut: number;
  inTransit: number;
  onHold: number;
  onOrder: number;
  unavailable: number;
  total: number;
}

/**
 * Minimal interface for computing copy totals.
 * Any object with statusCategory can be used.
 */
export interface CopyWithStatus {
  statusCategory: CopyStatusCategory;
}

// ============================================================================
// Copy Totals Functions
// ============================================================================

/**
 * Compute copy totals from an array of copies.
 */
export function computeCopyTotals(copies: CopyWithStatus[]): CopyTotals {
  const totals: CopyTotals = {
    available: 0,
    checkedOut: 0,
    inTransit: 0,
    onHold: 0,
    onOrder: 0,
    unavailable: 0,
    total: copies.length,
  };

  for (const copy of copies) {
    switch (copy.statusCategory) {
      case 'available':
        totals.available++;
        break;
      case 'checked_out':
        totals.checkedOut++;
        break;
      case 'in_transit':
        totals.inTransit++;
        break;
      case 'on_hold':
        totals.onHold++;
        break;
      case 'on_order':
        totals.onOrder++;
        break;
      case 'unavailable':
        totals.unavailable++;
        break;
    }
  }

  return totals;
}

/**
 * Merge multiple CopyTotals into one (for aggregation across libraries).
 */
export function mergeCopyTotals(totals: CopyTotals[]): CopyTotals {
  return totals.reduce(
    (acc, t) => ({
      available: acc.available + t.available,
      checkedOut: acc.checkedOut + t.checkedOut,
      inTransit: acc.inTransit + t.inTransit,
      onHold: acc.onHold + t.onHold,
      onOrder: acc.onOrder + t.onOrder,
      unavailable: acc.unavailable + t.unavailable,
      total: acc.total + t.total,
    }),
    {
      available: 0,
      checkedOut: 0,
      inTransit: 0,
      onHold: 0,
      onOrder: 0,
      unavailable: 0,
      total: 0,
    }
  );
}

/**
 * Get the "best" status from totals using stack-ranked priority.
 * Priority: available > checked_out > in_transit > on_hold > on_order > unavailable
 *
 * Returns null if total is 0 (no copies).
 */
export function getStackRankedStatus(totals: CopyTotals): CopyStatusCategory | null {
  if (totals.total === 0) return null;
  if (totals.available > 0) return 'available';
  if (totals.checkedOut > 0) return 'checked_out';
  if (totals.inTransit > 0) return 'in_transit';
  if (totals.onHold > 0) return 'on_hold';
  if (totals.onOrder > 0) return 'on_order';
  return 'unavailable';
}

/**
 * Format copy totals for display.
 * Returns a string like "2 available, 1 checked out".
 */
export function formatCopyTotalsDisplay(totals: CopyTotals): string {
  const parts: string[] = [];
  if (totals.available > 0) parts.push(`${totals.available} available`);
  if (totals.checkedOut > 0) parts.push(`${totals.checkedOut} checked out`);
  if (totals.inTransit > 0) parts.push(`${totals.inTransit} in transit`);
  if (totals.onHold > 0) parts.push(`${totals.onHold} on hold`);
  if (totals.onOrder > 0) parts.push(`${totals.onOrder} on order`);
  if (totals.unavailable > 0) parts.push(`${totals.unavailable} unavailable`);
  return parts.length === 0 ? 'No copies' : parts.join(', ');
}

// ============================================================================
// Edition Status Types
// ============================================================================

/**
 * Edition for determining volume status.
 * Minimal interface - only needs format, language, and optional releaseDate.
 */
export interface EditionInfo {
  format: 'physical' | 'digital';
  language: string;
  releaseDate?: string | undefined;
}

/**
 * Edition-based status derived from the editions array.
 * Answers: "Does an English physical edition exist?"
 */
export type EditionStatus =
  | 'japan_only' // No English edition exists
  | 'upcoming' // English exists but release date in future
  | 'digital_only' // Only digital English available (no physical ever published)
  | 'released'; // Physical English released

/**
 * Derive edition status from editions array.
 */
export function deriveEditionStatus(editions: EditionInfo[]): EditionStatus {
  const englishEditions = editions.filter((e) => e.language === 'en');

  // No English edition at all
  if (englishEditions.length === 0) {
    return 'japan_only';
  }

  const physicalEnglish = englishEditions.find((e) => e.format === 'physical');
  const digitalEnglish = englishEditions.find((e) => e.format === 'digital');

  // Check if physical English is upcoming
  if (physicalEnglish?.releaseDate != null) {
    const now = new Date();
    const releaseDate = new Date(physicalEnglish.releaseDate);
    if (releaseDate > now) {
      return 'upcoming';
    }
  }

  // Has physical English that's released
  if (physicalEnglish != null) {
    return 'released';
  }

  // Has digital but no physical
  if (digitalEnglish != null) {
    return 'digital_only';
  }

  // Fallback (shouldn't happen if englishEditions.length > 0)
  return 'japan_only';
}

// ============================================================================
// Volume Display Status Types
// ============================================================================

/**
 * Unified display status for volumes in list views and headers.
 * Combines edition status, catalog presence, and library availability.
 */
export type VolumeDisplayStatus =
  // Edition-based (checked first)
  | 'japan_only'
  | 'upcoming'
  | 'edition_digital_only' // No physical English ever published
  // Catalog presence
  | 'not_in_catalog'
  | 'library_digital_only' // In catalog but only e-book copies
  // Library availability (if released + in catalog with physical copies)
  | 'available'
  | 'checked_out'
  | 'in_transit'
  | 'on_hold'
  | 'on_order'
  | 'unavailable';

/**
 * Display info for a volume status (icon and label).
 */
export interface VolumeDisplayInfo {
  icon: string;
  label: string;
  sublabel?: string | undefined;
}

/**
 * Get unified display status for a volume.
 * Used for series list, search results, and volume detail header.
 *
 * @param editions - Array of edition info for the volume
 * @param copyTotals - Aggregated copy totals (undefined if not in catalog)
 * @param catalogUrl - URL to catalog entry (present if in catalog)
 */
export function getVolumeDisplayStatus(
  editions: EditionInfo[],
  copyTotals: CopyTotals | undefined,
  catalogUrl: string | undefined
): VolumeDisplayStatus {
  // 1. Edition checks
  const editionStatus = deriveEditionStatus(editions);
  if (editionStatus === 'japan_only') return 'japan_only';
  if (editionStatus === 'upcoming') return 'upcoming';
  if (editionStatus === 'digital_only') return 'edition_digital_only';

  // 2. Not in catalog (no copyTotals means not searched or not found)
  if (copyTotals == null) return 'not_in_catalog';

  // 3. In catalog but digital-only (no physical copies in library)
  if (copyTotals.total === 0 && catalogUrl != null) return 'library_digital_only';

  // 4. Not in catalog (no copies, no URL)
  if (copyTotals.total === 0) return 'not_in_catalog';

  // 5. Stack-ranked library availability
  const stackedStatus = getStackRankedStatus(copyTotals);
  // stackedStatus won't be null here since total > 0
  return stackedStatus as VolumeDisplayStatus;
}

/**
 * Map VolumeDisplayStatus to icon and label for UI display.
 */
export function getVolumeDisplayInfo(
  status: VolumeDisplayStatus,
  copyTotals?: CopyTotals
): VolumeDisplayInfo {
  switch (status) {
    // Edition-based
    case 'japan_only':
      return { icon: '🇯🇵', label: 'Japan only' };
    case 'upcoming':
      return { icon: '⏳', label: 'Coming soon' };
    case 'edition_digital_only':
      return { icon: '📱', label: 'Digital only' };

    // Catalog presence
    case 'not_in_catalog':
      return { icon: '⚪', label: 'Not in library' };
    case 'library_digital_only':
      return { icon: '📱', label: 'Digital only' };

    // Library availability
    case 'available':
      return {
        icon: '✅',
        label: copyTotals != null ? `${copyTotals.available} available` : 'Available',
      };
    case 'checked_out':
      return {
        icon: '🟡',
        label: 'Checked out',
        sublabel: copyTotals?.checkedOut != null ? `${copyTotals.checkedOut} copies` : undefined,
      };
    case 'in_transit':
      return { icon: '🚚', label: 'In transit' };
    case 'on_hold':
      return { icon: '📋', label: 'On hold' };
    case 'on_order':
      return { icon: '📦', label: 'On order' };
    case 'unavailable':
      return { icon: '❌', label: 'Unavailable' };
  }
}

/**
 * Get release date string for display (for upcoming volumes).
 */
export function getEnglishReleaseDate(editions: EditionInfo[]): string | undefined {
  const physicalEnglish = editions.find((e) => e.language === 'en' && e.format === 'physical');
  return physicalEnglish?.releaseDate;
}

/**
 * Format a release date for display.
 */
export function formatReleaseDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Get full volume display info including release date for upcoming volumes.
 */
export function getFullVolumeDisplayInfo(
  editions: EditionInfo[],
  copyTotals: CopyTotals | undefined,
  catalogUrl: string | undefined
): VolumeDisplayInfo {
  const status = getVolumeDisplayStatus(editions, copyTotals, catalogUrl);

  // Special handling for upcoming - include release date
  if (status === 'upcoming') {
    const releaseDate = getEnglishReleaseDate(editions);
    return {
      icon: '⏳',
      label: releaseDate != null ? `Releases ${formatReleaseDate(releaseDate)}` : 'Coming soon',
    };
  }

  return getVolumeDisplayInfo(status, copyTotals);
}

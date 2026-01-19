/**
 * Volume status utilities.
 * Derives volume status from editions array - computed client-side, not from API.
 */

import type { Edition, VolumeInfo } from '../types';
import { VolumeStatus } from '../types';

/**
 * Derive volume status from editions array.
 * This is computed client-side, not sent from API.
 */
export function deriveVolumeStatus(editions: Edition[]): VolumeStatus {
  const englishEditions = editions.filter(e => e.language === 'en');
  
  // No English edition at all
  if (englishEditions.length === 0) {
    return VolumeStatus.JapanOnly;
  }
  
  const physicalEnglish = englishEditions.find(e => e.format === 'physical');
  const digitalEnglish = englishEditions.find(e => e.format === 'digital');
  
  // Check if physical release date is in the future
  const now = new Date();
  if (physicalEnglish?.releaseDate != null) {
    const releaseDate = new Date(physicalEnglish.releaseDate);
    if (releaseDate > now) {
      return VolumeStatus.Upcoming;
    }
  }
  
  // Has digital but no physical (or physical not released yet)
  if (!physicalEnglish && digitalEnglish) {
    return VolumeStatus.DigitalOnly;
  }
  
  return VolumeStatus.Released;
}

/**
 * Get the English release date for display purposes.
 */
export function getEnglishReleaseDate(editions: Edition[]): string | undefined {
  const englishPhysical = editions.find(e => e.language === 'en' && e.format === 'physical');
  const englishDigital = editions.find(e => e.language === 'en' && e.format === 'digital');
  
  // Prefer physical release date
  return englishPhysical?.releaseDate ?? englishDigital?.releaseDate;
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

export interface VolumeDisplayInfo {
  icon: string;
  label: string;
  sublabel?: string | undefined;
}

/**
 * Get display info for a volume by deriving status from editions + availability.
 */
export function getVolumeStatusDisplay(volume: VolumeInfo): VolumeDisplayInfo {
  const status = deriveVolumeStatus(volume.editions);
  
  // Layer 1: Does English edition exist?
  if (status === VolumeStatus.JapanOnly) {
    return { icon: '🇯🇵', label: 'Japan only' };
  }
  
  // Layer 2: Is it released yet?
  if (status === VolumeStatus.Upcoming) {
    const releaseDate = getEnglishReleaseDate(volume.editions);
    return { 
      icon: '⏳', 
      label: releaseDate != null ? `Releases ${formatReleaseDate(releaseDate)}` : 'Coming soon'
    };
  }
  
  if (status === VolumeStatus.DigitalOnly) {
    return { icon: '📱', label: 'Digital only' };
  }
  
  // Layer 3: Is it in the library?
  if (!volume.availability || volume.availability.notInCatalog) {
    return { icon: '⚪', label: 'Not in library' };
  }
  
  // Layer 3.5: Has physical copies?
  // A book can be in the catalog (has a record) but have 0 physical copies
  // This typically means it's digital-only (e.g., available via hoopla)
  if (volume.availability.totalCopies === 0) {
    return { icon: '📱', label: 'Digital only' };
  }
  
  // Layer 4: Is it available?
  if (volume.availability.availableCopies > 0) {
    return { 
      icon: '✅', 
      label: `${volume.availability.availableCopies} available`,
      sublabel: volume.availability.libraries?.[0]
    };
  }
  
  if (volume.availability.onOrderCopies != null && volume.availability.onOrderCopies > 0) {
    return { icon: '📦', label: 'On order' };
  }
  
  return { 
    icon: '🟡', 
    label: 'Checked out',
    sublabel: volume.availability.checkedOutCopies != null && volume.availability.checkedOutCopies > 0 ? `${volume.availability.checkedOutCopies} copies` : undefined
  };
}

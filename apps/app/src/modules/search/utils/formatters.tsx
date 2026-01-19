/**
 * Shared formatting utilities for display text.
 * Used by both web and native components.
 */

/**
 * Clean up book/manga title for display.
 * Removes [manga] tags and trailing slashes from catalog titles.
 */
export function cleanDisplayTitle(title: string): string {
  return title.replace(/\[manga\]/gi, '').replace(/\s+\/\s*$/, '').trim();
}

/**
 * Format author name for display.
 * Handles "Last, First" format and removes trailing periods.
 */
export function formatAuthorName(author: string): string {
  return author.split(',').slice(0, 2).join(', ').replace(/\.$/, '');
}

/**
 * Convert ISBN-13 to ISBN-10.
 * Only works for ISBN-13s starting with "978" prefix.
 * Returns null for "979" prefix ISBNs (no ISBN-10 equivalent exists).
 */
export function convertISBN13to10(isbn13: string): string | null {
  // Clean the ISBN (remove hyphens/spaces)
  const clean = isbn13.replace(/[-\s]/g, '');
  
  // Must be 13 digits and start with 978
  if (clean.length !== 13 || !clean.startsWith('978')) {
    return null;
  }
  
  // Take the 9 digits after "978" (excluding ISBN-13 check digit)
  const base = clean.slice(3, 12);
  
  // Calculate ISBN-10 check digit using modulo-11 algorithm
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(base[i] ?? '0', 10) * (10 - i);
  }
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? '0' : remainder === 1 ? 'X' : String(11 - remainder);
  
  return base + checkDigit;
}

/**
 * Get the best ISBN for Amazon from a list of ISBNs.
 * Prefers English ISBNs (starting with 9781 for US, 9780 for UK) over Japanese (9784).
 */
export function getBestIsbnForAmazon(isbns: string[]): string | undefined {
  if (isbns.length === 0) return undefined;
  
  // Clean all ISBNs first
  const cleaned = isbns.map(isbn => isbn.replace(/[-\s]/g, ''));
  
  // Priority order: US English (9781), UK English (9780), any other 978, then first ISBN
  const usIsbn = cleaned.find(isbn => isbn.startsWith('9781'));
  if (usIsbn != null) return usIsbn;
  
  const ukIsbn = cleaned.find(isbn => isbn.startsWith('9780'));
  if (ukIsbn != null) return ukIsbn;
  
  // Any 978 prefix that isn't Japanese (9784)
  const otherEnglish = cleaned.find(isbn => isbn.startsWith('978') && !isbn.startsWith('9784'));
  if (otherEnglish != null) return otherEnglish;
  
  // Fall back to first ISBN
  return cleaned[0];
}

/**
 * Get the best Amazon URL for a given ISBN.
 * Uses direct /dp/ link for convertible ISBN-13s, falls back to search for others.
 */
export function getAmazonUrl(isbn: string): string {
  const isbn10 = convertISBN13to10(isbn);
  
  if (isbn10 != null) {
    // Direct product page link (works with ISBN-10/ASIN)
    return `https://www.amazon.com/dp/${isbn10}`;
  }
  
  // Fall back to search for 979-prefix or invalid ISBNs
  return `https://www.amazon.com/s?k=${isbn}`;
}

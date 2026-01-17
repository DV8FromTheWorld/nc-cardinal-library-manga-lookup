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

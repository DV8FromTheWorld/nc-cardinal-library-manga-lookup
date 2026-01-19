/**
 * Search suggestions dropdown component for web.
 *
 * Features:
 * - Shows suggestions with cover thumbnails
 * - Keyboard navigation (arrow keys, enter)
 * - Recent searches section
 * - Format badge (Manga/Novel)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Text } from '../../../design/components/Text/web/Text';
import type { SuggestionItem } from '../types';
import styles from './SearchSuggestions.module.css';

export interface SearchSuggestionsProps {
  /** Suggestions to display */
  suggestions: SuggestionItem[];
  /** Whether suggestions are loading */
  isLoading: boolean;
  /** Recent searches to display when query is empty */
  recentSearches: string[];
  /** Whether to show the dropdown */
  isOpen: boolean;
  /** Current query (empty shows recent searches) */
  query: string;
  /** Called when a suggestion is selected */
  onSelect: (title: string) => void;
  /** Called when a recent search is selected */
  onSelectRecent: (query: string) => void;
  /** Called when a recent search is removed */
  onRemoveRecent: (query: string) => void;
  /** Called when dropdown should close */
  onClose: () => void;
}

export function SearchSuggestions({
  suggestions,
  isLoading,
  recentSearches,
  isOpen,
  query,
  onSelect,
  onSelectRecent,
  onRemoveRecent,
  onClose,
}: SearchSuggestionsProps): JSX.Element | null {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Determine what to show
  const showRecent = query.trim() === '' && recentSearches.length > 0;
  const showSuggestions = query.trim().length > 0 && (suggestions.length > 0 || isLoading);
  const hasContent = showRecent || showSuggestions;

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions, query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !hasContent) return;

      const items = showRecent ? recentSearches : suggestions;
      const maxIndex = items.length - 1;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
          break;
        case 'Enter':
          if (highlightedIndex >= 0 && highlightedIndex <= maxIndex) {
            e.preventDefault();
            if (showRecent) {
              const recent = recentSearches[highlightedIndex];
              if (recent != null) onSelectRecent(recent);
            } else {
              const suggestion = suggestions[highlightedIndex];
              if (suggestion != null) onSelect(suggestion.title);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [
      isOpen,
      hasContent,
      showRecent,
      recentSearches,
      suggestions,
      highlightedIndex,
      onSelect,
      onSelectRecent,
      onClose,
    ]
  );

  // Attach keyboard listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  if (!isOpen || !hasContent) {
    return null;
  }

  // Format label helper
  const getFormatLabel = (format: string) => {
    switch (format) {
      case 'NOVEL':
        return 'Novel';
      case 'ONE_SHOT':
        return 'One-Shot';
      default:
        return 'Manga';
    }
  };

  return (
    <div className={styles.dropdown} ref={listRef}>
      {/* Recent Searches */}
      {showRecent && (
        <>
          <div className={styles.sectionHeader}>
            <Text variant="text-xs/semibold" color="text-muted">
              Recent Searches
            </Text>
          </div>
          {recentSearches.map((search, index) => (
            <button
              key={search}
              type="button"
              className={`${styles.recentItem} ${index === highlightedIndex ? styles.highlighted : ''}`}
              onClick={() => onSelectRecent(search)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span className={styles.recentIcon}>🕐</span>
              <Text variant="text-sm/normal" className={styles.recentText}>
                {search}
              </Text>
              <button
                type="button"
                className={styles.removeButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveRecent(search);
                }}
                aria-label={`Remove ${search} from recent searches`}
              >
                ×
              </button>
            </button>
          ))}
        </>
      )}

      {/* Suggestions */}
      {showSuggestions && (
        <>
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.anilistId}
              type="button"
              className={`${styles.suggestionItem} ${index === highlightedIndex ? styles.highlighted : ''}`}
              onClick={() => onSelect(suggestion.title)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className={styles.coverContainer}>
                {suggestion.coverUrl != null ? (
                  <img src={suggestion.coverUrl} alt="" className={styles.cover} loading="lazy" />
                ) : (
                  <div className={styles.coverPlaceholder}>📚</div>
                )}
              </div>
              <div className={styles.suggestionInfo}>
                <Text variant="text-sm/semibold" className={styles.suggestionTitle}>
                  {suggestion.title}
                </Text>
                {suggestion.title !== suggestion.titleRomaji && (
                  <Text
                    variant="text-xs/normal"
                    color="text-muted"
                    className={styles.suggestionRomaji}
                  >
                    {suggestion.titleRomaji}
                  </Text>
                )}
                <div className={styles.suggestionMeta}>
                  <span
                    className={`${styles.formatBadge} ${styles[suggestion.format.toLowerCase()]}`}
                  >
                    {getFormatLabel(suggestion.format)}
                  </span>
                  {suggestion.volumes != null && suggestion.volumes > 0 ? (
                    <Text variant="text-xs/normal" color="text-muted">
                      {suggestion.volumes} vol{suggestion.volumes !== 1 ? 's' : ''}
                    </Text>
                  ) : null}
                </div>
              </div>
            </button>
          ))}

          {/* Loading indicator */}
          {isLoading && suggestions.length === 0 && (
            <div className={styles.loadingContainer}>
              <span className={styles.spinner} />
              <Text variant="text-sm/normal" color="text-muted">
                Searching...
              </Text>
            </div>
          )}

          {/* Loading more indicator */}
          {isLoading && suggestions.length > 0 && (
            <div className={styles.loadingMore}>
              <span className={styles.spinnerSmall} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

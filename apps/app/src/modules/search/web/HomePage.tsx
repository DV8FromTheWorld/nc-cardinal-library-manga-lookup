/**
 * Home page component for web - shows search input and recommendations.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAutocomplete } from '../hooks/useAutocomplete';
import { useRecommendations } from '../hooks/useRecommendations';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { Text } from '../../../design/components/Text/web/Text';
import { Heading } from '../../../design/components/Heading/web/Heading';
import { LoginModal } from '../../login/web/LoginModal';
import { UserMenu } from '../../login/web/UserMenu';
import { SearchSuggestions } from './SearchSuggestions';
import type { SuggestionItem } from '../types';
import styles from './HomePage.module.css';

export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Home library for local/remote availability
  const { homeLibrary, setHomeLibrary, libraries } = useHomeLibrary();

  // Autocomplete for search suggestions
  const {
    suggestions,
    isLoading: isSuggestionsLoading,
    recentSearches,
    setQuery: setAutocompleteQuery,
    clearSuggestions,
    addRecentSearch,
    removeRecentSearch,
  } = useAutocomplete();

  // Popular manga recommendations for empty state
  const {
    items: recommendedItems,
    isLoading: isRecommendationsLoading,
    fallbackSuggestions,
  } = useRecommendations();

  // Don't auto-focus - it triggers the recent searches dropdown on page load

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchFormRef.current && !searchFormRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setAutocompleteQuery(value);
    setShowSuggestions(true);
  }, [setAutocompleteQuery]);

  const handleInputFocus = useCallback(() => {
    setShowSuggestions(true);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() !== '') {
      addRecentSearch(query.trim());
      clearSuggestions();
      void navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }, [query, addRecentSearch, clearSuggestions, navigate]);

  const handleSelectSuggestion = useCallback((title: string) => {
    addRecentSearch(title);
    clearSuggestions();
    void navigate(`/search?q=${encodeURIComponent(title)}`);
  }, [addRecentSearch, clearSuggestions, navigate]);

  const handleSelectRecent = useCallback((recentQuery: string) => {
    clearSuggestions();
    void navigate(`/search?q=${encodeURIComponent(recentQuery)}`);
  }, [clearSuggestions, navigate]);

  const handleSelectRecommendation = useCallback((title: string) => {
    addRecentSearch(title);
    void navigate(`/search?q=${encodeURIComponent(title)}`);
  }, [addRecentSearch, navigate]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.userMenuContainer}>
          <UserMenu onLoginClick={() => setShowLoginModal(true)} />
        </div>
        <div className={styles.titleContainer}>
          <Text variant="header-md/bold" className={styles.titleIcon}>📚</Text>
          <Text variant="header-lg/bold" className={styles.titleText}>NC Cardinal Manga</Text>
        </div>
        <Text variant="text-md/normal" color="text-secondary" tag="p" className={styles.subtitle}>
          Find manga series at your local NC library
        </Text>
        <div className={styles.librarySelector}>
          <Text variant="text-sm/medium" color="text-secondary" tag="label" htmlFor="home-library" className={styles.librarySelectorLabel}>
            📍 My Library:
          </Text>
          <select
            id="home-library"
            className={styles.librarySelect}
            value={homeLibrary}
            onChange={(e) => setHomeLibrary(e.target.value)}
          >
            {libraries.map((lib) => (
              <option key={lib.code} value={lib.code}>
                {lib.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <form className={styles.searchForm} onSubmit={handleSubmit} ref={searchFormRef}>
        <div className={styles.searchInputContainer}>
          <div className={styles.searchInputWrapper}>
            <input
              ref={inputRef}
              type="text"
              className={styles.searchInput}
              placeholder="Search for manga... (e.g., Demon Slayer, One Piece vol 12)"
              value={query}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.searchButton}
              disabled={query.trim() === ''}
            >
              <span className={styles.searchIcon}>→</span>
            </button>
          </div>
          <SearchSuggestions
            suggestions={suggestions}
            isLoading={isSuggestionsLoading}
            recentSearches={recentSearches}
            isOpen={showSuggestions}
            query={query}
            onSelect={handleSelectSuggestion}
            onSelectRecent={handleSelectRecent}
            onRemoveRecent={removeRecentSearch}
            onClose={() => setShowSuggestions(false)}
          />
        </div>
      </form>

      {/* Recommendations Section */}
      <section className={styles.recommendationsSection}>
        <div className={styles.recommendationsHeader}>
          <Heading level={2} className={styles.recommendationsTitle}>Popular Manga</Heading>
          <Text variant="text-sm/normal" color="text-muted" tag="p">
            Discover trending series available at NC Cardinal
          </Text>
        </div>

        {isRecommendationsLoading ? (
          <div className={styles.recommendationsGrid}>
            {Array.from({ length: 16 }).map((_, idx) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key -- Skeleton placeholders have no identity; index is appropriate
              <div key={idx} className={styles.skeletonCard}>
                <div className={styles.skeletonCover} />
                <div className={styles.skeletonInfo}>
                  <div className={styles.skeletonTitle} />
                  <div className={styles.skeletonBadge} />
                </div>
              </div>
            ))}
          </div>
        ) : recommendedItems.length > 0 ? (
          <div className={styles.recommendationsGrid}>
            {recommendedItems.map((item) => (
              <RecommendationCard
                key={item.anilistId}
                item={item}
                onClick={() => handleSelectRecommendation(item.title)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.fallbackSuggestions}>
            <Text variant="text-md/normal" color="text-secondary" className={styles.fallbackTitle}>
              Try searching for:
            </Text>
            <div className={styles.fallbackChips}>
              {fallbackSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={styles.fallbackChip}
                  onClick={() => handleSelectRecommendation(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}

// ============================================================================
// Recommendation Card Component
// ============================================================================

interface RecommendationCardProps {
  item: SuggestionItem;
  onClick: () => void;
}

function RecommendationCard({ item, onClick }: RecommendationCardProps): JSX.Element {
  const [imageError, setImageError] = useState(false);

  const getBadgeInfo = () => {
    if (item.status === 'RELEASING') {
      return { text: 'Ongoing', isOngoing: true };
    }
    if (item.volumes != null && item.volumes > 0) {
      return { text: `${item.volumes} vol`, isOngoing: false };
    }
    return { text: 'Complete', isOngoing: false };
  };

  const badge = getBadgeInfo();

  return (
    <button type="button" className={styles.recommendationCard} onClick={onClick}>
      <div className={styles.recommendationCover}>
        {item.coverUrl != null && !imageError ? (
          <img
            src={item.coverUrl}
            alt={item.title}
            className={styles.recommendationCoverImage}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={styles.recommendationCoverPlaceholder}>📚</div>
        )}
      </div>
      <div className={styles.recommendationInfo}>
        <span className={styles.recommendationTitle}>{item.title}</span>
        <span className={badge.isOngoing ? styles.badgeOngoing : styles.badgeVolumes}>
          {badge.text}
        </span>
      </div>
    </button>
  );
}

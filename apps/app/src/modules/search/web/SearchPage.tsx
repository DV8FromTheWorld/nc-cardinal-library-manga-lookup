/**
 * Search page component for web.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStreamingSearch } from '../hooks/useStreamingSearch';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { DebugPanel } from '../../debug/web/DebugPanel';
import { clearCacheForSearch } from '../services/mangaApi';
import { getAvailabilityPercent, getAvailabilityDisplayInfo } from '../utils/availability';
import { Text } from '../../../design/components/Text/web/Text';
import { Heading } from '../../../design/components/Heading/web/Heading';
import { LoginModal } from '../../login/web/LoginModal';
import { UserMenu } from '../../login/web/UserMenu';
import type { SeriesResult, VolumeResult, StreamingSearchProgress } from '../types';
import styles from './SearchPage.module.css';

export function SearchPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQuery = searchParams.get('q') ?? undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const [showAllVolumes, setShowAllVolumes] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Home library for local/remote availability
  const { homeLibrary, setHomeLibrary, libraries } = useHomeLibrary();

  const handleQueryChange = useCallback((newQuery: string) => {
    if (newQuery) {
      navigate(`/?q=${encodeURIComponent(newQuery)}`);
    } else {
      navigate('/');
    }
  }, [navigate]);

  const {
    query,
    setQuery,
    results,
    isLoading,
    error,
    progress,
    search,
    clearResults,
  } = useStreamingSearch({
    initialQuery,
    homeLibrary,
    onQueryChange: handleQueryChange,
  });

  // Focus input on mount (only if no initial query)
  useEffect(() => {
    if (!initialQuery) {
      inputRef.current?.focus();
    }
  }, [initialQuery]);

  const handleSelectSeries = useCallback((seriesId: string) => {
    // Use entity ID for navigation (stable across data source updates)
    navigate(`/series/${encodeURIComponent(seriesId)}`);
  }, [navigate]);

  const handleSelectBook = useCallback((isbn: string) => {
    navigate(`/books/${isbn}`);
  }, [navigate]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  }, [query, search]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      search(query);
    }
  }, [query, search]);

  const handleGoHome = useCallback(() => {
    clearResults();
    inputRef.current?.focus();
  }, [clearResults]);

  const handleClearCache = useCallback(async () => {
    if (results?.query) {
      await clearCacheForSearch(results.query);
      // Re-run the search to get fresh data
      search(results.query);
    }
  }, [results?.query, search]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.userMenuContainer}>
          <UserMenu onLoginClick={() => setShowLoginModal(true)} />
        </div>
        <button 
          type="button" 
          className={styles.titleButton}
          onClick={handleGoHome}
          title="Back to search home"
        >
          <Text variant="header-md/bold" className={styles.titleIcon}>📚</Text>
          <Text variant="header-lg/bold" className={styles.titleText}>NC Cardinal Manga</Text>
        </button>
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
            onChange={(e) => {
              setHomeLibrary(e.target.value);
              // Re-run search with new home library if we have results
              if (results?.query) {
                search(results.query);
              }
            }}
          >
            {libraries.map((lib) => (
              <option key={lib.code} value={lib.code}>
                {lib.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <form className={styles.searchForm} onSubmit={handleSubmit}>
        <div className={styles.searchInputWrapper}>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search for manga... (e.g., Demon Slayer, One Piece vol 12)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className={styles.searchButton}
            disabled={isLoading || !query.trim()}
          >
            {isLoading ? (
              <span className={styles.spinner} />
            ) : (
              <span className={styles.searchIcon}>→</span>
            )}
          </button>
        </div>
        {results?.parsedQuery.volumeNumber && (
          <Text variant="text-sm/normal" color="text-secondary" tag="p" className={styles.parsedHint}>
            Searching for <Text variant="text-sm/semibold" tag="strong">{results.parsedQuery.title}</Text> volume <Text variant="text-sm/semibold" tag="strong">{results.parsedQuery.volumeNumber}</Text>
          </Text>
        )}
      </form>

      {error && (
        <div className={styles.error}>
          <Text variant="text-lg/medium" className={styles.errorIcon}>⚠</Text>
          <Text variant="text-md/normal" color="error">{error}</Text>
        </div>
      )}

      {isLoading && (
        <SearchProgressIndicator progress={progress} />
      )}

      {results && !isLoading && (
        <div className={styles.results}>
          {/* Best Match Highlight */}
          {results.bestMatch && (
            <section className={styles.bestMatchSection}>
              <Heading level={2} className={styles.sectionTitle}>Best Match</Heading>
              {results.bestMatch.type === 'series' && results.bestMatch.series && (
                <SeriesCard
                  series={results.bestMatch.series}
                  onClick={() => handleSelectSeries(results.bestMatch!.series!.id)}
                  highlighted
                />
              )}
              {results.bestMatch.type === 'volume' && results.bestMatch.volume && (
                <VolumeCard
                  volume={results.bestMatch.volume}
                  onClick={() => {
                    if (results.bestMatch!.volume!.isbn) {
                      handleSelectBook(results.bestMatch!.volume!.isbn);
                    }
                  }}
                  highlighted
                />
              )}
            </section>
          )}

          {/* Series Results (excluding best match to avoid duplication) */}
          {(() => {
            const bestMatchSeriesId = results.bestMatch?.type === 'series' ? results.bestMatch.series?.id : undefined;
            const filteredSeries = bestMatchSeriesId
              ? results.series.filter((s) => s.id !== bestMatchSeriesId)
              : results.series;
            
            return filteredSeries.length > 0 ? (
              <section className={styles.section}>
                <Heading level={2} className={styles.sectionTitle}>
                  {bestMatchSeriesId ? 'Other Series' : 'Series'}
                  <Text variant="text-sm/medium" color="text-muted" className={styles.count}>{filteredSeries.length}</Text>
                </Heading>
                <div className={styles.seriesGrid}>
                  {filteredSeries.map((series) => (
                    <SeriesCard
                      key={series.id}
                      series={series}
                      onClick={() => handleSelectSeries(series.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null;
          })()}

          {/* Volume Results */}
          {results.volumes.length > 0 && results.bestMatch?.type !== 'volume' && (
            <section className={styles.section}>
              <Heading level={2} className={styles.sectionTitle}>
                Volumes
                <Text variant="text-sm/medium" color="text-muted" className={styles.count}>{results.volumes.length}</Text>
              </Heading>
              <div className={styles.volumeGrid}>
                {(showAllVolumes ? results.volumes : results.volumes.slice(0, 12)).map((volume, idx) => (
                  <VolumeCard
                    key={`${volume.isbn ?? idx}`}
                    volume={volume}
                    onClick={() => {
                      if (volume.isbn) {
                        handleSelectBook(volume.isbn);
                      }
                    }}
                  />
                ))}
              </div>
              {results.volumes.length > 12 && (
                <button
                  type="button"
                  className={styles.showMoreButton}
                  onClick={() => setShowAllVolumes(!showAllVolumes)}
                >
                  <Text variant="text-sm/medium">
                    {showAllVolumes
                      ? 'Show less'
                      : `Show all ${results.volumes.length} volumes`}
                  </Text>
                </button>
              )}
            </section>
          )}

          {/* No Results */}
          {results.series.length === 0 && results.volumes.length === 0 && (
            <div className={styles.noResults}>
              <Text variant="header-xl/normal" className={styles.noResultsIcon}>🔍</Text>
              <Text variant="text-md/normal" tag="p">No results found for "{results.query}"</Text>
              <Text variant="text-sm/normal" color="text-muted" tag="p" className={styles.noResultsHint}>
                Try a different search term or check spelling
              </Text>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!results && !isLoading && !error && (
        <div className={styles.emptyState}>
          <div className={styles.suggestions}>
            <Text variant="text-md/medium" color="text-secondary" tag="p" className={styles.suggestionsTitle}>Try searching for:</Text>
            <div className={styles.suggestionChips}>
              {['Demon Slayer', 'One Piece', 'My Hero Academia', 'Spy x Family'].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={styles.suggestionChip}
                  onClick={() => {
                    setQuery(suggestion);
                    search(suggestion);
                  }}
                >
                  <Text variant="text-sm/medium">{suggestion}</Text>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      <DebugPanel
        debug={results?._debug}
        cacheContext={results?.query ? { type: 'search', identifier: results.query } : undefined}
        onClearCache={handleClearCache}
      />

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface SeriesCardProps {
  series: SeriesResult;
  onClick: () => void;
  highlighted?: boolean | undefined;
}

function SeriesCard({ series, onClick, highlighted }: SeriesCardProps): JSX.Element {
  const availabilityPercent = getAvailabilityPercent(series.availableVolumes, series.totalVolumes);

  // Format media type for display
  const getMediaTypeLabel = (mediaType?: string) => {
    if (!mediaType || mediaType === 'unknown') return null;
    return mediaType === 'light_novel' ? 'Light Novel' : 'Manga';
  };

  // Format relationship for display
  const getRelationshipLabel = (relationship?: string) => {
    if (!relationship) return null;
    const labels: Record<string, string> = {
      adaptation: 'Adaptation',
      spinoff: 'Spin-off',
      sequel: 'Sequel',
      prequel: 'Prequel',
      side_story: 'Side Story',
      anthology: 'Anthology',
    };
    return labels[relationship] ?? relationship;
  };

  const mediaTypeLabel = getMediaTypeLabel(series.mediaType);
  const relationshipLabel = getRelationshipLabel(series.relationship);

  return (
    <button
      type="button"
      className={`${styles.seriesCard} ${highlighted ? styles.highlighted : ''}`}
      onClick={onClick}
    >
      <div className={styles.seriesCardContent}>
        <div className={styles.seriesCover}>
          {series.coverImage ? (
            <img 
              src={series.coverImage} 
              alt={`${series.title} cover`}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className={styles.coverPlaceholder}>📚</div>
          )}
        </div>
        <div className={styles.seriesInfo}>
          <div className={styles.seriesHeader}>
            <Text variant="header-sm/bold" tag="div" className={styles.seriesTitle}>{series.title}</Text>
            <div className={styles.seriesBadges}>
              {mediaTypeLabel && (
                <Text 
                  variant="text-xs/semibold" 
                  className={`${styles.mediaTypeBadge} ${series.mediaType === 'light_novel' ? styles.lightNovel : styles.manga}`}
                >
                  {mediaTypeLabel}
                </Text>
              )}
              {relationshipLabel && (
                <Text variant="text-xs/semibold" className={styles.relationshipBadge}>
                  {relationshipLabel}
                </Text>
              )}
              {series.isComplete && (
                <Text variant="text-xs/semibold" className={styles.completeBadge}>Complete</Text>
              )}
            </div>
          </div>
          
          {series.author && (
            <Text variant="text-sm/normal" color="text-secondary" tag="p" className={styles.seriesAuthor}>{series.author}</Text>
          )}
          
          <div className={styles.seriesStats}>
            <div className={styles.statItem}>
              <Text variant="text-lg/bold" className={styles.statValue}>{series.totalVolumes}</Text>
              <Text variant="text-xs/normal" color="text-muted" className={styles.statLabel}>volumes</Text>
            </div>
            <div className={styles.statItem}>
              <Text variant="text-lg/bold" className={styles.statValue}>{series.availableVolumes}</Text>
              <Text variant="text-xs/normal" color="text-muted" className={styles.statLabel}>in library</Text>
            </div>
          </div>
          
          <div className={styles.availabilityBar}>
            <div 
              className={styles.availabilityFill}
              style={{ width: `${availabilityPercent}%` }}
            />
          </div>
          <Text variant="text-xs/normal" color="text-secondary" tag="p" className={styles.availabilityText}>
            {availabilityPercent}% available in NC Cardinal
          </Text>
        </div>
      </div>
    </button>
  );
}

interface VolumeCardProps {
  volume: VolumeResult;
  onClick: () => void;
  highlighted?: boolean | undefined;
}

function VolumeCard({ volume, onClick, highlighted }: VolumeCardProps): JSX.Element {
  const { statusType, statusText } = getAvailabilityDisplayInfo(volume.availability);

  // Map status type to CSS class
  const dotClass =
    statusType === 'local'
      ? styles.local
      : statusType === 'available'
        ? styles.available
        : styles.unavailable;

  return (
    <button
      type="button"
      className={`${styles.volumeCard} ${highlighted ? styles.highlighted : ''}`}
      onClick={onClick}
      disabled={!volume.isbn}
    >
      <div className={styles.volumeCover}>
        {volume.coverImage ? (
          <img
            src={volume.coverImage}
            alt={volume.title}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className={styles.coverPlaceholder}>📖</div>
        )}
      </div>
      <Text variant="text-sm/bold" tag="div" className={styles.volumeNumber}>{volume.volumeNumber ?? '?'}</Text>
      <div className={styles.volumeInfo}>
        <Text variant="text-sm/semibold" tag="div" className={styles.volumeTitle}>{volume.title}</Text>
        {volume.seriesTitle && <Text variant="text-xs/normal" color="text-secondary" tag="p" className={styles.volumeSeries}>{volume.seriesTitle}</Text>}
        <div className={styles.volumeAvailability}>
          <span className={`${styles.availabilityDot} ${dotClass}`} />
          <Text variant="text-xs/normal">{statusText}</Text>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Progress Indicator
// ============================================================================

interface SearchProgressIndicatorProps {
  progress: StreamingSearchProgress;
}

function SearchProgressIndicator({ progress }: SearchProgressIndicatorProps): JSX.Element {
  const steps = [
    { id: 'wikipedia', label: 'Wikipedia', icon: '📖' },
    { id: 'nc-cardinal', label: 'Library Catalog', icon: '🏛️' },
    { id: 'availability', label: 'Availability', icon: '📚' },
    { id: 'covers', label: 'Cover Images', icon: '🖼️' },
  ] as const;

  // Determine which step is active/complete
  const getStepStatus = (stepId: string): 'complete' | 'active' | 'pending' => {
    const stepOrder = ['wikipedia', 'nc-cardinal', 'availability', 'covers', 'done'];
    const currentIndex = stepOrder.indexOf(progress.currentStep ?? '');
    const stepIndex = stepOrder.indexOf(stepId);
    
    if (currentIndex < 0) return 'pending';
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  // Calculate overall progress percentage
  const getOverallProgress = (): number => {
    if (!progress.currentStep) return 0;
    
    const stepWeights: Record<string, number> = {
      'wikipedia': 10,
      'nc-cardinal': 20,
      'availability': 60,
      'covers': 90,
      'done': 100,
    };
    
    let baseProgress = stepWeights[progress.currentStep] ?? 0;
    
    // Add detail progress for availability and covers
    if (progress.currentStep === 'availability' && progress.availabilityProgress) {
      const { completed, total } = progress.availabilityProgress;
      const stepProgress = total > 0 ? (completed / total) : 0;
      baseProgress = 20 + (stepProgress * 40); // 20% to 60%
    }
    
    if (progress.currentStep === 'covers' && progress.coversProgress) {
      const { completed, total } = progress.coversProgress;
      const stepProgress = total > 0 ? (completed / total) : 0;
      baseProgress = 60 + (stepProgress * 30); // 60% to 90%
    }
    
    return Math.min(100, baseProgress);
  };

  return (
    <div className={styles.progressContainer}>
      {/* Main progress bar */}
      <div className={styles.progressBarContainer}>
        <div 
          className={styles.progressBar}
          style={{ width: `${getOverallProgress()}%` }}
        />
      </div>
      
      {/* Current status message */}
      <Text variant="text-md/medium" tag="p" className={styles.progressMessage}>
        {progress.message}
      </Text>
      
      {/* Step indicators */}
      <div className={styles.progressSteps}>
        {steps.map((step) => {
          const status = getStepStatus(step.id);
          return (
            <div 
              key={step.id}
              className={`${styles.progressStep} ${styles[status]}`}
            >
              <span className={styles.progressStepIcon}>
                {status === 'complete' ? '✓' : step.icon}
              </span>
              <Text variant="text-xs/medium" className={styles.progressStepLabel}>
                {step.label}
              </Text>
            </div>
          );
        })}
      </div>
      
      {/* Detailed progress for availability/covers */}
      {progress.availabilityProgress && progress.currentStep === 'availability' && (
        <div className={styles.progressDetails}>
          <Text variant="text-sm/normal" color="text-secondary">
            Checked {progress.availabilityProgress.completed} of {progress.availabilityProgress.total} volumes
            {progress.availabilityProgress.foundInCatalog > 0 && (
              <> • <Text variant="text-sm/semibold" color="success">{progress.availabilityProgress.foundInCatalog} found in library</Text></>
            )}
          </Text>
        </div>
      )}
      
      {progress.coversProgress && progress.currentStep === 'covers' && (
        <div className={styles.progressDetails}>
          <Text variant="text-sm/normal" color="text-secondary">
            Loading covers: {progress.coversProgress.completed} of {progress.coversProgress.total}
          </Text>
        </div>
      )}
    </div>
  );
}

/**
 * Search page component for web.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSearch } from '../hooks/useSearch';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { DebugPanel } from '../../debug/web/DebugPanel';
import type { SeriesResult, VolumeResult } from '../types';
import styles from './SearchPage.module.css';

export function SearchPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQuery = searchParams.get('q') ?? undefined;
  const inputRef = useRef<HTMLInputElement>(null);

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
    search,
    refreshWithDebug,
    clearResults,
  } = useSearch({
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

  const handleSelectSeries = useCallback((slug: string) => {
    navigate(`/series/${encodeURIComponent(slug)}`);
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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button 
          type="button" 
          className={styles.titleButton}
          onClick={handleGoHome}
          title="Back to search home"
        >
          <span className={styles.titleIcon}>📚</span>
          <span className={styles.titleText}>NC Cardinal Manga</span>
        </button>
        <p className={styles.subtitle}>
          Find manga series at your local NC library
        </p>
        <div className={styles.librarySelector}>
          <label htmlFor="home-library" className={styles.librarySelectorLabel}>
            📍 My Library:
          </label>
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
          <p className={styles.parsedHint}>
            Searching for <strong>{results.parsedQuery.title}</strong> volume <strong>{results.parsedQuery.volumeNumber}</strong>
          </p>
        )}
      </form>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠</span>
          {error}
        </div>
      )}

      {isLoading && (
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <p>Searching libraries...</p>
        </div>
      )}

      {results && !isLoading && (
        <div className={styles.results}>
          {/* Best Match Highlight */}
          {results.bestMatch && (
            <section className={styles.bestMatchSection}>
              <h2 className={styles.sectionTitle}>Best Match</h2>
              {results.bestMatch.type === 'series' && results.bestMatch.series && (
                <SeriesCard
                  series={results.bestMatch.series}
                  onClick={() => handleSelectSeries(results.bestMatch!.series!.slug)}
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

          {/* Series Results */}
          {results.series.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Series
                <span className={styles.count}>{results.series.length}</span>
              </h2>
              <div className={styles.seriesGrid}>
                {results.series.map((series) => (
                  <SeriesCard
                    key={series.id}
                    series={series}
                    onClick={() => handleSelectSeries(series.slug)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Volume Results */}
          {results.volumes.length > 0 && results.bestMatch?.type !== 'volume' && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Volumes
                <span className={styles.count}>{results.volumes.length}</span>
              </h2>
              <div className={styles.volumeGrid}>
                {results.volumes.slice(0, 12).map((volume, idx) => (
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
                <p className={styles.moreResults}>
                  +{results.volumes.length - 12} more volumes
                </p>
              )}
            </section>
          )}

          {/* No Results */}
          {results.series.length === 0 && results.volumes.length === 0 && (
            <div className={styles.noResults}>
              <span className={styles.noResultsIcon}>🔍</span>
              <p>No results found for "{results.query}"</p>
              <p className={styles.noResultsHint}>
                Try a different search term or check spelling
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!results && !isLoading && !error && (
        <div className={styles.emptyState}>
          <div className={styles.suggestions}>
            <p className={styles.suggestionsTitle}>Try searching for:</p>
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
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      <DebugPanel
        debug={results?._debug}
        onRefreshWithDebug={results && !results._debug ? refreshWithDebug : undefined}
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
  const availabilityPercent = Math.round((series.availableVolumes / series.totalVolumes) * 100);
  
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
            <h3 className={styles.seriesTitle}>{series.title}</h3>
            {series.isComplete && (
              <span className={styles.completeBadge}>Complete</span>
            )}
          </div>
          
          {series.author && (
            <p className={styles.seriesAuthor}>{series.author}</p>
          )}
          
          <div className={styles.seriesStats}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{series.totalVolumes}</span>
              <span className={styles.statLabel}>volumes</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{series.availableVolumes}</span>
              <span className={styles.statLabel}>in library</span>
            </div>
          </div>
          
          <div className={styles.availabilityBar}>
            <div 
              className={styles.availabilityFill}
              style={{ width: `${availabilityPercent}%` }}
            />
          </div>
          <p className={styles.availabilityText}>
            {availabilityPercent}% available in NC Cardinal
          </p>
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
  const isAvailable = volume.availability?.available ?? false;
  const hasLocalCopies = (volume.availability?.localCopies ?? 0) > 0;
  const localAvailable = volume.availability?.localAvailable ?? 0;
  const remoteAvailable = volume.availability?.remoteAvailable ?? 0;
  
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
      <div className={styles.volumeNumber}>
        {volume.volumeNumber ?? '?'}
      </div>
      <div className={styles.volumeInfo}>
        <h4 className={styles.volumeTitle}>{volume.title}</h4>
        {volume.seriesTitle && (
          <p className={styles.volumeSeries}>{volume.seriesTitle}</p>
        )}
        <div className={styles.volumeAvailability}>
          {volume.availability?.notInCatalog ? (
            <>
              <span className={`${styles.availabilityDot} ${styles.unavailable}`} />
              <span>Not in catalog</span>
            </>
          ) : isAvailable ? (
            <>
              <span className={`${styles.availabilityDot} ${hasLocalCopies && localAvailable > 0 ? styles.local : styles.available}`} />
              {hasLocalCopies ? (
                <span>
                  {localAvailable > 0 ? `${localAvailable} local` : 'Local checked out'}
                  {remoteAvailable > 0 && ` · ${remoteAvailable} remote`}
                </span>
              ) : (
                <span>{remoteAvailable} remote</span>
              )}
            </>
          ) : (
            <>
              <span className={`${styles.availabilityDot} ${styles.unavailable}`} />
              <span>All checked out</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

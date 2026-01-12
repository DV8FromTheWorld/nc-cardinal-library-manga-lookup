/**
 * Book detail page component for web.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBookDetails } from '../hooks/useBookDetails';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { DebugPanel } from '../../debug/web/DebugPanel';
import { clearCacheForBook } from '../../search/services/mangaApi';
import {
  cleanDisplayTitle,
  formatAuthorName,
  generateSeriesSlug,
} from '../../search/utils/formatters';
import { groupHoldingsByLibrary, getAvailableCount } from '../../search/utils/availability';
import { Text } from '../../../design/components/Text/web/Text';
import { Heading } from '../../../design/components/Heading/web/Heading';
import styles from './BookPage.module.css';

export function BookPage(): JSX.Element {
  const { isbn } = useParams<{ isbn: string }>();
  const navigate = useNavigate();
  const { homeLibrary, libraryName: homeLibraryName } = useHomeLibrary();
  const [expandedLibraries, setExpandedLibraries] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reset image error state when ISBN changes
  useEffect(() => {
    setImageError(false);
  }, [isbn]);

  const { book, isLoading, error } = useBookDetails({
    isbn: isbn ?? '',
    homeLibrary,
  });

  const handleBack = () => {
    navigate(-1);
  };

  const handleSelectSeries = (seriesSlug: string) => {
    navigate(`/series/${encodeURIComponent(seriesSlug)}`);
  };

  const handleClearCache = useCallback(async () => {
    if (isbn) {
      await clearCacheForBook(isbn);
      // Optionally reload the page to show fresh data
      window.location.reload();
    }
  }, [isbn]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <Text variant="text-md/normal" color="text-secondary" tag="p">Loading book details...</Text>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.backButton} onClick={handleBack}>
          <Text variant="text-sm/medium">← Back</Text>
        </button>
        <div className={styles.error}>
          <Text variant="text-lg/medium" className={styles.errorIcon}>⚠</Text>
          <Text variant="text-md/normal" color="error">{error ?? 'Book not found'}</Text>
        </div>
      </div>
    );
  }

  // Group holdings by library
  const holdingsByLibrary = groupHoldingsByLibrary(book.holdings);
  const libraryNames = Object.keys(holdingsByLibrary).sort();
  const displayLibraries = expandedLibraries ? libraryNames : libraryNames.slice(0, 5);

  // Clean up title and author names for display
  const displayTitle = cleanDisplayTitle(book.title);
  const displayAuthors = book.authors.map(formatAuthorName);

  // Generate a series slug from title
  const seriesSlug = book.seriesInfo ? generateSeriesSlug(book.seriesInfo.title) : null;

  return (
    <div className={styles.container}>
      <button type="button" className={styles.backButton} onClick={handleBack}>
        <Text variant="text-sm/medium">← Back</Text>
      </button>

      <div className={styles.bookLayout}>
        <div className={styles.bookCover}>
          {book.coverImage && !imageError ? (
            <img 
              src={book.coverImage} 
              alt={displayTitle}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className={styles.coverPlaceholder}>📖</div>
          )}
        </div>
        <div className={styles.bookMain}>
          <header className={styles.header}>
            <Heading level={1} className={styles.title}>{displayTitle}</Heading>
            
            {displayAuthors.length > 0 && (
              <Text variant="text-md/normal" color="text-secondary" tag="p" className={styles.authors}>
                {displayAuthors.slice(0, 2).join(' • ')}
              </Text>
            )}

            {book.seriesInfo && seriesSlug && (
              <button
                type="button"
                className={styles.seriesLink}
                onClick={() => handleSelectSeries(seriesSlug)}
              >
                <Text variant="text-sm/medium">
                  📚 Part of: {book.seriesInfo.title}
                  {book.seriesInfo.volumeNumber && ` (Vol. ${book.seriesInfo.volumeNumber})`}
                </Text>
              </button>
            )}
            
            <Text variant="code" color="text-muted" tag="p" className={styles.bookId}>Record ID: {book.id}</Text>
          </header>

          <section className={styles.availabilitySection}>
            <Heading level={2} className={styles.sectionTitle}>Availability</Heading>
            <div className={styles.availabilityCard}>
              <div className={styles.availabilitySummary}>
                <div className={`${styles.availabilityStatus} ${book.availability.available ? styles.available : styles.unavailable}`}>
                  <span className={styles.statusIndicator} />
                  <Text variant="text-lg/semibold">
                    {book.availability.available ? 'Available Now' : 'Not Currently Available'}
                  </Text>
                </div>
                <div className={styles.copyCount}>
                  <Text variant="header-lg/bold" className={styles.copyNumber}>{book.availability.availableCopies}</Text>
                  <Text variant="text-md/normal" color="text-secondary" className={styles.copyLabel}>
                    of {book.availability.totalCopies} copies available
                  </Text>
                </div>
                {/* Local vs Remote breakdown */}
                {book.availability.localCopies !== undefined && (
                  <div className={styles.localRemote}>
                    <div className={styles.localStatus}>
                      <span className={`${styles.localDot} ${(book.availability.localAvailable ?? 0) > 0 ? styles.available : styles.unavailable}`} />
                      <Text variant="text-md/normal">
                        {homeLibraryName ?? 'Your Library'}: 
                        {(book.availability.localAvailable ?? 0) > 0 
                          ? ` ${book.availability.localAvailable} available`
                          : book.availability.localCopies > 0 
                            ? ' All checked out'
                            : ' None'}
                      </Text>
                    </div>
                    {(book.availability.remoteCopies ?? 0) > 0 && (
                      <Text variant="text-sm/normal" color="text-secondary" tag="div" className={styles.remoteStatus}>
                        Other libraries: {book.availability.remoteAvailable ?? 0} available
                      </Text>
                    )}
                  </div>
                )}
              </div>
              
              {/* Catalog and external links */}
              <div className={styles.externalLinks}>
                {book.catalogUrl && (
                  <a 
                    href={book.catalogUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={styles.catalogLink}
                  >
                    <Text variant="text-md/medium">🔗 View in NC Cardinal Catalog</Text>
                  </a>
                )}
                {isbn && (
                  <a 
                    href={`https://www.amazon.com/dp/${isbn}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={styles.externalLink}
                  >
                    <Text variant="text-sm/medium">🛒 Amazon</Text>
                  </a>
                )}
                {book.seriesInfo && (
                  <a 
                    href={`https://myanimelist.net/manga.php?q=${encodeURIComponent(book.seriesInfo.title)}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={styles.externalLink}
                  >
                    <Text variant="text-sm/medium">📊 MyAnimeList</Text>
                  </a>
                )}
              </div>

              <div className={styles.libraryList}>
                <Heading level={3} className={styles.libraryListTitle}>
                  Available at {book.availability.libraries.length} {book.availability.libraries.length === 1 ? 'library' : 'libraries'}
                </Heading>
                
                {displayLibraries.map((libraryName) => {
                  const holdings = holdingsByLibrary[libraryName];
                  const firstHolding = holdings?.[0];
                  if (!holdings || !firstHolding) return null;

                  const availableCount = getAvailableCount(holdings);
                  
                  return (
                    <div key={libraryName} className={styles.libraryItem}>
                      <div className={styles.libraryInfo}>
                        <Text variant="text-md/medium" className={styles.libraryName}>{libraryName}</Text>
                        <Text variant="text-xs/normal" color="text-muted" className={styles.libraryLocation}>
                          {firstHolding.location} • {firstHolding.callNumber}
                        </Text>
                      </div>
                      <div className={styles.libraryCopies}>
                        <Text variant="text-xs/medium" className={`${styles.copyBadge} ${availableCount > 0 ? styles.available : styles.unavailable}`}>
                          {availableCount > 0 ? `${availableCount} available` : 'Checked out'}
                        </Text>
                      </div>
                    </div>
                  );
                })}

                {libraryNames.length > 5 && (
                  <button
                    type="button"
                    className={styles.expandButton}
                    onClick={() => setExpandedLibraries(!expandedLibraries)}
                  >
                    <Text variant="text-sm/normal">
                      {expandedLibraries 
                        ? 'Show fewer libraries' 
                        : `Show ${libraryNames.length - 5} more libraries`}
                    </Text>
                  </button>
                )}
              </div>
            </div>
          </section>

          {book.subjects.length > 0 && (
            <section className={styles.metaSection}>
              <Heading level={2} className={styles.sectionTitle}>Subjects</Heading>
              <div className={styles.subjectTags}>
                {/* Dedupe subjects and use index for key to handle duplicates */}
                {[...new Set(book.subjects)].slice(0, 10).map((subject, idx) => (
                  <Text key={idx} variant="text-xs/normal" color="text-secondary" className={styles.subjectTag}>
                    {subject.replace(/\.$/, '')}
                  </Text>
                ))}
              </div>
            </section>
          )}

          <section className={styles.metaSection}>
            <Heading level={2} className={styles.sectionTitle}>Identifiers</Heading>
            <div className={styles.identifiers}>
              {book.isbns.map((bookIsbn) => (
                <div key={bookIsbn} className={styles.identifier}>
                  <Text variant="text-xs/medium" color="text-muted" className={styles.identifierLabel}>ISBN</Text>
                  <Text variant="code" className={styles.identifierValue}>{bookIsbn}</Text>
                </div>
              ))}
              <div className={styles.identifier}>
                <Text variant="text-xs/medium" color="text-muted" className={styles.identifierLabel}>NC Cardinal ID</Text>
                <Text variant="code" className={styles.identifierValue}>{book.id}</Text>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Debug Panel with cache clearing */}
      <DebugPanel
        debug={undefined}
        cacheContext={isbn ? { type: 'book', identifier: isbn } : undefined}
        onClearCache={handleClearCache}
      />
    </div>
  );
}

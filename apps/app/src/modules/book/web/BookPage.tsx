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

  const handleSelectSeries = (seriesId: string) => {
    navigate(`/series/${encodeURIComponent(seriesId)}`);
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
          <Text variant="text-sm/medium">← Back to series</Text>
        </button>
        <div className={styles.errorContainer}>
          <div className={styles.errorIconLarge}>⚠️</div>
          <Heading level={2} className={styles.errorTitle}>Unable to load book</Heading>
          <Text variant="text-md/normal" color="text-secondary" tag="p" className={styles.errorMessage}>
            {error ?? 'Book not found'}
          </Text>
          <div className={styles.errorActions}>
            <button 
              type="button" 
              className={styles.retryButton}
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
            <button 
              type="button" 
              className={styles.backButtonSecondary}
              onClick={handleBack}
            >
              Go back
            </button>
          </div>
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

  // Get series ID for navigation (if available)
  const seriesId = book.seriesInfo?.id;

  return (
    <div className={styles.container}>
      <button type="button" className={styles.backButton} onClick={handleBack}>
        <Text variant="text-sm/medium">← Back to series</Text>
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
                by {displayAuthors.slice(0, 2).join(' • ')}
              </Text>
            )}

            {book.seriesInfo && seriesId && (
              <button
                type="button"
                className={styles.seriesLink}
                onClick={() => handleSelectSeries(seriesId)}
              >
                <Text variant="text-sm/medium">
                  📚 Part of: {book.seriesInfo.title}
                </Text>
              </button>
            )}
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
                    <span className={styles.buttonIcon}>🔗</span>
                    <Text variant="text-sm/medium">View in NC Cardinal Catalog</Text>
                  </a>
                )}
                <div className={styles.secondaryLinks}>
                  {isbn && (
                    <a 
                      href={`https://www.amazon.com/dp/${isbn}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={styles.externalLink}
                    >
                      <span className={styles.buttonIcon}>🛒</span>
                      <Text variant="text-sm/medium">Amazon</Text>
                    </a>
                  )}
                  {book.seriesInfo && (
                    <a 
                      href={`https://myanimelist.net/manga.php?q=${encodeURIComponent(book.seriesInfo.title)}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={styles.externalLink}
                    >
                      <svg className={styles.malIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8.273 7.247v8.423l-2.103-.003v-5.216l-2.03 2.404-1.989-2.458-.02 5.285H.001L0 7.247h2.203l1.865 2.545 2.015-2.546 2.19.001zm8.628 2.069l.025 6.335h-2.229l-.039-3.886c-.009.424-.036.823-.069 1.21-.027.31-.062.617-.096.925-.053.398-.108.78-.191 1.114l-.105.367-.16-.266c-.163-.263-.332-.531-.508-.79-.402-.597-.825-1.161-1.315-1.654l-.076-.08v3.14h-2.199l.011-6.375 2.27.002c.065.095.137.177.204.27.29.378.568.77.823 1.18.216.347.416.705.59 1.076l.1-.201c.211-.443.456-.86.725-1.251.256-.373.535-.72.84-1.028.068-.066.139-.13.21-.193h2.289v-.895zm5.299 5.033c-.06.143-.136.283-.232.417-.096.135-.21.263-.343.378-.133.117-.284.22-.448.305a2.46 2.46 0 0 1-1.075.259c-.378 0-.718-.069-1.025-.208a2.208 2.208 0 0 1-.762-.576 2.57 2.57 0 0 1-.476-.86 3.463 3.463 0 0 1-.168-1.08c0-.378.057-.739.168-1.076.112-.34.273-.64.48-.896.21-.26.462-.467.762-.617.302-.152.644-.228 1.02-.228.392 0 .738.074 1.04.22.303.148.556.346.758.595.203.25.356.538.46.865.102.327.154.672.154 1.037a3.5 3.5 0 0 1-.168 1.08 2.572 2.572 0 0 1-.145.385zm-1.635-2.464c-.18-.235-.42-.352-.72-.352-.298 0-.537.117-.72.352-.183.235-.274.562-.274.98 0 .42.091.745.274.98.183.235.422.352.72.352.3 0 .54-.117.72-.352.183-.235.274-.56.274-.98 0-.418-.091-.745-.274-.98z"/>
                      </svg>
                      <Text variant="text-sm/medium">MyAnimeList</Text>
                    </a>
                  )}
                </div>
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

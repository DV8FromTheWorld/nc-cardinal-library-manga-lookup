/**
 * Book detail page component for web.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBookDetails } from '../hooks/useBookDetails';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import type { Holding } from '../../search/types';
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

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <p>Loading book details...</p>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.backButton} onClick={handleBack}>
          ← Back
        </button>
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠</span>
          {error ?? 'Book not found'}
        </div>
      </div>
    );
  }

  // Group holdings by library
  const holdingsByLibrary = book.holdings.reduce<Record<string, Holding[]>>((acc, holding) => {
    const key = holding.libraryName;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(holding);
    return acc;
  }, {});

  const libraryNames = Object.keys(holdingsByLibrary).sort();
  const displayLibraries = expandedLibraries ? libraryNames : libraryNames.slice(0, 5);

  // Clean up title for display
  const displayTitle = book.title
    .replace(/\[manga\]/gi, '')
    .replace(/\s+\/\s*$/, '')
    .trim();

  // Clean up author names
  const displayAuthors = book.authors.map(author => 
    author.split(',').slice(0, 2).join(', ').replace(/\.$/, '')
  );

  // Generate a series slug from title
  const seriesSlug = book.seriesInfo 
    ? book.seriesInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : null;

  return (
    <div className={styles.container}>
      <button type="button" className={styles.backButton} onClick={handleBack}>
        ← Back
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
            <h1 className={styles.title}>{displayTitle}</h1>
            
            {displayAuthors.length > 0 && (
              <p className={styles.authors}>
                {displayAuthors.slice(0, 2).join(' • ')}
              </p>
            )}

            {book.seriesInfo && seriesSlug && (
              <button
                type="button"
                className={styles.seriesLink}
                onClick={() => handleSelectSeries(seriesSlug)}
              >
                📚 Part of: {book.seriesInfo.title}
                {book.seriesInfo.volumeNumber && ` (Vol. ${book.seriesInfo.volumeNumber})`}
              </button>
            )}
            
            <p className={styles.bookId}>Record ID: {book.id}</p>
          </header>

          <section className={styles.availabilitySection}>
            <h2 className={styles.sectionTitle}>Availability</h2>
            <div className={styles.availabilityCard}>
              <div className={styles.availabilitySummary}>
                <div className={`${styles.availabilityStatus} ${book.availability.available ? styles.available : styles.unavailable}`}>
                  <span className={styles.statusIndicator} />
                  {book.availability.available ? 'Available Now' : 'Not Currently Available'}
                </div>
                <div className={styles.copyCount}>
                  <span className={styles.copyNumber}>{book.availability.availableCopies}</span>
                  <span className={styles.copyLabel}>
                    of {book.availability.totalCopies} copies available
                  </span>
                </div>
                {/* Local vs Remote breakdown */}
                {book.availability.localCopies !== undefined && (
                  <div className={styles.localRemote}>
                    <div className={styles.localStatus}>
                      <span className={`${styles.localDot} ${(book.availability.localAvailable ?? 0) > 0 ? styles.available : styles.unavailable}`} />
                      <span>
                        {homeLibraryName ?? 'Your Library'}: 
                        {(book.availability.localAvailable ?? 0) > 0 
                          ? ` ${book.availability.localAvailable} available`
                          : book.availability.localCopies > 0 
                            ? ' All checked out'
                            : ' None'}
                      </span>
                    </div>
                    {(book.availability.remoteCopies ?? 0) > 0 && (
                      <div className={styles.remoteStatus}>
                        Other libraries: {book.availability.remoteAvailable ?? 0} available
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Catalog link */}
              {book.catalogUrl && (
                <a 
                  href={book.catalogUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={styles.catalogLink}
                >
                  🔗 View in NC Cardinal Catalog
                </a>
              )}

              <div className={styles.libraryList}>
                <h3 className={styles.libraryListTitle}>
                  Available at {book.availability.libraries.length} {book.availability.libraries.length === 1 ? 'library' : 'libraries'}
                </h3>
                
                {displayLibraries.map((libraryName) => {
                  const holdings = holdingsByLibrary[libraryName];
                  const firstHolding = holdings?.[0];
                  if (!holdings || !firstHolding) return null;
                  
                  const availableCount = holdings.filter(h => h.available).length;
                  
                  return (
                    <div key={libraryName} className={styles.libraryItem}>
                      <div className={styles.libraryInfo}>
                        <span className={styles.libraryName}>{libraryName}</span>
                        <span className={styles.libraryLocation}>
                          {firstHolding.location} • {firstHolding.callNumber}
                        </span>
                      </div>
                      <div className={styles.libraryCopies}>
                        <span className={`${styles.copyBadge} ${availableCount > 0 ? styles.available : styles.unavailable}`}>
                          {availableCount > 0 ? `${availableCount} available` : 'Checked out'}
                        </span>
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
                    {expandedLibraries 
                      ? 'Show fewer libraries' 
                      : `Show ${libraryNames.length - 5} more libraries`}
                  </button>
                )}
              </div>
            </div>
          </section>

          {book.subjects.length > 0 && (
            <section className={styles.metaSection}>
              <h2 className={styles.sectionTitle}>Subjects</h2>
              <div className={styles.subjectTags}>
                {/* Dedupe subjects and use index for key to handle duplicates */}
                {[...new Set(book.subjects)].slice(0, 10).map((subject, idx) => (
                  <span key={idx} className={styles.subjectTag}>
                    {subject.replace(/\.$/, '')}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className={styles.metaSection}>
            <h2 className={styles.sectionTitle}>Identifiers</h2>
            <div className={styles.identifiers}>
              {book.isbns.map((bookIsbn) => (
                <div key={bookIsbn} className={styles.identifier}>
                  <span className={styles.identifierLabel}>ISBN</span>
                  <span className={styles.identifierValue}>{bookIsbn}</span>
                </div>
              ))}
              <div className={styles.identifier}>
                <span className={styles.identifierLabel}>NC Cardinal ID</span>
                <span className={styles.identifierValue}>{book.id}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

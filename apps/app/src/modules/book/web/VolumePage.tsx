/**
 * Volume detail page component for web.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Heading } from '../../../design/components/Heading/web/Heading';
import { Text } from '../../../design/components/Text/web/Text';
import { DebugPanel } from '../../debug/web/DebugPanel';
import { clearCacheForBook } from '../../search/services/mangaApi';
import {
  formatAuthorName,
  getAmazonUrl,
  getBestIsbnForAmazon,
} from '../../search/utils/formatters';
import {
  formatCopyTotalsDisplay,
  getAllIsbns,
  getDisplayTitle,
  getLibraryCopyTotals,
  getPrimaryIsbn,
  getVolumeCopyTotals,
  getVolumeDetailDisplayInfo,
} from '../../search/utils/volumeStatus';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { useVolumeDetails } from '../hooks/useVolumeDetails';
import styles from './BookPage.module.css';

export function VolumePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { homeLibrary, libraryName: _homeLibraryName } = useHomeLibrary();
  const [expandedLibraries, setExpandedLibraries] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reset image error state when ID changes
  const resetImageError = useCallback(() => setImageError(false), []);
  useEffect(() => {
    resetImageError();
  }, [id, resetImageError]);

  const { volume, isLoading, error } = useVolumeDetails({
    volumeId: id ?? '',
    homeLibrary,
  });

  const handleBack = () => {
    void navigate(-1);
  };

  const handleSelectSeries = (seriesId: string) => {
    void navigate(`/series/${encodeURIComponent(seriesId)}`);
  };

  // Get ISBNs from editions for cache clearing and external links
  const isbns = volume != null ? getAllIsbns(volume.editions) : [];
  const primaryIsbn = volume != null ? getPrimaryIsbn(volume.editions) : undefined;
  const amazonIsbn = isbns.length > 0 ? getBestIsbnForAmazon(isbns) : undefined;

  const handleClearCache = useCallback(async () => {
    if (primaryIsbn != null) {
      await clearCacheForBook(primaryIsbn);
      // Reload the page to show fresh data
      window.location.reload();
    }
  }, [primaryIsbn]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <Text variant="text-md/normal" color="text-secondary" tag="p">
            Loading volume details...
          </Text>
        </div>
      </div>
    );
  }

  if (error != null || volume == null) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.backButton} onClick={handleBack}>
          <Text variant="text-sm/medium">← Back to series</Text>
        </button>
        <div className={styles.errorContainer}>
          <div className={styles.errorIconLarge}>⚠️</div>
          <Heading level={2} className={styles.errorTitle}>
            Unable to load volume
          </Heading>
          <Text
            variant="text-md/normal"
            color="text-secondary"
            tag="p"
            className={styles.errorMessage}
          >
            {error ?? 'Volume not found'}
          </Text>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
            <button type="button" className={styles.backButtonSecondary} onClick={handleBack}>
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get library holdings (may be undefined for list views, populated for detail views)
  const libraryHoldings = volume.libraryHoldings ?? [];
  const displayLibraries = expandedLibraries ? libraryHoldings : libraryHoldings.slice(0, 5);

  // Compute totals from libraryHoldings
  const copyTotals = getVolumeCopyTotals(volume);
  const totalCopies = copyTotals?.total ?? 0;

  // Get display title and author names
  const displayTitle = getDisplayTitle(volume);
  const displayAuthors = (volume.authors ?? []).map(formatAuthorName);

  // Get series ID for navigation
  const seriesId = volume.seriesInfo.id;

  // Get centralized availability status display
  const availabilityStatus = getVolumeDetailDisplayInfo(volume);

  // Check if digital-only (in catalog but no physical copies)
  const isDigitalOnly = totalCopies === 0 && volume.catalogUrl != null;

  return (
    <div className={styles.container}>
      <button type="button" className={styles.backButton} onClick={handleBack}>
        <Text variant="text-sm/medium">← Back to series</Text>
      </button>

      <div className={styles.bookLayout}>
        <div className={styles.bookCover}>
          {volume.coverImage != null && imageError === false ? (
            <img src={volume.coverImage} alt={displayTitle} onError={() => setImageError(true)} />
          ) : (
            <div className={styles.coverPlaceholder}>📖</div>
          )}
        </div>
        <div className={styles.bookMain}>
          <header className={styles.header}>
            <Heading level={1} className={styles.title}>
              {displayTitle}
            </Heading>

            {displayAuthors.length > 0 && (
              <Text
                variant="text-md/normal"
                color="text-secondary"
                tag="p"
                className={styles.authors}
              >
                by {displayAuthors.slice(0, 2).join(' • ')}
              </Text>
            )}

            <button
              type="button"
              className={styles.seriesLink}
              onClick={() => handleSelectSeries(seriesId)}
            >
              <Text variant="text-sm/medium">📚 Part of: {volume.seriesInfo.title}</Text>
            </button>
          </header>

          {volume.summary != null && (
            <section className={styles.descriptionSection}>
              <Heading level={2} className={styles.sectionTitle}>
                Description
              </Heading>
              <Text
                variant="text-md/normal"
                color="text-secondary"
                tag="p"
                className={styles.descriptionText}
              >
                {volume.summary}
              </Text>
            </section>
          )}

          <section className={styles.availabilitySection}>
            <Heading level={2} className={styles.sectionTitle}>
              Availability
            </Heading>
            <div className={styles.availabilityCard}>
              {/* Digital-only: in catalog but no physical copies */}
              {isDigitalOnly && volume.catalogUrl != null ? (
                <div className={styles.availabilitySummary}>
                  <div className={`${styles.availabilityStatus} ${styles.digitalOnly}`}>
                    <span className={styles.digitalIcon}>{availabilityStatus.icon}</span>
                    <Text variant="text-lg/semibold">{availabilityStatus.label}</Text>
                  </div>
                  <Text
                    variant="text-md/normal"
                    color="text-secondary"
                    tag="p"
                    className={styles.digitalDescription}
                  >
                    This title is available digitally through the library's e-book services (like
                    hoopla). No physical copies are available.
                  </Text>
                  <a
                    href={volume.catalogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.digitalAccessButton}
                  >
                    <span className={styles.buttonIcon}>📖</span>
                    <Text variant="text-md/semibold">Access Digital Copy</Text>
                  </a>
                </div>
              ) : (
                <div className={styles.availabilitySummary}>
                  <div
                    className={`${styles.availabilityStatus} ${copyTotals != null && copyTotals.available > 0 ? styles.available : styles.unavailable}`}
                  >
                    <span className={styles.statusIndicator} />
                    <Text variant="text-lg/semibold">
                      {availabilityStatus.icon} {availabilityStatus.label}
                    </Text>
                  </div>
                  {copyTotals != null && totalCopies > 0 && (
                    <div className={styles.copyCount}>
                      <Text variant="header-lg/bold" className={styles.copyNumber}>
                        {copyTotals.available}
                      </Text>
                      <Text
                        variant="text-md/normal"
                        color="text-secondary"
                        className={styles.copyLabel}
                      >
                        of {totalCopies} copies available
                      </Text>
                    </div>
                  )}
                </div>
              )}

              {/* External links - only show for non-digital-only books or as secondary links */}
              <div className={styles.externalLinks}>
                {/* Only show catalog link if not digital-only (digital-only has prominent button above) */}
                {volume.catalogUrl != null && totalCopies > 0 && (
                  <a
                    href={volume.catalogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.catalogLink}
                  >
                    <span className={styles.buttonIcon}>🔗</span>
                    <Text variant="text-sm/medium">View in NC Cardinal Catalog</Text>
                  </a>
                )}
                <div className={styles.secondaryLinks}>
                  {amazonIsbn != null && (
                    <a
                      href={getAmazonUrl(amazonIsbn)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.externalLink}
                    >
                      <span className={styles.buttonIcon}>🛒</span>
                      <Text variant="text-sm/medium">Amazon</Text>
                    </a>
                  )}
                  <a
                    href={`https://myanimelist.net/manga.php?q=${encodeURIComponent(volume.seriesInfo.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.externalLink}
                  >
                    <svg
                      className={styles.malIcon}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8.273 7.247v8.423l-2.103-.003v-5.216l-2.03 2.404-1.989-2.458-.02 5.285H.001L0 7.247h2.203l1.865 2.545 2.015-2.546 2.19.001zm8.628 2.069l.025 6.335h-2.229l-.039-3.886c-.009.424-.036.823-.069 1.21-.027.31-.062.617-.096.925-.053.398-.108.78-.191 1.114l-.105.367-.16-.266c-.163-.263-.332-.531-.508-.79-.402-.597-.825-1.161-1.315-1.654l-.076-.08v3.14h-2.199l.011-6.375 2.27.002c.065.095.137.177.204.27.29.378.568.77.823 1.18.216.347.416.705.59 1.076l.1-.201c.211-.443.456-.86.725-1.251.256-.373.535-.72.84-1.028.068-.066.139-.13.21-.193h2.289v-.895zm5.299 5.033c-.06.143-.136.283-.232.417-.096.135-.21.263-.343.378-.133.117-.284.22-.448.305a2.46 2.46 0 0 1-1.075.259c-.378 0-.718-.069-1.025-.208a2.208 2.208 0 0 1-.762-.576 2.57 2.57 0 0 1-.476-.86 3.463 3.463 0 0 1-.168-1.08c0-.378.057-.739.168-1.076.112-.34.273-.64.48-.896.21-.26.462-.467.762-.617.302-.152.644-.228 1.02-.228.392 0 .738.074 1.04.22.303.148.556.346.758.595.203.25.356.538.46.865.102.327.154.672.154 1.037a3.5 3.5 0 0 1-.168 1.08 2.572 2.572 0 0 1-.145.385zm-1.635-2.464c-.18-.235-.42-.352-.72-.352-.298 0-.537.117-.72.352-.183.235-.274.562-.274.98 0 .42.091.745.274.98.183.235.422.352.72.352.3 0 .54-.117.72-.352.183-.235.274-.56.274-.98 0-.418-.091-.745-.274-.98z" />
                    </svg>
                    <Text variant="text-sm/medium">MyAnimeList</Text>
                  </a>
                </div>
              </div>

              {/* Library list - only show if there are physical copies */}
              {totalCopies > 0 && libraryHoldings.length > 0 && (
                <div className={styles.libraryList}>
                  <Heading level={3} className={styles.libraryListTitle}>
                    Available at {libraryHoldings.length}{' '}
                    {libraryHoldings.length === 1 ? 'library' : 'libraries'}
                  </Heading>

                  {displayLibraries.map((library) => {
                    const firstCopy = library.copies[0];
                    if (!firstCopy) return null;

                    const libraryTotals = getLibraryCopyTotals(library);
                    const availabilityText = formatCopyTotalsDisplay(libraryTotals);

                    return (
                      <div key={library.libraryCode} className={styles.libraryItem}>
                        <div className={styles.libraryInfo}>
                          <Text variant="text-md/medium" className={styles.libraryName}>
                            {library.libraryName}
                          </Text>
                          <Text
                            variant="text-xs/normal"
                            color="text-muted"
                            className={styles.libraryLocation}
                          >
                            {firstCopy.location} • {firstCopy.callNumber}
                          </Text>
                        </div>
                        <div className={styles.libraryCopies}>
                          <Text
                            variant="text-xs/medium"
                            className={`${styles.copyBadge} ${libraryTotals.available > 0 ? styles.available : styles.unavailable}`}
                          >
                            {availabilityText}
                          </Text>
                        </div>
                      </div>
                    );
                  })}

                  {libraryHoldings.length > 5 && (
                    <button
                      type="button"
                      className={styles.expandButton}
                      onClick={() => setExpandedLibraries(!expandedLibraries)}
                    >
                      <Text variant="text-sm/normal">
                        {expandedLibraries
                          ? 'Show fewer libraries'
                          : `Show ${libraryHoldings.length - 5} more libraries`}
                      </Text>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {volume.subjects != null && volume.subjects.length > 0 && (
            <section className={styles.metaSection}>
              <Heading level={2} className={styles.sectionTitle}>
                Subjects
              </Heading>
              <div className={styles.subjectTags}>
                {/* Dedupe subjects - unique strings can be used as keys */}
                {[...new Set(volume.subjects)].slice(0, 10).map((subject) => (
                  <Text
                    key={subject}
                    variant="text-xs/normal"
                    color="text-secondary"
                    className={styles.subjectTag}
                  >
                    {subject.replace(/\.$/, '')}
                  </Text>
                ))}
              </div>
            </section>
          )}

          <section className={styles.metaSection}>
            <Heading level={2} className={styles.sectionTitle}>
              Identifiers
            </Heading>
            <div className={styles.identifiers}>
              {isbns.map((isbn) => (
                <div key={isbn} className={styles.identifier}>
                  <Text
                    variant="text-xs/medium"
                    color="text-muted"
                    className={styles.identifierLabel}
                  >
                    ISBN
                  </Text>
                  <Text variant="code" className={styles.identifierValue}>
                    {isbn}
                  </Text>
                </div>
              ))}
              <div className={styles.identifier}>
                <Text
                  variant="text-xs/medium"
                  color="text-muted"
                  className={styles.identifierLabel}
                >
                  Volume ID
                </Text>
                <Text variant="code" className={styles.identifierValue}>
                  {volume.id}
                </Text>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Debug Panel with cache clearing */}
      <DebugPanel
        debug={undefined}
        cacheContext={primaryIsbn != null ? { type: 'book', identifier: primaryIsbn } : undefined}
        onClearCache={handleClearCache}
      />
    </div>
  );
}

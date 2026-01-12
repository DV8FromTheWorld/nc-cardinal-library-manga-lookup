/**
 * Series detail page component for web.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { useSeriesDetails } from '../hooks/useSeriesDetails';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { DebugPanel } from '../../debug/web/DebugPanel';
import { clearCacheForSeries } from '../../search/services/mangaApi';
import { getAvailabilityPercent } from '../../search/utils/availability';
import { Text } from '../../../design/components/Text/web/Text';
import { Heading } from '../../../design/components/Heading/web/Heading';
import type { VolumeInfo } from '../../search/types';
import styles from './SeriesPage.module.css';

export function SeriesPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { homeLibrary } = useHomeLibrary();

  const { series, isLoading, error, refreshWithDebug } = useSeriesDetails({
    seriesSlug: slug ?? '',
    homeLibrary,
  });

  const handleBack = () => {
    navigate(-1);
  };

  const handleSelectBook = (isbn: string, bookSlug?: string | undefined) => {
    if (bookSlug) {
      navigate(`/books/${isbn}/${encodeURIComponent(bookSlug)}`);
    } else {
      navigate(`/books/${isbn}`);
    }
  };

  const handleClearCache = useCallback(async () => {
    if (slug) {
      await clearCacheForSeries(slug);
      // Reload to show fresh data
      window.location.reload();
    }
  }, [slug]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <Text variant="text-md/normal" color="text-secondary" tag="p">Loading series details...</Text>
        </div>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.backButton} onClick={handleBack}>
          <Text variant="text-sm/medium">← Back to search</Text>
        </button>
        <div className={styles.error}>
          <Text variant="text-lg/medium" className={styles.errorIcon}>⚠</Text>
          <Text variant="text-md/normal" color="error">{error ?? 'Series not found'}</Text>
        </div>
      </div>
    );
  }

  const availabilityPercent = getAvailabilityPercent(series.availableCount, series.totalVolumes);

  return (
    <div className={styles.container}>
      <button type="button" className={styles.backButton} onClick={handleBack}>
        <Text variant="text-sm/medium">← Back to search</Text>
      </button>

      <header className={styles.header}>
        {series.coverImage && (
          <div className={styles.headerCover}>
            <img 
              src={series.coverImage} 
              alt={`${series.title} cover`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        <div className={styles.headerContent}>
          <Heading level={1} className={styles.title}>{series.title}</Heading>
          {series.author && (
            <Text variant="text-md/normal" color="text-secondary" tag="p" className={styles.author}>by {series.author}</Text>
          )}
          <div className={styles.badges}>
            {series.isComplete && (
              <Text variant="text-xs/semibold" className={styles.completeBadge}>✓ Complete Series</Text>
            )}
            <Text variant="text-xs/medium" className={styles.volumeBadge}>{series.totalVolumes} volumes</Text>
          </div>
          <div className={styles.externalLinks}>
            <a 
              href={`https://myanimelist.net/manga.php?q=${encodeURIComponent(series.title)}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              <Text variant="text-sm/medium">📊 MyAnimeList</Text>
            </a>
            <a 
              href={`https://www.amazon.com/s?k=${encodeURIComponent(series.title + ' manga')}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              <Text variant="text-sm/medium">🛒 Amazon</Text>
            </a>
          </div>
          <Text variant="code" color="text-muted" tag="p" className={styles.seriesId}>ID: {series.id}</Text>
        </div>
      </header>

      <section className={styles.availabilitySection}>
        <Heading level={2} className={styles.sectionTitle}>Library Availability</Heading>
        <div className={styles.availabilityCard}>
          <div className={styles.availabilityStats}>
            <div className={styles.statLarge}>
              <Text variant="header-2xl/bold" className={styles.statNumber}>{series.availableCount}</Text>
              <Text variant="text-md/normal" color="text-secondary" className={styles.statLabel}>of {series.totalVolumes} available</Text>
            </div>
            <div className={styles.availabilityBar}>
              <div 
                className={styles.availabilityFill}
                style={{ width: `${availabilityPercent}%` }}
              />
            </div>
            <Text variant="text-sm/normal" color="text-secondary" tag="p" className={styles.availabilityPercent}>{availabilityPercent}% in NC Cardinal</Text>
          </div>

          {series.missingVolumes.length > 0 && series.missingVolumes.length <= 10 && (
            <div className={styles.missingVolumes}>
              <Heading level={3} className={styles.missingTitle}>Missing from library:</Heading>
              <div className={styles.missingList}>
                {series.missingVolumes.map((vol) => (
                  <Text key={vol} variant="text-xs/medium" className={styles.missingVolume}>Vol. {vol}</Text>
                ))}
              </div>
            </div>
          )}

          {series.missingVolumes.length > 10 && (
            <Text variant="text-sm/normal" color="text-muted" tag="p" className={styles.missingNote}>
              {series.missingVolumes.length} volumes not available in the library
            </Text>
          )}
        </div>
      </section>

      <section className={styles.volumesSection}>
        <Heading level={2} className={styles.sectionTitle}>All Volumes</Heading>
        <div className={styles.volumeGrid}>
          {series.volumes.map((volume) => (
            <VolumeRow
              key={volume.volumeNumber}
              volume={volume}
              seriesTitle={series.title}
              onClick={() => {
                if (volume.isbn) {
                  const bookSlug = `${series.slug}-vol-${volume.volumeNumber}`;
                  handleSelectBook(volume.isbn, bookSlug);
                }
              }}
            />
          ))}
        </div>
      </section>

      {/* Debug Panel */}
      <DebugPanel
        debug={series._debug}
        onRefreshWithDebug={!series._debug ? refreshWithDebug : undefined}
        cacheContext={slug ? { type: 'series', identifier: slug } : undefined}
        onClearCache={handleClearCache}
      />
    </div>
  );
}

interface VolumeRowProps {
  volume: VolumeInfo;
  seriesTitle: string;
  onClick: () => void;
}

function VolumeRow({ volume, seriesTitle, onClick }: VolumeRowProps): JSX.Element {
  const isAvailable = volume.availability?.available ?? false;
  const hasISBN = !!volume.isbn;

  return (
    <button
      type="button"
      className={`${styles.volumeRow} ${isAvailable ? styles.available : styles.unavailable}`}
      onClick={onClick}
      disabled={!hasISBN}
    >
      <div className={styles.volumeCover}>
        {volume.coverImage ? (
          <img 
            src={volume.coverImage} 
            alt={`${seriesTitle} Vol. ${volume.volumeNumber}`}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className={styles.volumeCoverPlaceholder}>📖</div>
        )}
      </div>
      <div className={styles.volumeNumber}>
        <Text variant="text-xs/normal" color="text-muted" className={styles.volLabel}>Vol.</Text>
        <Text variant="text-lg/bold" className={styles.volNum}>{volume.volumeNumber}</Text>
      </div>
      
      <div className={styles.volumeInfo}>
        {volume.title && (
          <Text variant="text-sm/medium" className={styles.volumeTitle}>{volume.title}</Text>
        )}
        {volume.isbn && (
          <Text variant="code" color="text-muted" className={styles.volumeIsbn}>ISBN: {volume.isbn}</Text>
        )}
      </div>

      <div className={styles.volumeStatus}>
        {isAvailable ? (
          <>
            <span className={styles.statusDot + ' ' + styles.statusAvailable} />
            <Text variant="text-sm/normal" className={styles.statusText}>
              {volume.availability?.totalCopies} {volume.availability?.totalCopies === 1 ? 'copy' : 'copies'}
            </Text>
          </>
        ) : (
          <>
            <span className={styles.statusDot + ' ' + styles.statusUnavailable} />
            <Text variant="text-sm/normal" color="text-muted" className={styles.statusText}>Not available</Text>
          </>
        )}
      </div>

      {hasISBN && (
        <Text variant="text-sm/medium" color="interactive-primary" className={styles.viewButton}>View →</Text>
      )}
    </button>
  );
}

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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { homeLibrary } = useHomeLibrary();

  const { series, isLoading, error, refreshWithDebug } = useSeriesDetails({
    seriesId: id ?? '',
    homeLibrary,
  });

  const handleBack = () => {
    navigate(-1);
  };

  const handleSelectBook = (isbn: string) => {
    navigate(`/books/${isbn}`);
  };

  const handleClearCache = useCallback(async () => {
    if (id) {
      await clearCacheForSeries(id);
      // Reload to show fresh data
      window.location.reload();
    }
  }, [id]);

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
        <div className={styles.errorContainer}>
          <div className={styles.errorIcon}>⚠️</div>
          <Heading level={2} className={styles.errorTitle}>Unable to load series</Heading>
          <Text variant="text-md/normal" color="text-secondary" tag="p" className={styles.errorMessage}>
            {error ?? 'Series not found'}
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
              <svg className={styles.malIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8.273 7.247v8.423l-2.103-.003v-5.216l-2.03 2.404-1.989-2.458-.02 5.285H.001L0 7.247h2.203l1.865 2.545 2.015-2.546 2.19.001zm8.628 2.069l.025 6.335h-2.229l-.039-3.886c-.009.424-.036.823-.069 1.21-.027.31-.062.617-.096.925-.053.398-.108.78-.191 1.114l-.105.367-.16-.266c-.163-.263-.332-.531-.508-.79-.402-.597-.825-1.161-1.315-1.654l-.076-.08v3.14h-2.199l.011-6.375 2.27.002c.065.095.137.177.204.27.29.378.568.77.823 1.18.216.347.416.705.59 1.076l.1-.201c.211-.443.456-.86.725-1.251.256-.373.535-.72.84-1.028.068-.066.139-.13.21-.193h2.289v-.895zm5.299 5.033c-.06.143-.136.283-.232.417-.096.135-.21.263-.343.378-.133.117-.284.22-.448.305a2.46 2.46 0 0 1-1.075.259c-.378 0-.718-.069-1.025-.208a2.208 2.208 0 0 1-.762-.576 2.57 2.57 0 0 1-.476-.86 3.463 3.463 0 0 1-.168-1.08c0-.378.057-.739.168-1.076.112-.34.273-.64.48-.896.21-.26.462-.467.762-.617.302-.152.644-.228 1.02-.228.392 0 .738.074 1.04.22.303.148.556.346.758.595.203.25.356.538.46.865.102.327.154.672.154 1.037a3.5 3.5 0 0 1-.168 1.08 2.572 2.572 0 0 1-.145.385zm-1.635-2.464c-.18-.235-.42-.352-.72-.352-.298 0-.537.117-.72.352-.183.235-.274.562-.274.98 0 .42.091.745.274.98.183.235.422.352.72.352.3 0 .54-.117.72-.352.183-.235.274-.56.274-.98 0-.418-.091-.745-.274-.98z"/>
              </svg>
              <Text variant="text-sm/medium">MyAnimeList</Text>
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
                  handleSelectBook(volume.isbn);
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
        cacheContext={id ? { type: 'series', identifier: id } : undefined}
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

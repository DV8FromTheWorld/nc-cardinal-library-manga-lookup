/**
 * Series detail page component for web.
 */

import { deriveEditionStatus } from '@repo/shared';
import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Heading } from '../../../design/components/Heading/web/Heading';
import { Text } from '../../../design/components/Text/web/Text';
import { DebugPanel } from '../../debug/web/DebugPanel';
import { clearCacheForSeries } from '../../search/services/mangaApi';
import type { Volume } from '../../search/types';
import { getAvailabilityPercent } from '../../search/utils/availability';
import { getPrimaryIsbn, getVolumeListDisplayInfo } from '../../search/utils/volumeStatus';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { useSeriesDetails } from '../hooks/useSeriesDetails';
import styles from './SeriesPage.module.css';

export function SeriesPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { homeLibrary } = useHomeLibrary();

  const { series, isLoading, error, refreshWithDebug } = useSeriesDetails({
    seriesId: id ?? '',
    homeLibrary,
  });

  const handleBack = (): void => {
    void navigate(-1);
  };

  const handleSelectVolume = (volumeId: string): void => {
    void navigate(`/volumes/${encodeURIComponent(volumeId)}`);
  };

  const handleClearCache = useCallback(async () => {
    if (id != null) {
      await clearCacheForSeries(id);
      // Reload to show fresh data
      window.location.reload();
    }
  }, [id]);

  // Compute summary stats
  const stats = useMemo(() => {
    if (series == null) return null;

    const total = series.volumes.length;
    const withEnglish = series.volumes.filter(
      (v) => deriveEditionStatus(v.editions) !== 'japan_only'
    ).length;
    const inLibrary = series.volumes.filter((v) => v.copyTotals != null).length;
    const available = series.volumes.filter((v) => (v.copyTotals?.available ?? 0) > 0).length;

    return { total, withEnglish, inLibrary, available };
  }, [series]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <Text variant="text-md/normal" color="text-secondary" tag="p">
            Loading series details...
          </Text>
        </div>
      </div>
    );
  }

  if (error != null || series == null) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.backButton} onClick={handleBack}>
          <Text variant="text-sm/medium">← Back to search</Text>
        </button>
        <div className={styles.errorContainer}>
          <div className={styles.errorIcon}>⚠️</div>
          <Heading level={2} className={styles.errorTitle}>
            Unable to load series
          </Heading>
          <Text
            variant="text-md/normal"
            color="text-secondary"
            tag="p"
            className={styles.errorMessage}
          >
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
            <button type="button" className={styles.backButtonSecondary} onClick={handleBack}>
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const availabilityPercent = stats ? getAvailabilityPercent(stats.available, stats.total) : 0;

  return (
    <div className={styles.container}>
      <button type="button" className={styles.backButton} onClick={handleBack}>
        <Text variant="text-sm/medium">← Back to search</Text>
      </button>

      <header className={styles.header}>
        <div className={styles.headerCover}>
          {series.coverImage != null ? (
            <img
              src={series.coverImage}
              alt={`${series.title} cover`}
              onLoad={(e) => {
                // Detect OpenLibrary 1x1 placeholder GIFs and hide them
                const img = e.target as HTMLImageElement;
                if (img.naturalWidth < 10 || img.naturalHeight < 10) {
                  img.style.display = 'none';
                  const placeholder = img.nextElementSibling as HTMLElement;
                  if (placeholder != null) placeholder.style.display = 'flex';
                }
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                const placeholder = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                if (placeholder != null) placeholder.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className={styles.coverPlaceholder}
            style={{ display: series.coverImage != null ? 'none' : 'flex' }}
          >
            📚
          </div>
        </div>
        <div className={styles.headerContent}>
          <Heading level={1} className={styles.title}>
            {series.title}
          </Heading>
          {series.author != null && (
            <Text variant="text-md/normal" color="text-secondary" tag="p" className={styles.author}>
              by {series.author}
            </Text>
          )}
          <div className={styles.badges}>
            {series.isComplete === true && (
              <Text variant="text-xs/semibold" className={styles.completeBadge}>
                ✓ Complete Series
              </Text>
            )}
            <Text variant="text-xs/medium" className={styles.volumeBadge}>
              {stats?.total} volumes
            </Text>
          </div>
          <div className={styles.externalLinks}>
            <a
              href={`https://myanimelist.net/manga.php?q=${encodeURIComponent(series.title)}`}
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
                <path d="M8.45 15.91H6.067v-5.506h-.028l-1.833 2.454-1.796-2.454H2.39v5.507H0V6.808h2.263l1.943 2.671 1.98-2.671H8.45zm8.499 0h-2.384v-2.883H11.96c.008 1.011.373 1.989.914 2.884l-1.942 1.284c-.52-.793-1.415-2.458-1.415-4.527 0-1.015.211-2.942 1.638-4.37a4.809 4.809 0 0 1 2.737-1.37c.96-.15 1.936-.12 2.905-.12l.555 2.051H15.48c-.776 0-1.389.113-1.839.337-.637.32-1.009.622-1.447 1.78h2.372v-1.84h2.384zm3.922-2.05H24l-.555 2.05h-4.962V6.809h2.388z" />
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

      {/* Series Description */}
      {series.description != null && (
        <section className={styles.descriptionSection}>
          <Heading level={2} className={styles.sectionTitle}>
            About
          </Heading>
          <Text variant="text-md/normal" color="text-secondary" className={styles.descriptionText}>
            {series.description}
          </Text>
        </section>
      )}

      <section className={styles.availabilitySection}>
        <Heading level={2} className={styles.sectionTitle}>
          Library Availability
        </Heading>
        <div className={styles.availabilityCard}>
          <div className={styles.availabilityStats}>
            <div className={styles.statLarge}>
              <Text variant="header-2xl/bold" className={styles.statNumber}>
                {stats?.available ?? 0}
              </Text>
              <Text variant="text-md/normal" color="text-secondary" className={styles.statLabel}>
                of {stats?.total ?? 0} available
              </Text>
            </div>
            <div className={styles.availabilityBar}>
              <div
                className={styles.availabilityFill}
                style={{ width: `${availabilityPercent}%` }}
              />
            </div>
            <Text
              variant="text-sm/normal"
              color="text-secondary"
              tag="p"
              className={styles.availabilityPercent}
            >
              {availabilityPercent}% in NC Cardinal
            </Text>
          </div>

          {/* Summary stats breakdown */}
          {stats && (
            <div className={styles.summaryStats}>
              <div className={styles.summaryStat}>
                <Text variant="text-lg/bold">{stats.total}</Text>
                <Text variant="text-xs/normal" color="text-secondary">
                  Total volumes
                </Text>
              </div>
              <div className={styles.summaryStat}>
                <Text variant="text-lg/bold">{stats.withEnglish}</Text>
                <Text variant="text-xs/normal" color="text-secondary">
                  In English
                </Text>
              </div>
              <div className={styles.summaryStat}>
                <Text variant="text-lg/bold">{stats.inLibrary}</Text>
                <Text variant="text-xs/normal" color="text-secondary">
                  In library
                </Text>
              </div>
              <div className={styles.summaryStat}>
                <Text variant="text-lg/bold">{stats.available}</Text>
                <Text variant="text-xs/normal" color="text-secondary">
                  Available now
                </Text>
              </div>
            </div>
          )}

          {series.missingVolumes.length > 0 && series.missingVolumes.length <= 10 && (
            <div className={styles.missingVolumes}>
              <Heading level={3} className={styles.missingTitle}>
                Missing from library:
              </Heading>
              <div className={styles.missingList}>
                {series.missingVolumes.map((vol) => (
                  <Text key={vol} variant="text-xs/medium" className={styles.missingVolume}>
                    Vol. {vol}
                  </Text>
                ))}
              </div>
            </div>
          )}

          {series.missingVolumes.length > 10 && (
            <Text
              variant="text-sm/normal"
              color="text-muted"
              tag="p"
              className={styles.missingNote}
            >
              {series.missingVolumes.length} volumes not available in the library
            </Text>
          )}
        </div>
      </section>

      <section className={styles.volumesSection}>
        <Heading level={2} className={styles.sectionTitle}>
          All Volumes
        </Heading>
        <div className={styles.volumeGrid}>
          {series.volumes.map((volume) => (
            <VolumeRow
              key={volume.id}
              volume={volume}
              seriesTitle={series.title}
              onClick={() => handleSelectVolume(volume.id)}
            />
          ))}
        </div>
      </section>

      {/* Debug Panel */}
      <DebugPanel
        debug={series._debug}
        onRefreshWithDebug={series._debug == null ? refreshWithDebug : undefined}
        cacheContext={id != null ? { type: 'series', identifier: id } : undefined}
        onClearCache={handleClearCache}
      />
    </div>
  );
}

interface VolumeRowProps {
  volume: Volume;
  seriesTitle: string;
  onClick: () => void;
}

function VolumeRow({ volume, seriesTitle, onClick }: VolumeRowProps): JSX.Element {
  const { icon, label, sublabel } = getVolumeListDisplayInfo(volume);
  const isAvailable = (volume.copyTotals?.available ?? 0) > 0;
  const primaryIsbn = getPrimaryIsbn(volume.editions);

  return (
    <button
      type="button"
      className={`${styles.volumeRow} ${isAvailable ? styles.available : styles.unavailable}`}
      onClick={onClick}
    >
      <div className={styles.volumeCover}>
        {volume.coverImage != null ? (
          <img
            src={volume.coverImage}
            alt={`${seriesTitle} Vol. ${volume.volumeNumber}`}
            loading="lazy"
            onLoad={(e) => {
              // Detect OpenLibrary 1x1 placeholder GIFs and hide them
              const img = e.target as HTMLImageElement;
              if (img.naturalWidth < 10 || img.naturalHeight < 10) {
                img.style.display = 'none';
                const placeholder = img.nextElementSibling as HTMLElement;
                if (placeholder != null) placeholder.style.display = 'flex';
              }
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              const placeholder = (e.target as HTMLElement).nextElementSibling as HTMLElement;
              if (placeholder != null) placeholder.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className={styles.volumeCoverPlaceholder}
          style={{ display: volume.coverImage != null ? 'none' : 'flex' }}
        >
          📖
        </div>
      </div>
      <div className={styles.volumeNumber}>
        <Text variant="text-xs/normal" color="text-muted" className={styles.volLabel}>
          Vol.
        </Text>
        <Text variant="text-lg/bold" className={styles.volNum}>
          {volume.volumeNumber}
        </Text>
      </div>

      <div className={styles.volumeInfo}>
        {volume.title != null && (
          <Text variant="text-sm/medium" className={styles.volumeTitle}>
            {volume.title}
          </Text>
        )}
        {primaryIsbn != null && (
          <Text variant="code" color="text-muted" className={styles.volumeIsbn}>
            ISBN: {primaryIsbn}
          </Text>
        )}
      </div>

      <div className={styles.volumeStatus}>
        <span className={styles.statusIcon}>{icon}</span>
        <div className={styles.statusText}>
          <Text variant="text-sm/normal">{label}</Text>
          {sublabel != null && (
            <Text variant="text-xs/normal" color="text-muted">
              {sublabel}
            </Text>
          )}
        </div>
      </div>

      <Text variant="text-sm/medium" color="interactive-primary" className={styles.viewButton}>
        View →
      </Text>
    </button>
  );
}

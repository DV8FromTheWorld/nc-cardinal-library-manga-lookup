import { useState, useEffect, useCallback } from 'react';
import { getSeriesDetails, type SeriesDetails as SeriesDetailsType, type VolumeInfo } from '../../api/manga';
import { DebugPanel } from '../DebugPanel';
import styles from './SeriesDetail.module.css';

interface SeriesDetailProps {
  seriesSlug: string;
  onBack: () => void;
  onSelectBook: (isbn: string, slug?: string) => void;
}

export function SeriesDetail({ seriesSlug, onBack, onSelectBook }: SeriesDetailProps): JSX.Element {
  const [series, setSeries] = useState<SeriesDetailsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeries = useCallback(async (debug = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getSeriesDetails(seriesSlug, { debug });
      setSeries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setIsLoading(false);
    }
  }, [seriesSlug]);

  useEffect(() => {
    fetchSeries(false);
  }, [fetchSeries]);
  
  const refreshWithDebug = useCallback(() => {
    fetchSeries(true);
  }, [fetchSeries]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <p>Loading series details...</p>
        </div>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← Back to search
        </button>
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠</span>
          {error ?? 'Series not found'}
        </div>
      </div>
    );
  }

  const availabilityPercent = Math.round((series.availableCount / series.totalVolumes) * 100);

  return (
    <div className={styles.container}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        ← Back to search
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
          <h1 className={styles.title}>{series.title}</h1>
          {series.author && (
            <p className={styles.author}>by {series.author}</p>
          )}
          <div className={styles.badges}>
            {series.isComplete && (
              <span className={styles.completeBadge}>✓ Complete Series</span>
            )}
            <span className={styles.volumeBadge}>{series.totalVolumes} volumes</span>
          </div>
          <p className={styles.seriesId}>ID: {series.id}</p>
        </div>
      </header>

      <section className={styles.availabilitySection}>
        <h2 className={styles.sectionTitle}>Library Availability</h2>
        <div className={styles.availabilityCard}>
          <div className={styles.availabilityStats}>
            <div className={styles.statLarge}>
              <span className={styles.statNumber}>{series.availableCount}</span>
              <span className={styles.statLabel}>of {series.totalVolumes} available</span>
            </div>
            <div className={styles.availabilityBar}>
              <div 
                className={styles.availabilityFill}
                style={{ width: `${availabilityPercent}%` }}
              />
            </div>
            <p className={styles.availabilityPercent}>{availabilityPercent}% in NC Cardinal</p>
          </div>

          {series.missingVolumes.length > 0 && series.missingVolumes.length <= 10 && (
            <div className={styles.missingVolumes}>
              <h3 className={styles.missingTitle}>Missing from library:</h3>
              <div className={styles.missingList}>
                {series.missingVolumes.map((vol) => (
                  <span key={vol} className={styles.missingVolume}>Vol. {vol}</span>
                ))}
              </div>
            </div>
          )}

          {series.missingVolumes.length > 10 && (
            <p className={styles.missingNote}>
              {series.missingVolumes.length} volumes not available in the library
            </p>
          )}
        </div>
      </section>

      <section className={styles.volumesSection}>
        <h2 className={styles.sectionTitle}>All Volumes</h2>
        <div className={styles.volumeGrid}>
          {series.volumes.map((volume) => (
            <VolumeRow
              key={volume.volumeNumber}
              volume={volume}
              seriesTitle={series.title}
              onClick={() => {
                if (volume.isbn) {
                  // Create SEO-friendly slug
                  const slug = `${series.slug}-vol-${volume.volumeNumber}`;
                  onSelectBook(volume.isbn, slug);
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
      {volume.coverImage && (
        <div className={styles.volumeCover}>
          <img 
            src={volume.coverImage} 
            alt={`${seriesTitle} Vol. ${volume.volumeNumber}`}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className={styles.volumeNumber}>
        <span className={styles.volLabel}>Vol.</span>
        <span className={styles.volNum}>{volume.volumeNumber}</span>
      </div>
      
      <div className={styles.volumeInfo}>
        {volume.title && (
          <span className={styles.volumeTitle}>{volume.title}</span>
        )}
        {volume.isbn && (
          <span className={styles.volumeIsbn}>ISBN: {volume.isbn}</span>
        )}
      </div>

      <div className={styles.volumeStatus}>
        {isAvailable ? (
          <>
            <span className={styles.statusDot + ' ' + styles.statusAvailable} />
            <span className={styles.statusText}>
              {volume.availability?.totalCopies} {volume.availability?.totalCopies === 1 ? 'copy' : 'copies'}
            </span>
          </>
        ) : (
          <>
            <span className={styles.statusDot + ' ' + styles.statusUnavailable} />
            <span className={styles.statusText}>Not available</span>
          </>
        )}
      </div>

      {hasISBN && (
        <span className={styles.viewButton}>View →</span>
      )}
    </button>
  );
}

/**
 * Debug panel component for displaying API debug information.
 */

import { useState } from 'react';
import type { DebugInfo } from '../types';
import { Text } from '../../../design/components/Text/web/Text';
import styles from './DebugPanel.module.css';

interface DebugPanelProps {
  debug: DebugInfo | undefined;
  onRefreshWithDebug?: (() => void) | undefined;
  /** Context for cache clearing - e.g., { type: 'book', isbn: '123' } */
  cacheContext?: {
    type: 'book' | 'series' | 'search';
    identifier: string;
  } | undefined;
  onClearCache?: ((type: string, identifier?: string) => Promise<void>) | undefined;
}

export function DebugPanel({ debug, onRefreshWithDebug, cacheContext, onClearCache }: DebugPanelProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Show panel if we have debug info, can refresh, or can clear cache
  if (!debug && !onRefreshWithDebug && !cacheContext) {
    return <></>;
  }

  const handleClearCache = async () => {
    if (!onClearCache || !cacheContext) return;
    setIsClearingCache(true);
    try {
      await onClearCache(cacheContext.type, cacheContext.identifier);
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Text variant="text-sm/medium">🛠️ Debug {isExpanded ? '▲' : '▼'}</Text>
      </button>

      {isExpanded && (
        <div className={styles.panel}>
          {!debug && onRefreshWithDebug && (
            <button
              type="button"
              className={styles.loadDebugButton}
              onClick={onRefreshWithDebug}
            >
              <Text variant="text-sm/medium">Load Debug Info</Text>
            </button>
          )}

          {/* Context-aware cache clearing */}
          {cacheContext && onClearCache && (
            <button
              type="button"
              className={styles.cacheButton}
              onClick={handleClearCache}
              disabled={isClearingCache}
            >
              <Text variant="text-sm/medium">
                {isClearingCache
                  ? 'Clearing...'
                  : `🗑️ Clear cache for this ${cacheContext.type}`}
              </Text>
            </button>
          )}

          {debug && (
            <>
              {/* Data Issues - Show prominently if any */}
              {debug.dataIssues && debug.dataIssues.length > 0 && (
                <div className={styles.section}>
                  <Text variant="text-sm/semibold" tag="div" className={styles.sectionTitle}>⚠️ Data Issues</Text>
                  <ul className={styles.warningList}>
                    {debug.dataIssues.map((issue, i) => (
                      <Text key={i} variant="text-xs/normal" tag="li" className={styles.warningItem}>
                        {issue}
                      </Text>
                    ))}
                  </ul>
                </div>
              )}

              {/* Source Summary */}
              {debug.sourceSummary && (
                <div className={styles.section}>
                  <Text variant="text-sm/semibold" tag="div" className={styles.sectionTitle}>Source Summary</Text>
                  <div className={styles.sourceSummary}>
                    {debug.sourceSummary.wikipedia && (
                      <div className={`${styles.sourceCard} ${debug.sourceSummary.wikipedia.found ? styles.sourceFound : styles.sourceNotFound}`}>
                        <Text variant="text-xs/bold" tag="strong">Wikipedia</Text>
                        {debug.sourceSummary.wikipedia.found ? (
                          <Text variant="text-xs/normal">✅ {debug.sourceSummary.wikipedia.seriesTitle} ({debug.sourceSummary.wikipedia.volumeCount} vols)</Text>
                        ) : (
                          <Text variant="text-xs/normal">❌ {debug.sourceSummary.wikipedia.error || 'Not found'}</Text>
                        )}
                      </div>
                    )}
                    {debug.sourceSummary.googleBooks && (
                      <div className={`${styles.sourceCard} ${debug.sourceSummary.googleBooks.found ? styles.sourceFound : styles.sourceNotFound}`}>
                        <Text variant="text-xs/bold" tag="strong">Google Books</Text>
                        {debug.sourceSummary.googleBooks.found ? (
                          <Text variant="text-xs/normal">✅ {debug.sourceSummary.googleBooks.volumesReturned} vols ({debug.sourceSummary.googleBooks.volumesWithSeriesId} with seriesId)</Text>
                        ) : (
                          <Text variant="text-xs/normal">❌ {debug.sourceSummary.googleBooks.error || 'Not found'}</Text>
                        )}
                      </div>
                    )}
                    {debug.sourceSummary.ncCardinal && (
                      <div className={`${styles.sourceCard} ${debug.sourceSummary.ncCardinal.found ? styles.sourceFound : styles.sourceNotFound}`}>
                        <Text variant="text-xs/bold" tag="strong">NC Cardinal</Text>
                        {debug.sourceSummary.ncCardinal.found ? (
                          <Text variant="text-xs/normal">✅ {debug.sourceSummary.ncCardinal.volumesExtracted} vols from {debug.sourceSummary.ncCardinal.recordCount} records</Text>
                        ) : (
                          <Text variant="text-xs/normal">❌ {debug.sourceSummary.ncCardinal.error || 'Not found'}</Text>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.section}>
                <Text variant="text-sm/semibold" tag="div" className={styles.sectionTitle}>Timing</Text>
                <div className={styles.timingGrid}>
                  <div className={styles.timingItem}>
                    <Text variant="code" className={styles.timingValue}>{debug.timing.total}ms</Text>
                    <Text variant="text-xs/normal" color="text-muted" className={styles.timingLabel}>Total</Text>
                  </div>
                  {debug.timing.wikipedia !== undefined && (
                    <div className={styles.timingItem}>
                      <Text variant="code" className={styles.timingValue}>{debug.timing.wikipedia}ms</Text>
                      <Text variant="text-xs/normal" color="text-muted" className={styles.timingLabel}>Wikipedia</Text>
                    </div>
                  )}
                  {debug.timing.googleBooks !== undefined && (
                    <div className={styles.timingItem}>
                      <Text variant="code" className={styles.timingValue}>{debug.timing.googleBooks}ms</Text>
                      <Text variant="text-xs/normal" color="text-muted" className={styles.timingLabel}>Google Books</Text>
                    </div>
                  )}
                  {debug.timing.ncCardinal !== undefined && (
                    <div className={styles.timingItem}>
                      <Text variant="code" className={styles.timingValue}>{debug.timing.ncCardinal}ms</Text>
                      <Text variant="text-xs/normal" color="text-muted" className={styles.timingLabel}>NC Cardinal</Text>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.section}>
                <Text variant="text-sm/semibold" tag="div" className={styles.sectionTitle}>Sources Used</Text>
                <div className={styles.tags}>
                  {debug.sources.map((source) => (
                    <Text key={source} variant="text-xs/medium" className={styles.sourceTag}>
                      {source}
                    </Text>
                  ))}
                </div>
              </div>

              {/* Log entries - collapsible */}
              {debug.log && debug.log.length > 0 && (
                <div className={styles.section}>
                  <details>
                    <Text variant="text-sm/semibold" tag="summary" className={styles.sectionTitle}>📋 Event Log ({debug.log.length} entries)</Text>
                    <ul className={styles.logList}>
                      {debug.log.map((entry, i) => (
                        <Text key={i} variant="code" tag="li" className={styles.logItem}>
                          {entry}
                        </Text>
                      ))}
                    </ul>
                  </details>
                </div>
              )}

              {debug.cacheHits.length > 0 && (
                <div className={styles.section}>
                  <Text variant="text-sm/semibold" tag="div" className={styles.sectionTitle}>Cache Hits</Text>
                  <div className={styles.tags}>
                    {debug.cacheHits.map((hit, i) => (
                      <Text key={i} variant="text-xs/medium" className={styles.cacheTag}>
                        {hit}
                      </Text>
                    ))}
                  </div>
                </div>
              )}

              {debug.errors.length > 0 && (
                <div className={styles.section}>
                  <Text variant="text-sm/semibold" tag="div" className={styles.sectionTitle}>🚨 Errors</Text>
                  <ul className={styles.errorList}>
                    {debug.errors.map((error, i) => (
                      <Text key={i} variant="text-xs/normal" color="error" tag="li" className={styles.errorItem}>
                        {error}
                      </Text>
                    ))}
                  </ul>
                </div>
              )}

              {debug.warnings.length > 0 && (
                <div className={styles.section}>
                  <Text variant="text-sm/semibold" tag="div" className={styles.sectionTitle}>Warnings</Text>
                  <ul className={styles.warningList}>
                    {debug.warnings.map((warning, i) => (
                      <Text key={i} variant="text-xs/normal" color="warning" tag="li" className={styles.warningItem}>
                        {warning}
                      </Text>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

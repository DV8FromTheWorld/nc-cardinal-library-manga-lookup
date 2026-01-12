import { useState } from 'react';
import type { DebugInfo } from '../../api/manga';
import styles from './DebugPanel.module.css';

interface DebugPanelProps {
  debug: DebugInfo | undefined;
  onRefreshWithDebug?: (() => void) | undefined;
}

export function DebugPanel({ debug, onRefreshWithDebug }: DebugPanelProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!debug && !onRefreshWithDebug) {
    return <></>;
  }

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        🛠️ Debug {isExpanded ? '▲' : '▼'}
      </button>

      {isExpanded && (
        <div className={styles.panel}>
          {!debug && onRefreshWithDebug && (
            <button
              type="button"
              className={styles.loadDebugButton}
              onClick={onRefreshWithDebug}
            >
              Load Debug Info
            </button>
          )}

          {debug && (
            <>
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Timing</h4>
                <div className={styles.timingGrid}>
                  <div className={styles.timingItem}>
                    <span className={styles.timingValue}>{debug.timing.total}ms</span>
                    <span className={styles.timingLabel}>Total</span>
                  </div>
                  {debug.timing.wikipedia !== undefined && (
                    <div className={styles.timingItem}>
                      <span className={styles.timingValue}>{debug.timing.wikipedia}ms</span>
                      <span className={styles.timingLabel}>Wikipedia</span>
                    </div>
                  )}
                  {debug.timing.googleBooks !== undefined && (
                    <div className={styles.timingItem}>
                      <span className={styles.timingValue}>{debug.timing.googleBooks}ms</span>
                      <span className={styles.timingLabel}>Google Books</span>
                    </div>
                  )}
                  {debug.timing.ncCardinal !== undefined && (
                    <div className={styles.timingItem}>
                      <span className={styles.timingValue}>{debug.timing.ncCardinal}ms</span>
                      <span className={styles.timingLabel}>NC Cardinal</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Sources Used</h4>
                <div className={styles.tags}>
                  {debug.sources.map((source) => (
                    <span key={source} className={styles.sourceTag}>
                      {source}
                    </span>
                  ))}
                </div>
              </div>

              {debug.cacheHits.length > 0 && (
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Cache Hits</h4>
                  <div className={styles.tags}>
                    {debug.cacheHits.map((hit, i) => (
                      <span key={i} className={styles.cacheTag}>
                        {hit}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {debug.errors.length > 0 && (
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Errors</h4>
                  <ul className={styles.errorList}>
                    {debug.errors.map((error, i) => (
                      <li key={i} className={styles.errorItem}>
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {debug.warnings.length > 0 && (
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Warnings</h4>
                  <ul className={styles.warningList}>
                    {debug.warnings.map((warning, i) => (
                      <li key={i} className={styles.warningItem}>
                        {warning}
                      </li>
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

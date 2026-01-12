/**
 * Debug panel component for displaying API debug information on React Native.
 */

import { useState } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import type { DebugInfo } from '../types';
import { Text } from '../../../design/components/Text/native/Text';
import { colors, spacing } from '../../search/native/theme';

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

export function DebugPanel({
  debug,
  onRefreshWithDebug,
  cacheContext,
  onClearCache,
}: DebugPanelProps): JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  // Show panel if we have debug info, can refresh, or can clear cache
  if (!debug && !onRefreshWithDebug && !cacheContext) {
    return null;
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
    <View style={[styles.container, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <Text variant="text-sm/medium" color="text-primary">
          🛠️ Debug {isExpanded ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.panel}>
          {!debug && onRefreshWithDebug && (
            <TouchableOpacity
              style={[styles.loadButton, { backgroundColor: theme.accent }]}
              onPress={onRefreshWithDebug}
            >
              <RNText style={styles.loadButtonText}>Load Debug Info</RNText>
            </TouchableOpacity>
          )}

          {/* Cache clearing for current context */}
          {cacheContext && onClearCache && (
            <TouchableOpacity
              style={[styles.cacheButton, { backgroundColor: theme.bgTertiary }]}
              onPress={handleClearCache}
              disabled={isClearingCache}
            >
              <Text variant="text-sm/normal" color="text-primary">
                {isClearingCache
                  ? 'Clearing...'
                  : `🗑️ Clear cache for this ${cacheContext.type}`}
              </Text>
            </TouchableOpacity>
          )}

          {debug && (
            <ScrollView style={styles.debugContent} showsVerticalScrollIndicator={false}>
              {/* Data Issues - Show prominently */}
              {debug.dataIssues && debug.dataIssues.length > 0 && (
                <View style={styles.section}>
                  <Text variant="text-sm/semibold" color="warning">⚠️ Data Issues</Text>
                  {debug.dataIssues.map((issue, i) => (
                    <Text key={i} variant="text-xs/normal" color="warning" style={styles.listItem}>
                      • {issue}
                    </Text>
                  ))}
                </View>
              )}

              {/* Source Summary */}
              {debug.sourceSummary && (
                <View style={styles.section}>
                  <Text variant="text-sm/semibold" color="text-primary">Source Summary</Text>
                  {debug.sourceSummary.wikipedia && (
                    <View style={[styles.sourceCard, { backgroundColor: debug.sourceSummary.wikipedia.found ? theme.successBg : theme.errorBg }]}>
                      <Text variant="text-xs/semibold" color="text-primary" style={styles.sourceLabel}>Wikipedia</Text>
                      <Text variant="text-xs/normal" color={debug.sourceSummary.wikipedia.found ? 'success' : 'error'} style={styles.sourceValue}>
                        {debug.sourceSummary.wikipedia.found
                          ? `✅ ${debug.sourceSummary.wikipedia.seriesTitle} (${debug.sourceSummary.wikipedia.volumeCount} vols)`
                          : `❌ ${debug.sourceSummary.wikipedia.error || 'Not found'}`}
                      </Text>
                    </View>
                  )}
                  {debug.sourceSummary.googleBooks && (
                    <View style={[styles.sourceCard, { backgroundColor: debug.sourceSummary.googleBooks.found ? theme.successBg : theme.errorBg }]}>
                      <Text variant="text-xs/semibold" color="text-primary" style={styles.sourceLabel}>Google Books</Text>
                      <Text variant="text-xs/normal" color={debug.sourceSummary.googleBooks.found ? 'success' : 'error'} style={styles.sourceValue}>
                        {debug.sourceSummary.googleBooks.found
                          ? `✅ ${debug.sourceSummary.googleBooks.volumesReturned} vols (${debug.sourceSummary.googleBooks.volumesWithSeriesId} with ID)`
                          : `❌ ${debug.sourceSummary.googleBooks.error || 'Not found'}`}
                      </Text>
                    </View>
                  )}
                  {debug.sourceSummary.ncCardinal && (
                    <View style={[styles.sourceCard, { backgroundColor: debug.sourceSummary.ncCardinal.found ? theme.successBg : theme.errorBg }]}>
                      <Text variant="text-xs/semibold" color="text-primary" style={styles.sourceLabel}>NC Cardinal</Text>
                      <Text variant="text-xs/normal" color={debug.sourceSummary.ncCardinal.found ? 'success' : 'error'} style={styles.sourceValue}>
                        {debug.sourceSummary.ncCardinal.found
                          ? `✅ ${debug.sourceSummary.ncCardinal.volumesExtracted} vols from ${debug.sourceSummary.ncCardinal.recordCount} records`
                          : `❌ ${debug.sourceSummary.ncCardinal.error || 'Not found'}`}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Timing Section */}
              <View style={styles.section}>
                <Text variant="text-sm/semibold" color="text-primary">Timing</Text>
                <View style={styles.timingGrid}>
                  <TimingItem label="Total" value={debug.timing.total} theme={theme} />
                  {debug.timing.wikipedia !== undefined && (
                    <TimingItem label="Wikipedia" value={debug.timing.wikipedia} theme={theme} />
                  )}
                  {debug.timing.googleBooks !== undefined && (
                    <TimingItem label="Google Books" value={debug.timing.googleBooks} theme={theme} />
                  )}
                  {debug.timing.ncCardinal !== undefined && (
                    <TimingItem label="NC Cardinal" value={debug.timing.ncCardinal} theme={theme} />
                  )}
                </View>
              </View>

              {/* Sources Section */}
              <View style={styles.section}>
                <Text variant="text-sm/semibold" color="text-primary">Sources Used</Text>
                <View style={styles.tagsContainer}>
                  {debug.sources.map((source) => (
                    <View key={source} style={[styles.tag, { backgroundColor: theme.bgTertiary }]}>
                      <Text variant="text-xs/normal" color="text-secondary">{source}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Log entries */}
              {debug.log && debug.log.length > 0 && (
                <View style={styles.section}>
                  <Text variant="text-sm/semibold" color="text-primary">📋 Event Log ({debug.log.length})</Text>
                  {debug.log.map((entry, i) => (
                    <Text key={i} variant="code" color="text-muted" style={styles.logText}>
                      {entry}
                    </Text>
                  ))}
                </View>
              )}

              {/* Cache Hits Section */}
              {debug.cacheHits.length > 0 && (
                <View style={styles.section}>
                  <Text variant="text-sm/semibold" color="text-primary">Cache Hits</Text>
                  <View style={styles.tagsContainer}>
                    {debug.cacheHits.map((hit, i) => (
                      <View key={i} style={[styles.tag, { backgroundColor: theme.successBg }]}>
                        <Text variant="text-xs/normal" color="success">{hit}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Errors Section */}
              {debug.errors.length > 0 && (
                <View style={styles.section}>
                  <Text variant="text-sm/semibold" color="error">🚨 Errors</Text>
                  {debug.errors.map((error, i) => (
                    <Text key={i} variant="text-xs/normal" color="error" style={styles.listItem}>
                      • {error}
                    </Text>
                  ))}
                </View>
              )}

              {/* Warnings Section */}
              {debug.warnings.length > 0 && (
                <View style={styles.section}>
                  <Text variant="text-sm/semibold" color="text-secondary">Warnings</Text>
                  {debug.warnings.map((warning, i) => (
                    <Text key={i} variant="text-xs/normal" color="text-muted" style={styles.listItem}>
                      • {warning}
                    </Text>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

interface TimingItemProps {
  label: string;
  value: number;
  theme: typeof colors.light;
}

function TimingItem({ label, value, theme }: TimingItemProps): JSX.Element {
  return (
    <View style={styles.timingItem}>
      <Text variant="header-sm/bold" color="text-primary">{value}ms</Text>
      <Text variant="text-xs/normal" color="text-muted">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleButton: {
    padding: spacing.md,
    alignItems: 'center',
  },
  panel: {
    padding: spacing.md,
    paddingTop: 0,
  },
  loadButton: {
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cacheButton: {
    padding: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  debugContent: {
    maxHeight: 300,
  },
  section: {
    marginBottom: spacing.md,
  },
  listItem: {
    marginBottom: spacing.xs,
  },
  timingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  timingItem: {
    alignItems: 'center',
    minWidth: 70,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  sourceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: 8,
    marginTop: spacing.xs,
  },
  sourceLabel: {
    minWidth: 80,
  },
  sourceValue: {
    flex: 1,
    textAlign: 'right',
  },
  logText: {
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
